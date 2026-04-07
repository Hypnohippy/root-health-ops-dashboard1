// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const origin = req.nextUrl.origin;

  const provider = String(searchParams.get("provider") || "").toLowerCase().trim();

  // Route each provider to its REAL start route
  const map: Record<string, string> = {
    facebook: `${origin}/api/social/connect/start?provider=facebook`, // (if you later change FB/IG to oauth routes, update here)
    instagram: `${origin}/api/social/connect/start?provider=instagram`,
    threads: `${origin}/api/social/connect/start?provider=threads`,
    linkedin: `${origin}/api/oauth/linkedin/start`, // ✅ IMPORTANT
    tiktok: `${origin}/api/oauth/tiktok/start`,
  };

  const dest = map[provider];

  if (!dest) {
    return NextResponse.redirect(new URL(`${origin}/dashboard/connect`), { status: 302 });
  }

  // Prevent self-loop if someone hits the same route without provider
  if (dest === req.nextUrl.toString()) {
    return NextResponse.redirect(new URL(`${origin}/dashboard/connect`), { status: 302 });
  }

  return NextResponse.redirect(dest, { status: 302 });
}
