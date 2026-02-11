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

function safeArr<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function uniqBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
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
  const debugTopPosts: any[] = [];

  for (const p of feedItems) {
    const feedId = norm(p?.id);
    if (!feedId) continue;

    const postText = typeof p?.message === "string" ? p.message : null;
    const postPermalink = typeof p?.permalink_url === "string" ? p.permalink_url : null;
    const createdTime = safeIso(p?.created_time);

    const att = safeArr<any>(p?.attachments?.data)[0] || null;
    const targetId = norm(att?.target?.id) || null;

    const commentsTotalCountFeed = Number(p?.comments?.summary?.total_count ?? 0) || 0;

    const commentsUrlFeed =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(feedId)}/comments` +
      `?fields=id,message,from,created_time,permalink_url&limit=100&since=${sinceUnix}&access_token=${encodeURIComponent(
        token
      )}`;

    const commentsResFeed = await graphGet(commentsUrlFeed);

    let feedComments: any[] = [];
    if (commentsResFeed.ok) feedComments = safeArr(commentsResFeed.json?.data);

    let targetComments: any[] = [];
    let commentsTotalCountTarget = 0;

    if (targetId) {
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

    // Combine both sources (avoid dupes) by comment id
    const allComments = uniqBy([...feedComments, ...targetComments].filter(Boolean), (c) => norm((c as any)?.id));

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

    if (!commentsResFeed.ok && targetId) {
      perPostErrors.push({
        postId: feedId,
        targetId,
        error: commentsResFeed.json?.error?.message || "Comments fetch failed (feed object)",
        status: commentsResFeed.status,
      });
    }

    for (const c of allComments) {
      const commentId = norm((c as any)?.id);
      const text = norm((c as any)?.message);

      if (!commentId || !text) continue;

      const fromName = (c as any)?.from?.name ? String((c as any).from.name) : null;
      const createdAt = safeIso((c as any)?.created_time);
      const permalink =
        typeof (c as any)?.permalink_url === "string"
          ? (c as any).permalink_url
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
      sources: { feed: true, attachmentTarget: true },
      topPosts: debugTopPosts.slice(0, 12),
    },
    note:
      up.upserted === 0
        ? "Facebook feed items were fetched but no comments were returned. Check debug.topPosts."
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

/**
 * ✅ LinkedIn comments pull (polling)
 * Works for comments on posts the connected user authored (UGC posts).
 * Notes:
 * - LinkedIn APIs can be picky about permissions. If it fails, reconnect LinkedIn.
 * - We store raw comment payloads, and keep author info best-effort.
 */
async function pullLinkedIn(organisationId: string, token: string, sinceDays: number) {
  const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  // 1) Find author urn (same method you already use in /api/linkedin/post)
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const userJson: any = await userRes.json().catch(() => null);

  if (!userRes.ok) {
    return {
      ok: false,
      platform: "linkedin",
      error: userJson?.message || userJson?.error_description || "LinkedIn userinfo failed",
      status: userRes.status,
      details: userJson,
      hint: "Reconnect LinkedIn on Connect page if this persists.",
    };
  }

  const sub = norm(userJson?.sub);
  if (!sub) {
    return {
      ok: false,
      platform: "linkedin",
      error: "LinkedIn userinfo returned no 'sub' field (cannot determine author).",
      status: 500,
      details: userJson,
    };
  }

  const authorUrn = `urn:li:person:${sub}`;

  // 2) Pull recent UGC posts by author
  // (This query works for many apps; if your app is limited, LinkedIn may 403 it)
  const postsUrl =
    "https://api.linkedin.com/v2/ugcPosts" +
    `?q=authors&authors=List(${encodeURIComponent(authorUrn)})&count=20`;

  const postsRes = await fetch(postsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202402",
    },
    cache: "no-store",
  });
  const postsJson: any = await postsRes.json().catch(() => null);

  if (!postsRes.ok) {
    return {
      ok: false,
      platform: "linkedin",
      error: postsJson?.message || "LinkedIn ugcPosts fetch failed",
      status: postsRes.status,
      details: postsJson,
      hint: "This usually means the app/token doesn't have permission to read posts/comments. Reconnect LinkedIn; if still failing, LinkedIn app permissions may not allow comment reads.",
    };
  }

  const elements: any[] = safeArr(postsJson?.elements);
  const recentPosts = elements.filter((p) => {
    const lastModified = Number(p?.lastModified?.time ?? 0) || 0;
    const created = Number(p?.created?.time ?? 0) || lastModified || 0;
    const ts = created || lastModified;
    return ts ? ts >= sinceMs : true;
  });

  const upsertRows: any[] = [];
  const perPostErrors: any[] = [];

  for (const p of recentPosts) {
    const postUrn = norm(p?.id); // usually a URN like urn:li:ugcPost:...
    if (!postUrn) continue;

    const createdTs = Number(p?.created?.time ?? 0) || Number(p?.lastModified?.time ?? 0) || 0;
    const postCreatedIso = createdTs ? new Date(createdTs).toISOString() : null;

    // best-effort text extraction
    const postText =
      norm(p?.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text) ||
      null;

    // 3) Pull comments for that post via socialActions
    const commentsUrl =
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments?count=50`;

    const cRes = await fetch(commentsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202402",
      },
      cache: "no-store",
    });

    const cJson: any = await cRes.json().catch(() => null);

    if (!cRes.ok) {
      perPostErrors.push({
        postUrn,
        status: cRes.status,
        error: cJson?.message || "LinkedIn comments fetch failed",
        details: cJson,
      });
      continue;
    }

    const comments: any[] = safeArr(cJson?.elements);

    for (const c of comments) {
      const commentUrn = norm(c?.id); // URN for the comment
      const text = norm(c?.message?.text);
      if (!commentUrn || !text) continue;

      const actor = norm(c?.actor);
      const createdMs = Number(c?.created?.time ?? 0) || 0;
      const createdAt = createdMs ? new Date(createdMs).toISOString() : null;

      // LinkedIn doesn't always provide a permalink easily via this endpoint.
      // We store null (UI can still show it, and you can add permalink later).
      upsertRows.push({
        organisation_id: organisationId,
        platform: "linkedin",
        status: "needs_reply",
        kind: "comment",
        external_id: commentUrn,
        post_id: postUrn,
        post_text: postText,
        author_name: null,
        author_handle: actor || null,
        text,
        permalink: null,
        created_at_platform: createdAt,
        raw: { comment: c, post: { id: postUrn, created_at: postCreatedIso, text: postText } },
      });
    }
  }

  const up = await upsertInboxItems(upsertRows);

  return {
    ok: true,
    platform: "linkedin",
    pulled: up.upserted,
    postsSeen: recentPosts.length,
    sinceDays,
    perPostErrors,
    note:
      up.upserted === 0
        ? "LinkedIn posts were fetched but no comments were returned in this window."
        : undefined,
  };
}

/**
 * Threads + TikTok:
 * These are not like FB/IG for “pull inbox” via simple polling in most setups.
 * If you want them in Responses reliably, we should implement:
 * - Threads: proper Graph endpoints for replies + backoff (or webhook-style capture if available)
 * - TikTok: comment/list endpoints require correct scopes + product access; often best via their inbox/workflow
 */
async function pullThreadsNotImplemented() {
  return {
    ok: false,
    platform: "threads",
    error: "Threads pull not implemented yet (posting works; inbox/replies pulling needs a dedicated Threads replies API flow).",
    hint: "We can add this next, but it’s a separate API path to fetch replies/comments reliably.",
  };
}

async function pullTikTokNotImplemented() {
  return {
    ok: false,
    platform: "tiktok",
    error: "TikTok pull not implemented yet (posting/upload works; responses/comments pulling requires TikTok comment scopes + endpoints).",
    hint: "We can add TikTok comments pull once we confirm your app has the right comment scopes enabled.",
  };
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
    const li = accounts.find((a) => a.platform === "linkedin");
    const th = accounts.find((a) => a.platform === "threads");
    const tt = accounts.find((a) => a.platform === "tiktok");

    const results: any[] = [];

    // Facebook
    if (fb?.page_id && fb?.page_access_token) {
      results.push(await pullFacebook(organisationId, fb.page_id, fb.page_access_token, sinceDays));
    } else {
      results.push({ ok: false, platform: "facebook", error: "Facebook not connected (missing page_id or token)." });
    }

    // Instagram
    if (ig?.page_id && ig?.page_access_token) {
      results.push(await pullInstagram(organisationId, ig.page_id, ig.page_access_token, sinceDays));
    } else {
      results.push({ ok: false, platform: "instagram", error: "Instagram not connected (missing ig_user_id/page_id or token)." });
    }

    // LinkedIn (NEW)
    if (li?.page_access_token) {
      results.push(await pullLinkedIn(organisationId, li.page_access_token, sinceDays));
    } else {
      results.push({ ok: false, platform: "linkedin", error: "LinkedIn not connected (missing token)." });
    }

    // Threads (NOT IMPLEMENTED YET)
    if (th?.page_access_token) {
      results.push(await pullThreadsNotImplemented());
    } else {
      results.push({ ok: false, platform: "threads", error: "Threads not connected (missing token)." });
    }

    // TikTok (NOT IMPLEMENTED YET)
    if (tt?.page_access_token) {
      results.push(await pullTikTokNotImplemented());
    } else {
      results.push({ ok: false, platform: "tiktok", error: "TikTok not connected (missing token)." });
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
        "Pulled latest comments into inbox_items. LinkedIn polling is now enabled. Threads/TikTok pulling is not implemented yet (they need dedicated reply/comment APIs or webhook flows).",
    });
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Pull failed" }, 500);
  }
}
