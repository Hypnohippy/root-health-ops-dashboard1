import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import {
  getMonthlyUsageForOrganisation,
  getPlanLimit,
  getCurrentOrganisationPlan,
  getCurrentOrganisationId,
} from "@/lib/usage";

export async function GET(req: Request) {
  try {
    const organisationId = await getCurrentOrganisationId(new URL(req.url).searchParams.get("organisationId") || undefined);
    const plan = await getCurrentOrganisationPlan(organisationId);
    const limit = getPlanLimit(plan);

    const usage = organisationId
      ? await getMonthlyUsageForOrganisation(organisationId)
      : 0;

    return NextResponse.json({
      usage,
      limit,
      remaining: Math.max(limit - usage, 0),
      plan,
    });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json(
      { error: e?.message || "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
