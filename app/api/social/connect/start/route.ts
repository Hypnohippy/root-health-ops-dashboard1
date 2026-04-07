// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const origin = req.nextUrl.origin;

  const provider = String(searchParams.get("provider") || "")
    .toLowerCase()
    .trim();

  const map: Record<string, string> = {
    facebook: `${origin}/api/social/callback/facebook`,
    instagram: `${origin}/api/social/callback/facebook`,
    threads: `${origin}/api/oauth/threads/start`,
    linkedin: `${origin}/api/oauth/linkedin/start`,
    tiktok: `${origin}/api/oauth/tiktok/start`,
    google: `${origin}/api/oauth/google/start`,
  };

  const dest = map[provider];

  if (!dest) {
    return NextResponse.redirect(
      new URL(`${origin}/dashboard/connect`),
      { status: 302 }
    );
  }

  return NextResponse.redirect(dest, { status: 302 });
}
