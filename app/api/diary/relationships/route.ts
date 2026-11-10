import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { searchDiaryRelationships } from "@/lib/diaryAppointments.server";
export const dynamic = "force-dynamic";
export const GET = withTenantRoute(async (request, tenant) => {
  try { return NextResponse.json({ relationships: await searchDiaryRelationships(tenant, new URL(request.url).searchParams.get("q")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ success: false, error: "Verified relationships could not be searched." }, { status: 503 }); }
}, { write: false });
