import { loadFacebookConnection } from "@/lib/facebookConnection";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/facebook/post-direct/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const { organisationId } = await requireOrganisation(body?.organisationId);
    const account = await loadFacebookConnection(organisationId);
    const PAGE_ID = account?.page_id;
    const PAGE_ACCESS_TOKEN = account?.page_access_token;
    if (!PAGE_ID || !PAGE_ACCESS_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Facebook is not connected for this organisation.",
        },
        { status: 500 }
      );
    }

    const message = body?.message as string | undefined;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    // Facebook Graph API: POST /{page-id}/feed
    const url = `https://graph.facebook.com/v18.0/${PAGE_ID}/feed`;

    const params = new URLSearchParams();
    params.set("message", message);
    params.set("access_token", PAGE_ACCESS_TOKEN);

    const fbRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    let fbData: any = null;
    try {
      fbData = await fbRes.json();
    } catch {
      fbData = null;
    }

    if (!fbRes.ok) {
      console.error("[facebook/post-direct] Facebook error", fbData || fbRes.status);
      const errMsg =
        fbData?.error?.message ||
        `Facebook returned status ${fbRes.status}. Check your tokens, page ID and permissions.`;
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      facebookResponse: fbData,
    });
  } catch (error: any) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("[facebook/post-direct] Unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected error posting to Facebook." },
      { status: 500 }
    );
  }
}
