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

async function graphPost(url: string, body: Record<string, string>) {
  const params = new URLSearchParams(body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

function safeIso(s: any) {
  const t = String(s || "").trim();
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
  // Pull recent page posts
  const feedUrl =
    `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/feed` +
    `?fields=id,message,permalink_url,created_time&limit=8&access_token=${encodeURIComponent(token)}`;

  const feed = await graphGet(feedUrl);
  if (!feed.ok) {
    return {
      ok: false,
      platform: "facebook",
      error: feed.json?.error?.message || "Facebook feed fetch failed",
      details: feed.json,
    };
  }

  const posts: any[] = Array.isArray(feed.json?.data) ? feed.json.data : [];
  const upsertRows: any[] = [];

  for (const p of posts) {
    const postId = String(p?.id || "").trim();
    if (!postId) continue;

    const postText = typeof p?.message === "string" ? p.message : null;
    const postPermalink = typeof p?.permalink_url === "string" ? p.permalink_url : null;

    const commentsUrl =
      `https://graph.facebook.com/v19.0/${encodeURIComponent(postId)}/comments` +
      `?fields=id,message,from,created_time,permalink_url&limit=50&access_token=${encodeURIComponent(token)}`;

    const comments = await graphGet(commentsUrl);
    if (!comments.ok) continue;

    const items: any[] = Array.isArray(comments.json?.data) ? comments.json.data : [];
    for (const c of items) {
      const commentId = String(c?.id || "").trim();
      const text = String(c?.message || "").trim();
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
  return { ok: true, platform: "facebook", pulled: up.upserted };
}

async function pullInstagram(organisationId: string, igUserId: string, token: string) {
  // Pull recent media
  const mediaUrl =
    `https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media` +
    `?fields=id,caption,permalink,timestamp&limit=8&access_token=${encodeURIComponent(token)}`;

  const media = await graphGet(mediaUrl);
  if (!media.ok) {
    return {
      ok: false,
      platform: "instagram",
      error: media.json?.error?.message || "Instagram media fetch failed",
      details: media.json,
    };
  }

  const mediaItems: any[] = Array.isArray(media.json?.data) ? media.json.data : [];
  const upsertRows: any[] = [];

  for (const m of mediaItems) {
    const mediaId = String(m?.id || "").trim();
    if (!mediaId) continue;

    const postText = typeof m?.caption === "string" ? m.caption : null;
    const postPermalink = typeof m?.permalink === "string" ? m.permalink : null;

    const commentsUrl =
      `https://graph.facebook.com/v19.0/${encodeURIComponent(mediaId)}/comments` +
      `?fields=id,text,username,timestamp,permalink&limit=50&access_token=${encodeURIComponent(token)}`;

    const comments = await graphGet(commentsUrl);
    if (!comments.ok) continue;

    const items: any[] = Array.isArray(comments.json?.data) ? comments.json.data : [];
    for (const c of items) {
      const commentId = String(c?.id || "").trim();
      const text = String(c?.text || "").trim();
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
  return { ok: true, platform: "instagram", pulled: up.upserted };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const organisationId = String(body?.organisationId || "").trim();

    if (!organisationId) {
      return okJson({ success: false, error: "Missing organisationId" }, 400);
    }

    const accounts = await loadActiveAccounts(organisationId);

    const fb = accounts.find((a) => a.platform === "facebook");
    const ig = accounts.find((a) => a.platform === "instagram");

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
      note: "Pulled latest comments and stored them in Supabase (inbox_items).",
    });
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Pull failed" }, 500);
  }
}
