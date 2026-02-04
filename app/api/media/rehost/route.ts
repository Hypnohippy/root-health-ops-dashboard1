// app/api/media/rehost/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ✅ Browser test
 * Visiting /api/media/rehost in the browser should return JSON (not 405).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/media/rehost/route.ts",
    message: "Route is live. Use POST to rehost a remote media URL into Supabase.",
  });
}

/**
 * POST will be implemented next (after GET is confirmed live).
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: "POST not implemented yet. Confirm GET works first.",
    },
    { status: 501 }
  );
}
