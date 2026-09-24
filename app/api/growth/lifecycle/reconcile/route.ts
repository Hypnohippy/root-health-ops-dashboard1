import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { reconcileLifecycle } from "@/lib/lifecycleReconciliation.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withTenantRoute(async function POST(_req: Request, tenant) {
  const result = await reconcileLifecycle(tenant.organisationId);
  return NextResponse.json(result, { status: result.errors.length ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}, { generation: false, write: true });
