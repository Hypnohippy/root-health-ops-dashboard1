import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { searchDiaryRelationships } from "@/lib/diaryAppointments.server";
import { verifiedRelationshipEmails } from "@/lib/operationalIntelligence.server";
export const dynamic = "force-dynamic";
export const GET = withTenantRoute(async (request, tenant) => {
  try {
    const params = new URL(request.url).searchParams, relationshipId = params.get("relationshipId");
    if (relationshipId) {
      const verifiedEmails = await verifiedRelationshipEmails(tenant, relationshipId);
      return NextResponse.json({ verifiedEmails }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ relationships: await searchDiaryRelationships(tenant, params.get("q")) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch { return NextResponse.json({ success: false, error: "Verified relationships could not be searched." }, { status: 503 }); }
}, { write: false });
