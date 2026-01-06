// app/api/social/connections/route.ts
import { NextRequest, NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function GET(_req: NextRequest) {
  try {
    if (!AYRSHARE_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing AYRSHARE_API_KEY" },
        { status: 500 }
      );
    }

    // ✅ Correct Ayrshare endpoint
    const r = await fetch("https://api.ayrshare.com/api/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      },
      cache: "no-store",
    });

    const data = await r.json();

    if (!r.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Ayrshare fetch failed",
          details: data,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        activeSocialAccounts: data.activeSocialAccounts || [],
        accounts: data.displayNames || [],
        monthlyPostCount: data.monthlyPostCount ?? null,
        monthlyPostQuota: data.monthlyPostQuota ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
