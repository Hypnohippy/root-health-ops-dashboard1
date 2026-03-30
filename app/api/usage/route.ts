import { NextResponse } from "next/server";
import {
  getMonthlyUsageForOrganisation,
  getPlanLimit,
  getCurrentOrganisationPlan,
  getCurrentOrganisationId,
} from "@/lib/usage";

export async function GET() {
  try {
    const organisationId = await getCurrentOrganisationId();
    const plan = await getCurrentOrganisationPlan();
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
    return NextResponse.json(
      { error: e?.message || "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
