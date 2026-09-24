import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { buildContactLifecycle } from "@/lib/contactLifecycle";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withTenantRoute(async function GET(_req: Request, tenant) {
  const input = await readLifecycleInput(tenant.organisationId);
  return NextResponse.json({ success: true, data: buildContactLifecycle(tenant.organisationId, input) },
    { headers: { "Cache-Control": "private, no-store" } });
}, { generation: false, write: false });
