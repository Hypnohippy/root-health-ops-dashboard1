import { NextResponse } from "next/server";
import { getMonthlyUsage } from "@/lib/usage";
import { getCurrentUserId } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ usage: 0, limit: 0 });
    }

    const usage = await getMonthlyUsage(userId);

    // TEMP: hardcoded plan
    const limit = 25;

    return NextResponse.json({
      usage,
      limit,
      remaining: Math.max(limit - usage, 0),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
