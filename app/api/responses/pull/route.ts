// app/api/responses/pull/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

function pickString(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type InboxUpsert = {
  organisation_id: string;
  platform: string;
  kind: "comment";
  status: "unread";
  text: string;
  author_name: string | null;
  author_id: string | null;
  created_at: string;
  permalink: string | null;
  ayrshare_post_id: string | null;
  social_post_id: string | null;
  social_comment_id: string | null;
  parent_social_comment_id: string | null;
  raw: any;
};

function flatten(platformKey: string, arr: any[], organisationId: string, ayrId: string): InboxUpsert[] {
  const out: InboxUpsert[] = [];

  const pushOne = (c: any, parentId: string | null) => {
    const text = pickString(c?.comment) || pickString(c?.message) || "";
    if (!text) return;

    const created =
      pickString(c?.created) ||
      pickString(c?.created_time) ||
      pickString(c?.createdTime) ||
      new Date().toISOString();

    const authorName =
      pickString(c?.from?.name) ||
      pickString(c?.displayName) ||
      pickString(c?.userName) ||
      pickString(c?.username) ||
      null;

    const authorId =
      pickString(c?.from?.id) ||
      pickString(c?.user?.id) ||
      pickString(c?.userId) ||
      pickString(c?.authorId) ||
      null;

    const commentId =
      pickString(c?.commentId) ||
      pickString(c?.id) ||
      null;

    const permalink =
      pickString(c?.commentUrl) ||
      pickString(c?.postUrl) ||
      pickString(c?.url) ||
      null;

    out.push({
      organisation_id: organisationId,
      platform: platformKey,
      kind: "comment",
      status: "unread",
      text,
      author_name: authorName,
      author_id: authorId,
      created_at: created,
      permalink,
      ayrshare_post_id: ayrId,
      social_post_id: null,
      social_comment_id: commentId,
      parent_social_comment_id: parentId,
      raw: c ?? null,
    });

    if (Array.isArray(c?.replies)) {
      for (const r of c.replies) {
        pushOne(r, commentId || parentId);
      }
    }
  };

  for (const c of arr) pushOne(c, null);

  return out;
}

export async function POST(req: NextRequest) {
  try {
    if (!AYRSHARE_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing AYRSHARE_API_KEY in env." },
        { status: 200 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const organisationId = String(body?.organisationId || "").trim();
    const lastDays = Math.min(Math.max(parseInt(body?.lastDays ?? "14", 10) || 14, 1), 60);
    const limit = Math.min(Math.max(parseInt(body?.limit ?? "50", 10) || 50, 1), 200);

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }

    // 1) Load recent post history (Ayrshare)
    const historyRes = await fetch(
      `https://api.ayrshare.com/api/history?lastDays=${encodeURIComponent(
        String(lastDays)
      )}&limit=${encodeURIComponent(String(limit))}`,
      { method: "GET", headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` } }
    );

    const historyJson = await historyRes.json().catch(() => null);

    if (!historyRes.ok) {
      return NextResponse.json(
        { success: false, error: "Failed to load post history", status: historyRes.status, details: historyJson },
        { status: 200 }
      );
    }

    const history = Array.isArray(historyJson?.history) ? historyJson.history : [];

    let totalUpserts = 0;
    const platformCounts: Record<string, number> = {};

    // 2) For each post, pull comments and upsert into inbox_items
    for (const h of history) {
      const ayrId = String(h?.id || "").trim();
      if (!ayrId) continue;

      const commentsRes = await fetch(
        `https://api.ayrshare.com/api/comments/${encodeURIComponent(ayrId)}`,
        { method: "GET", headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` } }
      );

      if (commentsRes.status === 404) continue; // no comments for this post

      const commentsJson = await commentsRes.json().catch(() => null);

      if (!commentsRes.ok) {
        // keep going (don't fail the whole pull)
        console.warn("[responses/pull] comments fetch failed", { status: commentsRes.status, ayrId, commentsJson });
        continue;
      }

      const keys = Object.keys(commentsJson || {}).filter((k) => Array.isArray((commentsJson as any)[k]));

      for (const platformKey of keys) {
        const arr = (commentsJson as any)[platformKey];
        if (!Array.isArray(arr) || arr.length === 0) continue;

        const normalized = flatten(platformKey, arr, organisationId, ayrId);
        if (!normalized.length) continue;

        const { error } = await supabaseAdmin
          .from("inbox_items")
          .upsert(normalized as any, { onConflict: "platform,social_comment_id" });

        if (error) {
          console.warn("[responses/pull] supabase upsert error", error);
          continue;
        }

        totalUpserts += normalized.length;
        platformCounts[platformKey] = (platformCounts[platformKey] || 0) + normalized.length;
      }
    }

    return NextResponse.json(
      { success: true, message: "Pulled comments", totalUpserts, platformCounts },
      { status: 200 }
    );
  } catch (err) {
    console.error("[responses/pull] unexpected error", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
