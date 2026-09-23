import { requireLegacyFacebookOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { NextResponse } from "next/server";

// 🔍 Simple GET so you can check the route in a browser
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/facebook-test-post",
    message:
      "If you see this in the browser, the API route path is correct and returning JSON.",
  });
}

export async function POST(req: Request) {
  try {
    await requireLegacyFacebookOrganisation();
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const webhookUrl = process.env.FACEBOOK_TEST_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "FACEBOOK_TEST_WEBHOOK_URL is not set on the server" },
        { status: 500 }
      );
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        source: "root-health-ops-dashboard",
        channel: "facebook_test",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Make webhook failed: ${text}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return NextResponse.json(
      { error: error.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
