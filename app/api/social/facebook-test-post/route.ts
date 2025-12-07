// app/api/social/facebook-test-post/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { message, link } = await req.json();

    const webhookUrl = process.env.FACEBOOK_TEST_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        {
          error:
            "FACEBOOK_TEST_WEBHOOK_URL is not set. Add it in your Vercel environment settings.",
        },
        { status: 500 }
      );
    }

    const payload = {
      message: message || "Test post from Root Health Ops.",
      link: link || "",
    };

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[facebook-test-post] webhook failed", text);
      return NextResponse.json(
        { error: "Make webhook call failed", details: text },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[facebook-test-post] error", err);
    return NextResponse.json(
      { error: "Unexpected error triggering Facebook test post" },
      { status: 500 }
    );
  }
}
