import { NextResponse } from "next/server";
import {
  getMonthlyUsage,
  getPlanLimit,
  getCurrentOrganisationPlan,
} from "@/lib/usage";
import { getCurrentUserId } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const plan = await getCurrentOrganisationPlan();
    const limit = getPlanLimit(plan);

    const usage = userId ? await getMonthlyUsage(userId) : 0;

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
