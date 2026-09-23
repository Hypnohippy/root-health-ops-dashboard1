import { NextRequest, NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requireOrganisation(req.nextUrl.searchParams.get("organisationId"), false);
    return NextResponse.json({ success: true, organisationId, mode: "membership" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ success: false, error: "Unable to resolve organisation." }, { status: 500 });
  }
}
