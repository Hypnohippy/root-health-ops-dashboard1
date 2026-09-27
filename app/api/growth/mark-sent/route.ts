import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";

// Legacy clients must refresh and provide an evidence-backed manual receipt.
// Never advance cadence from an unversioned "mark sent" request.
export const POST = withTenantRoute(async function POST() {
  return NextResponse.json({ success: false, error: "Use Verify manual takeover in Growth to record actual completion safely." }, { status: 409 });
}, { generation: false, write: true });
