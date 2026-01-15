// app/api/social/connect/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Root Health Ops - Social Connect entrypoint
 *
 * We standardize all connects through our internal start route:
 *   /api/social/connect/start?provider=facebook|linkedin|instagram|threads|tiktok|google|whatsapp
 *
 * This avoids relying on SOCIAL_ENGINE_CONNECT_URL (which can silently point somewhere else).
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;

  // If the UI passes a provider, forward to our start route
  const provider = (searchParams.get("provider") || "").toLowerCase().trim();

  // Allowed providers we support in UI
  const allowed = new Set([
    "facebook",
    "instagram",
    "linkedin",
    "threads",
    "tiktok",
    "google",
    "whatsapp",
  ]);

  // If provider is valid, go to our internal OAuth start
  if (provider && allowed.has(provider)) {
    const url = new URL(`${origin}/api/social/connect/start`);
    url.searchParams.set("provider", provider);
    return NextResponse.redirect(url, { status: 302 });
  }

  // Backwards compatibility: if you *still* want to use SOCIAL_ENGINE_CONNECT_URL,
  // only use it when NO provider was provided.
  const engineUrl = process.env.SOCIAL_ENGINE_CONNECT_URL;
  if (engineUrl && !provider) {
    return NextResponse.redirect(engineUrl, { status: 302 });
  }

  // Default: send user back to the dashboard connect page (no blank JSON pages)
  return NextResponse.redirect(new URL(`${origin}/dashboard/connect`), { status: 302 });
}
