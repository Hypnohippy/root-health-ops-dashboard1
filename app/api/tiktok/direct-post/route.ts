import { NextRequest, NextResponse } from "next/server";
import { requirePublishingOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { publishTikTokPost, ownedTikTokPost, TikTokError } from "@/lib/tiktokPosting.server";
import type { TikTokSettings } from "@/lib/tiktokPosting";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  try {
    if (process.env.TIKTOK_DIRECT_POST_AUDIT_ENABLED !== "1") return NextResponse.json({ ok: false, error: "Direct Post is disabled pending TikTok audit. Use the normal TikTok inbox upload workflow." }, { status: 503 });
    const body = await req.json();
    const { organisationId } = await requirePublishingOrganisation(req, body.organisationId || body.organisation_id);
    if (body.action === "prepare") {
      if (typeof body.message !== "string" || body.message.length > 2200 || typeof body.videoUrl !== "string" || !body.videoUrl) throw new TikTokError("Add a video and a caption of at most 2,200 characters.");
      // pending is already used by dispatch claims and is excluded from automatic dispatch.
      const { data, error } = await supabaseAdmin.from("scheduled_posts").insert({ organisation_id: organisationId, message: body.message, platforms: ["tiktok"], scheduled_for: new Date().toISOString(), status: "pending", meta: { source: "tiktok_direct_post", video_url: body.videoUrl } }).select("id").single();
      if (error || !data) throw new TikTokError("Could not prepare the TikTok post. No provider request was made.", "prepare_failed", 503);
      return NextResponse.json({ ok: true, postId: data.id });
    }
    if (typeof body.postId !== "string" || !body.postId) throw new TikTokError("Select a saved Ops post before posting to TikTok.", "post_required");
    return NextResponse.json(await publishTikTokPost(organisationId, body.postId, body.settings as TikTokSettings | undefined));
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ ok: false, error: error instanceof TikTokError ? error.message : "TikTok request could not finish. Refresh status before retrying; do not upload again.", code: error instanceof TikTokError ? error.code : "request_uncertain", reconnectRequired: error instanceof TikTokError && error.reconnectRequired }, { status: error instanceof TikTokError ? error.status : 503 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requirePublishingOrganisation(req, req.nextUrl.searchParams.get("organisationId"));
    const post = await ownedTikTokPost(organisationId, req.nextUrl.searchParams.get("postId") || "");
    return NextResponse.json({ ok: true, postId: post.id, message: post.message, videoUrl: post.meta?.video_url || "", receipt: post.meta?.tiktok_post || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ ok: false, error: "Could not load this organisation's TikTok post." }, { status: 404 });
  }
}
