import { NextRequest, NextResponse } from "next/server";
import { requirePublishingOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { refreshTikTokPost, TikTokError } from "@/lib/tiktokPosting.server";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    if (process.env.TIKTOK_DIRECT_POST_AUDIT_ENABLED !== "1") return NextResponse.json({ ok: false, error: "Direct Post is disabled pending TikTok audit. Use the normal TikTok inbox upload workflow." }, { status: 503 });
    const body = await req.json();
    const { organisationId } = await requirePublishingOrganisation(req, body.organisationId || body.organisation_id);
    if (typeof body.postId !== "string" || !body.postId) throw new TikTokError("Select the saved Ops post to refresh TikTok status.");
    return NextResponse.json(await refreshTikTokPost(organisationId, body.postId, body.publishId));
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ ok: false, error: error instanceof TikTokError ? error.message : "TikTok status is temporarily unavailable. Keep the existing publish ID; do not re-upload.", reconnectRequired: error instanceof TikTokError && error.reconnectRequired }, { status: error instanceof TikTokError ? error.status : 503 });
  }
}
