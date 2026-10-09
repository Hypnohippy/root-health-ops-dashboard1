import { NextRequest, NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { getTikTokCreator, TikTokError } from "@/lib/tiktokPosting.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requireOrganisation(req.nextUrl.searchParams.get("organisationId"));
    return NextResponse.json({ ok: true, ...await getTikTokCreator(organisationId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ ok: false, error: error instanceof TikTokError ? error.message : "Could not query TikTok creator settings. Try again later.", reconnectRequired: error instanceof TikTokError && error.reconnectRequired, code: error instanceof TikTokError ? error.code : "creator_query_failed" }, { status: error instanceof TikTokError ? error.status : 503 });
  }
}
