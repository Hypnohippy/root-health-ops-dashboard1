// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const base = process.env.SOCIAL_ENGINE_CONNECT_URL;

  if (!base) {
    return NextResponse.json(
      { success: false, error: "Missing SOCIAL_ENGINE_CONNECT_URL in Vercel." },
      { status: 500 }
    );
  }

  // Optional: keep provider for future logging/auditing
  const provider = req.nextUrl.searchParams.get("provider") || "unknown";
  console.log("[connect/start] provider:", provider);

  // For now, just redirect to the social engine connect page
  return NextResponse.redirect(base, { status: 302 });
}
