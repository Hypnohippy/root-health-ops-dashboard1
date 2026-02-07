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

function norm(s: any) {
  return String(s || "").trim();
}

function safeLower(s: any) {
  return norm(s).toLowerCase();
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

function safeIso(s: any) {
  const t = norm(s);
  if (!t) return null;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
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

async function pullFacebook(organisationId: string, pageId: string, token: string) {
  const API_VER = "v24.0";

  // ✅ Use /posts (page-authored posts) instead of /feed
  const postsUrl =
    `https://graph.facebook.com/${API_VER}/${encodeURIComponent(pageId)}/posts` +
    `?fields=id,message,permalink_url,created_time&limit=50&access_token=${encodeURIComponent(token)}`;

  const postsRes = await graphGet(postsUrl);

  if (!postsRes.ok) {
    return {
      ok: false,
      platform: "facebook",
      error: postsRes.json?.error?.message || "Facebook posts fetch failed",
      status: postsRes.status,
      details: postsRes.json,
      hint:
        "This usually means the saved token is not a PAGE access token, or permissions are missing. Ensure you saved the page_access_token (not user token).",
    };
  }

  const posts: any[] = Array.isArray(postsRes.json?.data) ? postsRes.json.data : [];
  const upsertRows: any[] = [];
  const perPostErrors: any[] = [];

  for (const p of posts) {
    const postId = norm(p?.id);
    if (!postId) continue;

    const postText = typeof p?.message === "string" ? p.message : null;
    const postPermalink = typeof p?.permalink_url === "string" ? p.permalink_url : null;

    const commentsUrl =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(postId)}/comments` +
      `?fields=id,message,from,created_time,permalink_url&limit=50&access_token=${encodeURIComponent(token)}`;

    const commentsRes = await graphGet(commentsUrl);

    if (!commentsRes.ok) {
      perPostErrors.push({
        postId,
        error: commentsRes.json?.error?.message || "Comments fetch failed",
        status: commentsRes.status,
      });
      continue;
    }

    const items: any[] = Array.isArray(commentsRes.json?.data) ? commentsRes.json.data : [];
    for (const c of items) {
      const commentId = norm(c?.id);
      const text = norm(c?.message);

      // keep non-empty comments only (safe + predictable)
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
    postsSeen: posts.length,
    pulled: up.upserted,
    perPostErrors: perPostErrors.slice(0, 6),
    note:
      up.upserted === 0
        ? "No Facebook comments were found on recent page posts. If you EXPECT comments, it usually means the token saved is not a valid PAGE access token."
        : "Facebook comments pulled successfully.",
  };
}

async function pullInstagram(organisationId: string, igUserId: string, token: string) {
  const API_VER = "v24.0";

  // Pull recent media
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
  const perMediaErrors: any[] = [];

  for (const m of mediaItems) {
    const mediaId = norm(m?.id);
    if (!mediaId) continue;

    const postText = typeof m?.caption === "string" ? m.caption : null;
    const postPermalink = typeof m?.permalink === "string" ? m.permalink : null;

    const commentsUrl =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(mediaId)}/comments` +
      `?fields=id,text,username,timestamp&limit=50&access_token=${encodeURIComponent(token)}`;

    const comments = await graphGet(commentsUrl);
    if (!comments.ok) {
      perMediaErrors.push({
        mediaId,
        error: comments.json?.error?.message || "Comments fetch failed",
        status: comments.status,
      });
      continue;
    }

    const items: any[] = Array.isArray(comments.json?.data) ? comments.json.data : [];
    for (const c of items) {
      const commentId = norm(c?.id);
      const text = norm(c?.text);
      if (!commentId || !text) continue;

      const username = c?.username ? String(c.username) : null;
      const createdAt = safeIso(c?.timestamp);
      const permalink = postPermalink;

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

  return {
    ok: true,
    platform: "instagram",
    mediaSeen: mediaItems.length,
    pulled: up.upserted,
    perMediaErrors: perMediaErrors.slice(0, 6),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const organisationId = norm(body?.organisationId);

    if (!organisationId) {
      return okJson({ success: false, error: "Missing organisationId" }, 400);
    }

    const accounts = await loadActiveAccounts(organisationId);

    const fb = accounts.find((a) => safeLower(a.platform) === "facebook");
    const ig = accounts.find((a) => safeLower(a.platform) === "instagram");

    const results: any[] = [];

    if (fb?.page_id && fb?.page_access_token) {
      results.push(await pullFacebook(organisationId, fb.page_id, fb.page_access_token));
    } else {
      results.push({
        ok: false,
        platform: "facebook",
        error: "Facebook not connected (missing page_id or token).",
      });
    }

    if (ig?.page_id && ig?.page_access_token) {
      // NOTE: in your schema, instagram page_id is assumed to be the IG User ID
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
        "Pulled latest comments and stored them in Supabase (inbox_items). If Facebook pulled=0 but you expect FB comments, your stored token is likely not a PAGE access token.",
    });
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Pull failed" }, 500);
  }
}
