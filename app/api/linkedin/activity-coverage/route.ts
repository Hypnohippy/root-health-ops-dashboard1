import { NextRequest, NextResponse } from "next/server";
import { linkedinActivityCoverageSummary } from "@/lib/linkedinActivityCoverage";
import { accessErrorResponse, requireOrganisation } from "@/lib/tenantAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requireOrganisation(
      req.nextUrl.searchParams.get("organisationId") || req.nextUrl.searchParams.get("organisation_id"),
      false,
    );
    return NextResponse.json({ success: true, organisationId, ...linkedinActivityCoverageSummary() });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to load LinkedIn activity coverage." }, { status: 500 });
  }
}
