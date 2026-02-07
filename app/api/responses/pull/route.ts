// app/api/responses/pull/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  platform: string;
  page_id: string | null;
  page_access_token: string | null;
  is_active: boolean | null;
  organisation_id: string;
};

function okJson(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function norm(v: any) {
  return String(v || "").trim();
}

function safeIso(s: any) {
  const t = String(s || "").trim();
  if (!t) return null;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function loadActiveAccounts(organisationId: string): Promise<SocialAccountRow[]> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("platform, page_id, page_access_token, is_active, organisation_id")
    .eq("organisation_id", organisationId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);
  return (data as any[]) || [];
}

async function graphGet(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function upsertInboxItems(rows: any[]) {
  if (!rows.length) return { upserted: 0 };

  const { error } = await supabaseAdmin
    .from("inbox_items")
    .upsert(rows, { onConflict: "organisation_id,platform,external_id" });

  if (error) throw new Error(error.message);
  return { upserted: rows.length };
}

/**
 * Convert USER token -> PAGE token, then persist it.
 */
async function resolveFacebookPageToken(opts: {
  organisationId: string;
  pageId: string;
  maybeUserOrPageToken: string;
  apiVer: string;
}) {
  const { organisationId, pageId, maybeUserOrPageToken, apiVer } = opts;

  const url =
    `https://graph.facebook.com/${apiVer}/${encodeURIComponent(pageId)}` +
    `?fields=access_token&access_token=${encodeURIComponent(maybeUserOrPageToken)}`;

  const r = await graphGet(url);

  const pageToken = norm(r.json?.access_token);
  if (r.ok && pageToken) {
    await supabaseAdmin
      .from("social_accounts")
      .update({
        page_access_token: pageToken,
        updated_at: new Date().toISOString(),
      })
      .eq("organisation_id", organisationId)
      .eq("platform", "facebook");

    return { ok: true, token: pageToken, upgraded: pageToken !== maybeUserOrPageToken };
  }

  return {
    ok: false,
    token: maybeUserOrPageToken,
    upgraded: false,
    error: r.json?.error?.message || "Could not resolve Page access token",
    status: r.status,
    details: r.json,
  };
}

async function pullFacebook(organisationId: string, pageId: string, storedToken: string, sinceDays: number) {
  const API_VER = "v24.0";

  const tokenInfo = await resolveFacebookPageToken({
    organisationId,
    pageId,
    maybeUserOrPageToken: storedToken,
    apiVer: API_VER,
  });

  const token = tokenInfo.token;

  const sinceUnix = Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000);

  // ✅ Pull from BOTH /posts and /feed, then dedupe
  const postsUrl =
    `https://graph.facebook.com/${API_VER}/${encodeURIComponent(pageId)}/posts` +
    `?fields=id,message,permalink_url,created_time&limit=25&access_token=${encodeURIComponent(token)}`;

  const feedUrl =
    `https://graph.facebook.com/${API_VER}/${encodeURIComponent(pageId)}/feed` +
    `?fields=id,message,permalink_url,created_time&limit=25&access_token=${encodeURIComponent(token)}`;

  const [postsRes, feedRes] = await Promise.all([graphGet(postsUrl), graphGet(feedUrl)]);

  if (!postsRes.ok && !feedRes.ok) {
    return {
      ok: false,
      platform: "facebook",
      error: postsRes.json?.error?.message || feedRes.json?.error?.message || "Facebook posts/feed fetch failed",
      status: postsRes.status || feedRes.status,
      details: { posts: postsRes.json, feed: feedRes.json },
      tokenUpgraded: tokenInfo.upgraded,
      hint:
        "If this fails, the saved token still isn’t usable for this Page. Ensure you granted pages_read_engagement + pages_read_user_content + pages_manage_posts and connected the correct Page.",
    };
  }

  const postsA: any[] = Array.isArray(postsRes.json?.data) ? postsRes.json.data : [];
  const postsB: any[] = Array.isArray(feedRes.json?.data) ? feedRes.json.data : [];
  const merged = [...postsA, ...postsB];

  const seen: Record<string, boolean> = {};
  const posts: any[] = [];
  for (const p of merged) {
    const id = norm(p?.id);
    if (!id) continue;
    if (seen[id]) continue;
    seen[id] = true;
    posts.push(p);
  }

  const upsertRows: any[] = [];
  const perPostErrors: any[] = [];
  const perPostStats: any[] = [];

  for (const p of posts) {
    const postId = norm(p?.id);
    if (!postId) continue;

    const postText = typeof p?.message === "string" ? p.message : null;
    const postPermalink = typeof p?.permalink_url === "string" ? p.permalink_url : null;
    const postCreated = safeIso(p?.created_time);

    // ✅ Add summary + stream filter for better signal
    const commentsUrl =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(postId)}/comments` +
      `?fields=id,message,from,created_time,permalink_url&limit=100&since=${sinceUnix}&filter=stream&summary=1&access_token=${encodeURIComponent(
        token
      )}`;

    const commentsRes = await graphGet(commentsUrl);

    if (!commentsRes.ok) {
      perPostErrors.push({
        postId,
        postPermalink,
        postCreated,
        error: commentsRes.json?.error?.message || "Comments fetch failed",
        status: commentsRes.status,
      });
      continue;
    }

    const totalCount = Number(commentsRes.json?.summary?.total_count ?? 0);
    const items: any[] = Array.isArray(commentsRes.json?.data) ? commentsRes.json.data : [];

    perPostStats.push({
      postId,
      postPermalink,
      postCreated,
      commentsReturned: items.length,
      commentsTotalCount: totalCount,
    });

    for (const c of items) {
      const commentId = norm(c?.id);
      const text = norm(c?.message);
      if (!commentId || !text) continue;

      const fromName = c?.from?.name ? String(c.from.name) : null;
      const createdAt = safeIso(c?.created_time);
      const permalink = typeof c?.permalink_url === "string" ? c.permalink_url : postPermalink;

      upsertRows.push({
        organisation_id: organisationId,
        platform: "facebook",
        status: "needs_reply",
        kind: "comment",
        external_id: commentId,
        post_id: postId,
        post_text: postText,
        author_name: fromName,
        author_handle: null,
        text,
        permalink,
        created_at_platform: createdAt,
        raw: c,
      });
    }
  }

  const up = await upsertInboxItems(upsertRows);

  return {
    ok: true,
    platform: "facebook",
    tokenUpgraded: tokenInfo.upgraded,
    sinceDays,
    postsSeen: posts.length,
    pulled: up.upserted,
    perPostErrors,
    // ✅ This is the money: you’ll SEE whether FB thinks there are comments or not
    debug: {
      sources: {
        postsOk: postsRes.ok,
        feedOk: feedRes.ok,
        postsCount: postsA.length,
        feedCount: postsB.length,
      },
      topPosts: perPostStats.slice(0, 12),
    },
    note:
      up.upserted === 0
        ? "Facebook posts were fetched but no comments were returned. Check debug.topPosts: if commentsTotalCount > 0 but commentsReturned = 0, the comment is likely on a different object (profile post, different Page, or not accessible)."
        : undefined,
  };
}

async function pullInstagram(organisationId: string, igUserId: string, token: string) {
  const API_VER = "v24.0";

  const mediaUrl =
    `https://graph.facebook.com/${API_VER}/${encodeURIComponent(igUserId)}/media` +
    `?fields=id,caption,permalink,timestamp&limit=12&access_token=${encodeURIComponent(token)}`;

  const media = await graphGet(mediaUrl);
  if (!media.ok) {
    return {
      ok: false,
      platform: "instagram",
      error: media.json?.error?.message || "Instagram media fetch failed",
      status: media.status,
      details: media.json,
    };
  }

  const mediaItems: any[] = Array.isArray(media.json?.data) ? media.json.data : [];
  const upsertRows: any[] = [];

  for (const m of mediaItems) {
    const mediaId = norm(m?.id);
    if (!mediaId) continue;

    const postText = typeof m?.caption === "string" ? m.caption : null;
    const postPermalink = typeof m?.permalink === "string" ? m.permalink : null;

    const commentsUrl =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(mediaId)}/comments` +
      `?fields=id,text,username,timestamp,permalink&limit=50&access_token=${encodeURIComponent(token)}`;

    const comments = await graphGet(commentsUrl);
    if (!comments.ok) continue;

    const items: any[] = Array.isArray(comments.json?.data) ? comments.json.data : [];
    for (const c of items) {
      const commentId = norm(c?.id);
      const text = norm(c?.text);
      if (!commentId || !text) continue;

      const username = c?.username ? String(c.username) : null;
      const createdAt = safeIso(c?.timestamp);
      const permalink = typeof c?.permalink === "string" ? c.permalink : postPermalink;

      upsertRows.push({
        organisation_id: organisationId,
        platform: "instagram",
        status: "needs_reply",
        kind: "comment",
        external_id: commentId,
        post_id: mediaId,
        post_text: postText,
        author_name: null,
        author_handle: username,
        text,
        permalink,
        created_at_platform: createdAt,
        raw: c,
      });
    }
  }

  const up = await upsertInboxItems(upsertRows);
  return { ok: true, platform: "instagram", pulled: up.upserted, mediaSeen: mediaItems.length };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const organisationId = norm(body?.organisationId);

    // You can override to test older comments:
    // POST { organisationId, sinceDays: 30 }
    const sinceDaysRaw = Number(body?.sinceDays ?? 14);
    const sinceDays = Math.max(1, Math.min(90, isNaN(sinceDaysRaw) ? 14 : sinceDaysRaw));

    if (!organisationId) {
      return okJson({ success: false, error: "Missing organisationId" }, 400);
    }

    const accounts = await loadActiveAccounts(organisationId);

    const fb = accounts.find((a) => a.platform === "facebook");
    const ig = accounts.find((a) => a.platform === "instagram");

    const results: any[] = [];

    if (fb?.page_id && fb?.page_access_token) {
      results.push(await pullFacebook(organisationId, fb.page_id, fb.page_access_token, sinceDays));
    } else {
      results.push({
        ok: false,
        platform: "facebook",
        error: "Facebook not connected (missing page_id or token).",
      });
    }

    if (ig?.page_id && ig?.page_access_token) {
      results.push(await pullInstagram(organisationId, ig.page_id, ig.page_access_token));
    } else {
      results.push({
        ok: false,
        platform: "instagram",
        error: "Instagram not connected (missing ig_user_id/page_id or token).",
      });
    }

    const pulled = results
      .filter((r) => r?.ok && typeof r?.pulled === "number")
      .reduce((sum, r) => sum + Number(r.pulled || 0), 0);

    return okJson({
      success: true,
      organisationId,
      pulled,
      results,
      note:
        "Pulled latest comments and stored them in Supabase (inbox_items). Facebook now includes debug.topPosts with comment counts so we can see why FB=0.",
    });
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Pull failed" }, 500);
  }
}
