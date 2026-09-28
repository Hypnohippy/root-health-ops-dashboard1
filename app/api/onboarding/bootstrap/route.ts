import { NextRequest, NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";

export const runtime = "nodejs";

// Legacy bootstrap now only resolves an already-authorised membership.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenant = await requireOrganisation(body.organisationId, false);
    return NextResponse.json({ success: true, ...tenant });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to resolve workspace." }, { status: 500 });
  }
}
