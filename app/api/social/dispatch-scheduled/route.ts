import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(req: NextRequest) {
  // Vercel Cron sends this header automatically:
  // https://vercel.com/docs/cron-jobs#securing-cron-jobs
  const vercelCron = req.headers.get("x-vercel-cron");
  if (vercelCron) return true;

  // Also allow manual trigger with a secret query param (for debugging)
  const secret = req.nextUrl.searchParams.get("secret");
  if (CRON_SECRET && secret === CRON_SECRET) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // ... keep the rest of your existing dispatch code exactly as-is below this line
