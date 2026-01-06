// app/api/social/connections/route.ts
import { NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function GET() {
  if (!AYRSHARE_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Missing AYRSHARE_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://app.ayrshare.com/api/accounts", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      },
      // avoid caching surprises in serverless
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Ayrshare accounts fetch failed",
          status: res.status,
          details: data,
        },
        { status: res.status }
      );
    }

    const rawAccounts: any[] = Array.isArray(data?.accounts) ? data.accounts : [];

    const platforms = Array.from(
      new Set(
        rawAccounts
          .map((a) => String(a?.platform || "").toLowerCase().trim())
          .filter(Boolean)
      )
    );

    return NextResponse.json(
      {
        success: true,
        platforms,
        accounts: rawAccounts.map((a) => ({
          platform: String(a?.platform || "").toLowerCase().trim(),
          username: a?.username ?? a?.user ?? a?.handle ?? null,
          displayName: a?.displayName ?? a?.name ?? null,
          profileUrl: a?.profileUrl ?? a?.url ?? null,
        })),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/social/connections] error", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Ayrshare accounts" },
      { status: 500 }
    );
  }
}
