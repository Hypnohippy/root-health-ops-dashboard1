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
    facebook: `${origin}/api/oauth/facebook/start`,
    instagram: `${origin}/api/oauth/facebook/start`,
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

  const out = new URL(dest);
  const organisationId =
    String(searchParams.get("organisationId") || "").trim() ||
    String(searchParams.get("organisation_id") || "").trim();

  if (organisationId) {
    out.searchParams.set("organisationId", organisationId);
  }

  if (provider === "instagram") {
    out.searchParams.set("provider", "instagram");
  }

  return NextResponse.redirect(out.toString(), { status: 302 });
}
