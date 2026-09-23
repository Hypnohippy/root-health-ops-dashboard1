import { requirePublishingOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type Platform = "facebook";

async function loadFacebookAccount(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("platform,page_id,page_access_token,is_active,token_expires_at")
    .eq("organisation_id", orgId)
    .eq("platform", "facebook")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as any;
}

async function getSyncState(orgId: string, platform: Platform, kind: "comments" | "messages") {
  const { data, error } = await supabaseAdmin
    .from("social_sync_state")
    .select("id,last_occurred_at")
    .eq("organisation_id", orgId)
    .eq("platform", platform)
    .eq("kind", kind)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as any | null;
}

async function setSyncState(orgId: string, platform: Platform, kind: "comments" | "messages", lastAt: string | null) {
  const now = new Date().toISOString();

  // upsert
  const { error } = await supabaseAdmin
    .from("social_sync_state")
    .upsert(
      {
        organisation_id: orgId,
        platform,
        kind,
        last_occurred_at: lastAt,
        updated_at: now,
      },
      { onConflict: "organisation_id,platform,kind" }
    );

  if (error) throw error;
}

function isoToUnix(iso: string) {
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 1000);
}

function safeStr(x: any) {
  return String(x ?? "").trim();
}

async function insertResponses(rows: any[]) {
  if (!rows.length) return { inserted: 0 };

  const { error } = await supabaseAdmin.from("social_responses").insert(rows, { defaultToNull: true });
  if (!error) return { inserted: rows.length };

  // If duplicates happen, we’ll retry one-by-one ignoring conflicts (unique external_id)
  // This keeps it robust for polling.
  let inserted = 0;
  for (const r of rows) {
    const { error: e2 } = await supabaseAdmin.from("social_responses").insert(r, { defaultToNull: true });
    if (!e2) inserted++;
  }
  return { inserted };
}

/**
 * COMMENTS:
 * - Pull recent posts from the Page feed
 * - For each post, pull comments since last sync
 */
async function syncFacebookComments(args: { orgId: string; pageId: string; token: string; lastAt: string | null }) {
  const { orgId, pageId, token, lastAt } = args;

  const sinceUnix = lastAt ? isoToUnix(lastAt) : null;

  // Get recent posts (keep small; polling runs often)
  const feedUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}/feed`);
  feedUrl.searchParams.set("fields", "id,created_time");
  feedUrl.searchParams.set("limit", "25");
  feedUrl.searchParams.set("access_token", token);

  const feedRes = await fetch(feedUrl.toString(), { method: "GET", cache: "no-store" });
  const feedJson: any = await feedRes.json().catch(() => null);

  if (!feedRes.ok) {
    return { ok: false, error: feedJson?.error?.message || "Failed to fetch Facebook feed", details: feedJson, inserted: 0, lastAt };
  }

  const posts: any[] = Array.isArray(feedJson?.data) ? feedJson.data : [];

  let maxSeen: string | null = lastAt || null;
  const toInsert: any[] = [];

  for (const p of posts) {
    const postId = safeStr(p?.id);
    if (!postId) continue;

    const commentsUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(postId)}/comments`);
    commentsUrl.searchParams.set("fields", "id,message,from,created_time");
    commentsUrl.searchParams.set("limit", "50");
    if (sinceUnix) commentsUrl.searchParams.set("since", String(sinceUnix));
    commentsUrl.searchParams.set("access_token", token);

    const cRes = await fetch(commentsUrl.toString(), { method: "GET", cache: "no-store" });
    const cJson: any = await cRes.json().catch(() => null);
    if (!cRes.ok) continue;

    const comments: any[] = Array.isArray(cJson?.data) ? cJson.data : [];
    for (const c of comments) {
      const created = safeStr(c?.created_time);
      if (created) {
        if (!maxSeen) maxSeen = created;
        else {
          const prev = new Date(maxSeen).getTime();
          const cur = new Date(created).getTime();
          if (!Number.isNaN(cur) && !Number.isNaN(prev) && cur > prev) maxSeen = created;
        }
      }

      toInsert.push({
        organisation_id: orgId,
        platform: "facebook",
        type: "comment",
        external_id: safeStr(c?.id),
        post_id: postId,
        conversation_id: null,
        from_id: safeStr(c?.from?.id) || null,
        from_name: safeStr(c?.from?.name) || null,
        message: safeStr(c?.message) || null,
        occurred_at: created || new Date().toISOString(),
        raw: c ?? null,
      });
    }
  }

  // Filter empties
  const clean = toInsert.filter((r) => r.external_id);

  const ins = await insertResponses(clean);

  return { ok: true, inserted: ins.inserted, lastAt: maxSeen };
}

/**
 * MESSAGES (Inbox):
 * - Pull page conversations
 * - Pull messages since last sync
 *
 * NOTE: This requires pages_messaging on the token.
 */
async function syncFacebookMessages(args: { orgId: string; pageId: string; token: string; lastAt: string | null }) {
  const { orgId, pageId, token, lastAt } = args;
  const sinceUnix = lastAt ? isoToUnix(lastAt) : null;

  const convUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}/conversations`);
  convUrl.searchParams.set("fields", "id,updated_time,messages.limit(25){id,created_time,from,message}");
  convUrl.searchParams.set("limit", "25");
  convUrl.searchParams.set("access_token", token);

  const convRes = await fetch(convUrl.toString(), { method: "GET", cache: "no-store" });
  const convJson: any = await convRes.json().catch(() => null);

  if (!convRes.ok) {
    return { ok: false, error: convJson?.error?.message || "Failed to fetch Facebook conversations", details: convJson, inserted: 0, lastAt };
  }

  const conversations: any[] = Array.isArray(convJson?.data) ? convJson.data : [];

  let maxSeen: string | null = lastAt || null;
  const toInsert: any[] = [];

  for (const conv of conversations) {
    const convId = safeStr(conv?.id);
    const msgs: any[] = Array.isArray(conv?.messages?.data) ? conv.messages.data : [];

    for (const m of msgs) {
      const mid = safeStr(m?.id);
      const created = safeStr(m?.created_time);
      if (!mid) continue;

      // respect since
      if (sinceUnix && created) {
        const t = Math.floor(new Date(created).getTime() / 1000);
        if (!Number.isNaN(t) && t <= sinceUnix) continue;
      }

      if (created) {
        if (!maxSeen) maxSeen = created;
        else {
          const prev = new Date(maxSeen).getTime();
          const cur = new Date(created).getTime();
          if (!Number.isNaN(cur) && !Number.isNaN(prev) && cur > prev) maxSeen = created;
        }
      }

      toInsert.push({
        organisation_id: orgId,
        platform: "facebook",
        type: "dm",
        external_id: mid,
        post_id: null,
        conversation_id: convId || null,
        from_id: safeStr(m?.from?.id) || null,
        from_name: safeStr(m?.from?.name) || null,
        message: safeStr(m?.message) || null,
        occurred_at: created || new Date().toISOString(),
        raw: m ?? null,
      });
    }
  }

  const clean = toInsert.filter((r) => r.external_id);
  const ins = await insertResponses(clean);

  return { ok: true, inserted: ins.inserted, lastAt: maxSeen };
}

export async function POST(req: NextRequest) {
  try {
    const { organisationId: orgId } = await requirePublishingOrganisation(req, req.nextUrl.searchParams.get("organisationId"));
    if (!orgId) return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 200 });

    const fb = await loadFacebookAccount(orgId);
    const pageId = safeStr(fb?.page_id);
    const token = safeStr(fb?.page_access_token);

    if (!pageId || !token) {
      return NextResponse.json(
        { ok: false, error: "Facebook not connected (missing page_id or token). Reconnect Facebook in Connect." },
        { status: 200 }
      );
    }

    const cState = await getSyncState(orgId, "facebook", "comments");
    const mState = await getSyncState(orgId, "facebook", "messages");

    const comments = await syncFacebookComments({ orgId, pageId, token, lastAt: cState?.last_occurred_at ?? null });
    const messages = await syncFacebookMessages({ orgId, pageId, token, lastAt: mState?.last_occurred_at ?? null });

    if (comments.ok) await setSyncState(orgId, "facebook", "comments", comments.lastAt ?? null);
    if (messages.ok) await setSyncState(orgId, "facebook", "messages", messages.lastAt ?? null);

    return NextResponse.json({
      ok: true,
      organisationId: orgId,
      facebook: {
        comments: { ok: comments.ok, inserted: comments.inserted, lastAt: comments.lastAt, error: (comments as any).error || null },
        messages: { ok: messages.ok, inserted: messages.inserted, lastAt: messages.lastAt, error: (messages as any).error || null },
      },
      note: "This sync writes to social_responses (used for automated leads + coaching).",
    });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json({ ok: false, error: e?.message || "Sync failed." }, { status: 200 });
  }
}
