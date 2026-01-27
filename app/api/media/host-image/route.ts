// app/api/media/host-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url || "").trim();
    const folder = String(body?.folder || "brainstorm").trim();
    const filenameBase = String(body?.filenameBase || "commons").trim();

    if (!/^https?:\/\/.+/i.test(url)) {
      return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
    }

    // Reuse upload route (single source of truth)
    const res = await fetch(new URL("/api/media/upload", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, folder, filenameBase }),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || `Host failed (${res.status})`, details: data?.details || null },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: true, publicUrl: data.publicUrl, path: data.path, bucket: data.bucket },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
