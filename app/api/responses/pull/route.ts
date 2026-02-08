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

  // Upsert by unique index (org_id + platform + external_id)
  const { error } = await supabaseAdmin
    .from("inbox_items")
    .upsert(rows, { onConflict: "organisation_id,platform,external_id" });

  if (error) throw new Error(error.message);
  return { upserted: rows.length };
}

/**
 * ✅ Convert a USER token to a PAGE token (for the selected page_id),
 * then save it back into social_accounts so future pulls work.
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

function safeArr<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

async function pullFacebook(organisationId: string, pageId: string, storedToken: string, sinceDays: number) {
  const API_VER = "v24.0";

  // ✅ upgrade token if needed
  const tokenInfo = await resolveFacebookPageToken({
    organisationId,
    pageId,
    maybeUserOrPageToken: storedToken,
    apiVer: API_VER,
  });

  const token = tokenInfo.token;

  const sinceUnix = Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000);

  /**
   * ✅ KEY FIX:
   * Pull from /feed WITH attachments.target.id
   * Because photo posts often have comments on the PHOTO object, not the feed object.
   */
  const feedUrl =
    `https://graph.facebook.com/${API_VER}/${encodeURIComponent(pageId)}/feed` +
    `?fields=` +
    encodeURIComponent(
      [
        "id",
        "message",
        "permalink_url",
        "created_time",
        "attachments{target{id},type,media_type,url}",
        "comments.limit(0).summary(true)",
      ].join(",")
    ) +
    `&limit=25&since=${sinceUnix}&access_token=${encodeURIComponent(token)}`;

  const feedRes = await graphGet(feedUrl);

  if (!feedRes.ok) {
    return {
      ok: false,
      platform: "facebook",
      error: feedRes.json?.error?.message || "Facebook feed fetch failed",
      status: feedRes.status,
      details: feedRes.json,
      tokenUpgraded: tokenInfo.upgraded,
      hint:
        "If this fails, the saved token still isn’t usable for this Page. Ensure you granted pages_read_engagement + pages_read_user_content + pages_manage_posts.",
    };
  }

  const feedItems: any[] = safeArr(feedRes.json?.data);
  const upsertRows: any[] = [];
  const perPostErrors: any[] = [];

  // Debug view you can inspect in the browser console
  const debugTopPosts: any[] = [];

  for (const p of feedItems) {
    const feedId = norm(p?.id);
    if (!feedId) continue;

    const postText = typeof p?.message === "string" ? p.message : null;
    const postPermalink = typeof p?.permalink_url === "string" ? p.permalink_url : null;
    const createdTime = safeIso(p?.created_time);

    // Try to find attachment target id (photo/video object id)
    const att = safeArr<any>(p?.attachments?.data)[0] || null;
    const targetId = norm(att?.target?.id) || null;

    const commentsTotalCountFeed = Number(p?.comments?.summary?.total_count ?? 0) || 0;

    // 1) Try comments on the feed object itself
    const commentsUrlFeed =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(feedId)}/comments` +
      `?fields=id,message,from,created_time,permalink_url&limit=100&since=${sinceUnix}&access_token=${encodeURIComponent(
        token
      )}`;

    const commentsResFeed = await graphGet(commentsUrlFeed);

    let feedComments: any[] = [];
    if (commentsResFeed.ok) feedComments = safeArr(commentsResFeed.json?.data);

    // 2) ALSO try comments on the attachment target object (often where photo comments live)
    let targetComments: any[] = [];
    let commentsTotalCountTarget = 0;

    if (targetId) {
      // Ask for summary total_count on target too
      const targetSummaryUrl =
        `https://graph.facebook.com/${API_VER}/${encodeURIComponent(targetId)}` +
        `?fields=comments.limit(0).summary(true)&access_token=${encodeURIComponent(token)}`;

      const targetSummaryRes = await graphGet(targetSummaryUrl);
      if (targetSummaryRes.ok) {
        commentsTotalCountTarget = Number(targetSummaryRes.json?.comments?.summary?.total_count ?? 0) || 0;
      }

      const commentsUrlTarget =
        `https://graph.facebook.com/${API_VER}/${encodeURIComponent(targetId)}/comments` +
        `?fields=id,message,from,created_time,permalink_url&limit=100&since=${sinceUnix}&access_token=${encodeURIComponent(
          token
        )}`;

      const commentsResTarget = await graphGet(commentsUrlTarget);
      if (commentsResTarget.ok) targetComments = safeArr(commentsResTarget.json?.data);
    }

    // Combine both sources (avoid dupes)
    const allComments = uniq(
      [...feedComments, ...targetComments].filter(Boolean).map((c) => c)
    );

    debugTopPosts.push({
      postId: feedId,
      postPermalink,
      postCreated: createdTime,
      targetId,
      commentsTotalCountFeed,
      commentsReturnedFeed: feedComments.length,
      commentsTotalCountTarget,
      commentsReturnedTarget: targetComments.length,
    });

    // If both calls failed, keep a per-post error note
    if (!commentsResFeed.ok && targetId) {
      perPostErrors.push({
        postId: feedId,
        targetId,
        error: commentsResFeed.json?.error?.message || "Comments fetch failed (feed object)",
        status: commentsResFeed.status,
      });
    }

    for (const c of allComments) {
      const commentId = norm(c?.id);
      const text = norm(c?.message);

      if (!commentId || !text) continue;

      const fromName = c?.from?.name ? String(c.from.name) : null;
      const createdAt = safeIso(c?.created_time);
      const permalink =
        typeof c?.permalink_url === "string"
          ? c.permalink_url
          : postPermalink;

      upsertRows.push({
        organisation_id: organisationId,
        platform: "facebook",
        status: "needs_reply",
        kind: "comment",
        external_id: commentId,
        post_id: feedId,
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
    postsSeen: feedItems.length,
    pulled: up.upserted,
    sinceDays,
    perPostErrors,
    debug: {
      sources: {
        feed: true,
        attachmentTarget: true,
      },
      topPosts: debugTopPosts.slice(0, 12),
    },
    note:
      up.upserted === 0
        ? "Facebook feed items were fetched but no comments were returned. Check debug.topPosts: if commentsTotalCountTarget > 0 but commentsReturnedTarget = 0, permissions/object access is blocking comments."
        : undefined,
  };
}

async function pullInstagram(organisationId: string, igUserId: string, token: string, sinceDays: number) {
  const API_VER = "v24.0";
  const sinceUnix = Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000);

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

  const mediaItems: any[] = safeArr(media.json?.data);
  const upsertRows: any[] = [];

  for (const m of mediaItems) {
    const mediaId = norm(m?.id);
    if (!mediaId) continue;

    const postText = typeof m?.caption === "string" ? m.caption : null;
    const postPermalink = typeof m?.permalink === "string" ? m.permalink : null;

    const commentsUrl =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(mediaId)}/comments` +
      `?fields=id,text,username,timestamp,permalink&limit=50&since=${sinceUnix}&access_token=${encodeURIComponent(token)}`;

    const comments = await graphGet(commentsUrl);
    if (!comments.ok) continue;

    const items: any[] = safeArr(comments.json?.data);
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
  return { ok: true, platform: "instagram", pulled: up.upserted, mediaSeen: mediaItems.length, sinceDays };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const organisationId = norm(body?.organisationId);
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
      results.push(await pullInstagram(organisationId, ig.page_id, ig.page_access_token, sinceDays));
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
        "Pulled latest comments and stored them in Supabase (inbox_items). Facebook now pulls comments from BOTH the feed object and attachment target object (photo/video), which fixes the ‘photo comments not found’ issue.",
    });
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Pull failed" }, 500);
  }
}
