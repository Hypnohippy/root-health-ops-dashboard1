// app/api/social/connect/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Single entry point for connecting social accounts.
 * We redirect to your Social Engine connect URL (kept in env for flexibility).
 *
 * This keeps your UI clean and avoids per-platform OAuth routes (which you don't have yet).
 */
export async function GET(req: NextRequest) {
  const url = process.env.SOCIAL_ENGINE_CONNECT_URL;

  if (!url) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Missing SOCIAL_ENGINE_CONNECT_URL. Add it in Vercel → Project → Settings → Environment Variables.",
      },
      { status: 500 }
    );
  }

  // Optional: if you want to lock this down later, we can add auth here.
  return NextResponse.redirect(url, { status: 302 });
}
