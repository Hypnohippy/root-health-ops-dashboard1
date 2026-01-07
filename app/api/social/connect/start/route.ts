// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

const CONNECT_BASE_URL =
  process.env.SOCIAL_ENGINE_CONNECT_URL ||
  process.env.NEXT_PUBLIC_SOCIAL_ENGINE_CONNECT_URL;

const CONNECT_SECRET = process.env.SOCIAL_ENGINE_CONNECT_SECRET;

const ALLOWED = new Set([
  "instagram",
  "tiktok",
  "linkedin",
  "google",
  "whatsapp",
  "threads",
]);

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get("provider") || "").toLowerCase();

  if (!provider || !ALLOWED.has(provider)) {
    return NextResponse.json(
      { success: false, error: "Invalid provider" },
      { status: 400 }
    );
  }

  // Temporary safe behaviour until real OAuth is wired
  if (!CONNECT_BASE_URL) {
    return NextResponse.json(
      {
        success: false,
        provider,
        message:
          "Connection flow not enabled yet. This button is wired correctly but awaits OAuth setup.",
      },
      { status: 200 }
    );
  }

  const url = new URL(CONNECT_BASE_URL);
  url.searchParams.set("provider", provider);

  if (CONNECT_SECRET) {
    url.searchParams.set("secret", CONNECT_SECRET);
  }

  return NextResponse.redirect(url.toString(), { status: 302 });
}
