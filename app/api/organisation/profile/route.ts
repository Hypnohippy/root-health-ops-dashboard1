import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { ProfileValidationError } from "@/lib/brandGrowthProfile";
import { getOrganisationProfile, updateOrganisationProfile } from "@/lib/organisationProfile.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  return accessErrorResponse(error) || NextResponse.json({
    success: false,
    error: error instanceof ProfileValidationError ? error.message : "Could not load or save your profile. Please try again or contact support.",
  }, { status: error instanceof ProfileValidationError ? 400 : 503, headers });
}

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ success: true, ...await getOrganisationProfile(req.nextUrl.searchParams.get("organisationId")) }, { headers });
  } catch (error) { return failure(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > 1024 * 1024) return NextResponse.json({ success: false, error: "Profile is too large (maximum 1 MB)." }, { status: 413, headers });
    let body;
    try { body = JSON.parse(text); } catch { throw new ProfileValidationError("Invalid profile JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "profile")) throw new ProfileValidationError("Send only the profile fields to update.");
    return NextResponse.json({ success: true, ...await updateOrganisationProfile(req.nextUrl.searchParams.get("organisationId"), body.profile) }, { headers });
  } catch (error) { return failure(error); }
}
