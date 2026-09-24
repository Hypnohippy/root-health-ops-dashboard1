// app/api/responses/pull/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { linkedinActivityCoverageSummary } from "@/lib/linkedinActivityCoverage";
import { accessErrorResponse, requireOrganisation } from "@/lib/tenantAuth";

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
    };
  }

  const feedItems: any[] = safeArr(feedRes.json?.data);
  const upsertRows: any[] = [];

  for (const p of feedItems) {
    const feedId = norm(p?.id);
    if (!feedId) continue;

    const postText = typeof p?.message === "string" ? p.message : null;
    const postPermalink = typeof p?.permalink_url === "string" ? p.permalink_url : null;

    const att = safeArr<any>(p?.attachments?.data)[0] || null;
    const targetId = norm(att?.target?.id) || null;

    const commentsUrlFeed =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(feedId)}/comments` +
      `?fields=id,message,from,created_time,permalink_url&limit=100&since=${sinceUnix}&access_token=${encodeURIComponent(
        token
      )}`;

    const commentsResFeed = await graphGet(commentsUrlFeed);
    const feedComments: any[] = commentsResFeed.ok ? safeArr(commentsResFeed.json?.data) : [];

    let targetComments: any[] = [];
    if (targetId) {
      const commentsUrlTarget =
        `https://graph.facebook.com/${API_VER}/${encodeURIComponent(targetId)}/comments` +
        `?fields=id,message,from,created_time,permalink_url&limit=100&since=${sinceUnix}&access_token=${encodeURIComponent(
          token
        )}`;

      const commentsResTarget = await graphGet(commentsUrlTarget);
      if (commentsResTarget.ok) targetComments = safeArr(commentsResTarget.json?.data);
    }

    const allComments = uniqBy([...feedComments, ...targetComments].filter(Boolean), (c) => norm((c as any)?.id));

    for (const c of allComments) {
      const commentId = norm((c as any)?.id);
      const text = norm((c as any)?.message);
      if (!commentId || !text) continue;

      const fromName = (c as any)?.from?.name ? String((c as any).from.name) : null;
      const createdAt = safeIso((c as any)?.created_time);
      const permalink =
        typeof (c as any)?.permalink_url === "string" ? (c as any).permalink_url : postPermalink;

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
 * ✅ LinkedIn pull with detailed debug so we can see exactly what fails.
 */
async function pullLinkedIn(organisationId: string, token: string, sinceDays: number) {
  const coverage = linkedinActivityCoverageSummary();
  if (!coverage.hasRelationshipEventCoverage) {
    return {
      ok: false,
      platform: "linkedin",
      error: "LinkedIn activity reading is not included in the app's approved access.",
      status: 403,
      capability: "additional_linkedin_approval_required",
      hint: "Connection acceptances continue through the supported Gmail intake. LinkedIn comments, reactions, invitations and messages require additional LinkedIn product approval.",
    };
  }
  const debug: any = {
    step: null,
    userinfo: null,
    ugcPosts: null,
    comments: [],
  };

  // STEP 1: userinfo
  debug.step = "userinfo";
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const userJson: any = await userRes.json().catch(() => null);

  debug.userinfo = { ok: userRes.ok, status: userRes.status, body: userJson };

  if (!userRes.ok) {
    return {
      ok: false,
      platform: "linkedin",
      error: userJson?.message || userJson?.error_description || "LinkedIn userinfo failed",
      status: userRes.status,
      details: debug,
      hint: "Reconnect LinkedIn. If still failing, token/permissions are invalid.",
    };
  }

  const sub = norm(userJson?.sub);
  if (!sub) {
    return {
      ok: false,
      platform: "linkedin",
      error: "LinkedIn userinfo returned no 'sub' (cannot determine author).",
      status: 500,
      details: debug,
    };
  }

  const authorUrn = `urn:li:person:${sub}`;

  // STEP 2: fetch ugcPosts by author
  debug.step = "ugcPosts";
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

  debug.ugcPosts = { ok: postsRes.ok, status: postsRes.status, body: postsJson };

  if (!postsRes.ok) {
    return {
      ok: false,
      platform: "linkedin",
      error: postsJson?.message || "LinkedIn ugcPosts fetch failed",
      status: postsRes.status,
      details: debug,
      hint:
        "Posting can work even if reading does not. This usually means your LinkedIn app/token lacks read permissions for ugcPosts/comments.",
    };
  }

  const elements: any[] = safeArr(postsJson?.elements);

  const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  const recentPosts = elements.filter((p) => {
    const lastModified = Number(p?.lastModified?.time ?? 0) || 0;
    const created = Number(p?.created?.time ?? 0) || lastModified || 0;
    const ts = created || lastModified;
    return ts ? ts >= sinceMs : true;
  });

  const upsertRows: any[] = [];

  // STEP 3: comments per post
  debug.step = "comments";
  for (const p of recentPosts) {
    const postUrn = norm(p?.id);
    if (!postUrn) continue;

    const postText =
      norm(p?.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text) ||
      null;

    const cUrl = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments?count=50`;

    const cRes = await fetch(cUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202402",
      },
      cache: "no-store",
    });

    const cJson: any = await cRes.json().catch(() => null);

    debug.comments.push({
      postUrn,
      ok: cRes.ok,
      status: cRes.status,
      body: cJson,
    });

    if (!cRes.ok) continue;

    const comments: any[] = safeArr(cJson?.elements);
    for (const c of comments) {
      const commentUrn = norm(c?.id);
      const text = norm(c?.message?.text);
      if (!commentUrn || !text) continue;

      const actor = norm(c?.actor);
      const createdMs = Number(c?.created?.time ?? 0) || 0;
      const createdAt = createdMs ? new Date(createdMs).toISOString() : null;

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
        raw: c,
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
    debug: {
      userinfoOk: debug.userinfo?.ok,
      ugcPostsOk: debug.ugcPosts?.ok,
      commentsCalls: (debug.comments || []).length,
      commentsOkCount: (debug.comments || []).filter((x: any) => x.ok).length,
    },
  };
}

async function pullThreadsNotImplemented() {
  return {
    ok: false,
    platform: "threads",
    error: "Threads pull not implemented yet.",
  };
}

async function pullTikTokNotImplemented() {
  return {
    ok: false,
    platform: "tiktok",
    error: "TikTok pull not implemented yet.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestedOrganisationId = norm(body?.organisationId);
    const sinceDaysRaw = Number(body?.sinceDays ?? 14);
    const sinceDays = Math.max(1, Math.min(90, isNaN(sinceDaysRaw) ? 14 : sinceDaysRaw));

    if (!requestedOrganisationId) {
      return okJson({ success: false, error: "Missing organisationId" }, 400);
    }

    const { organisationId } = await requireOrganisation(requestedOrganisationId, true);

    const accounts = await loadActiveAccounts(organisationId);

    const fb = accounts.find((a) => a.platform === "facebook");
    const ig = accounts.find((a) => a.platform === "instagram");
    const li = accounts.find((a) => a.platform === "linkedin");
    const th = accounts.find((a) => a.platform === "threads");
    const tt = accounts.find((a) => a.platform === "tiktok");

    const results: any[] = [];

    if (fb?.page_id && fb?.page_access_token) {
      results.push(await pullFacebook(organisationId, fb.page_id, fb.page_access_token, sinceDays));
    } else {
      results.push({ ok: false, platform: "facebook", error: "Facebook not connected (missing page_id or token)." });
    }

    if (ig?.page_id && ig?.page_access_token) {
      results.push(await pullInstagram(organisationId, ig.page_id, ig.page_access_token, sinceDays));
    } else {
      results.push({ ok: false, platform: "instagram", error: "Instagram not connected (missing ig_user_id/page_id or token)." });
    }

    if (li?.page_access_token) {
      results.push(await pullLinkedIn(organisationId, li.page_access_token, sinceDays));
    } else {
      results.push({ ok: false, platform: "linkedin", error: "LinkedIn not connected (missing token)." });
    }

    if (th?.page_access_token) {
      results.push(await pullThreadsNotImplemented());
    } else {
      results.push({ ok: false, platform: "threads", error: "Threads not connected (missing token)." });
    }

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
      note: "Pull complete (FB/IG + LinkedIn debug).",
    });
  } catch (e: any) {
    return accessErrorResponse(e) || okJson({ success: false, error: e?.message || "Pull failed" }, 500);
  }
}
