// app/api/social/connections/route.ts
import { NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function GET() {
  try {
    if (!AYRSHARE_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing AYRSHARE_API_KEY in env vars." },
        { status: 500 }
      );
    }

    // ✅ Correct Ayrshare endpoint for connected profiles/accounts:
    // GET https://api.ayrshare.com/api/user
    const r = await fetch("https://api.ayrshare.com/api/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      },
      // Avoid caching stale connection state
      cache: "no-store",
    });

    const text = await r.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // keep raw body if not JSON
      data = { raw: text };
    }

    if (!r.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Ayrshare user fetch failed",
          status: r.status,
          details: data,
        },
        { status: 500 }
      );
    }

    // Return only what the UI needs (and nothing sensitive)
    const activeSocialAccounts = Array.isArray(data?.activeSocialAccounts)
      ? data.activeSocialAccounts
      : [];

    const displayNames = Array.isArray(data?.displayNames) ? data.displayNames : [];

    return NextResponse.json(
      {
        success: true,
        activeSocialAccounts,
        displayNames,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Internal error in /api/social/connections",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
