import { NextRequest, NextResponse } from "next/server";

const MAKE_FB_WEBHOOK_URL = process.env.MAKE_FB_WEBHOOK_URL;

if (!MAKE_FB_WEBHOOK_URL) {
  console.warn(
    "[facebook/post] Missing MAKE_FB_WEBHOOK_URL env var – Facebook via Make is not configured."
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!MAKE_FB_WEBHOOK_URL) {
      return NextResponse.json(
        { error: "Facebook posting is not configured (missing webhook URL)" },
        { status: 500 }
      );
    }

    // We ignore the body for now – scenario posts a fixed caption/link
    const res = await fetch(MAKE_FB_WEBHOOK_URL, {
      method: "POST",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[facebook/post] Make webhook error:", text);
      return NextResponse.json(
        { error: "Failed to trigger Facebook posting" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[facebook/post] Exception:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
