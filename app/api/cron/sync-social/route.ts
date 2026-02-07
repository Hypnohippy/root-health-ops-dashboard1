import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const secret = (process.env.CRON_SECRET || "").trim();
    if (secret) {
      const got = (req.nextUrl.searchParams.get("secret") || "").trim();
      if (got !== secret) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const origin = req.nextUrl.origin;

    const res = await fetch(`${origin}/api/social/responses/sync-meta`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-cron-secret": secret } : {}),
      },
      cache: "no-store",
    });

    const json = await res.json().catch(() => null);

    return NextResponse.json({ ok: res.ok, status: res.status, result: json }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Cron failed" }, { status: 200 });
  }
}
