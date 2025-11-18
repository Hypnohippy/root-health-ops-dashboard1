import { NextRequest, NextResponse } from "next/server";

const MAKE_FB_WEBHOOK_URL = process.env.MAKE_FB_WEBHOOK_URL;

export async function POST(req: NextRequest) {
  try {
    if (!MAKE_FB_WEBHOOK_URL) {
      return NextResponse.json(
        { error: "Facebook posting is not configured (no webhook URL)" },
        { status: 500 }
      );
    }

    // For now we ignore the body. The Make scenario posts a fixed caption/link.
    const res = await fetch(MAKE_FB_WEBHOOK_URL, {
      method: "POST",
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("[facebook/post] Make webhook error:", res.status, text);
      return NextResponse.json(
        {
          error: "Make webhook call failed",
          status: res.status,
          details: text,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, details: text });
  } catch (err: any) {
    console.error("[facebook/post] Exception:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
