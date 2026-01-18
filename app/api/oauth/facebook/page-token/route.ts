// app/api/oauth/facebook/page-token/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userToken = String(body?.userToken || "").trim();
    const pageId = String(body?.pageId || "").trim();

    if (!userToken) {
      return NextResponse.json({ error: "Missing userToken" }, { status: 400 });
    }
    if (!pageId) {
      return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
    }

    const url =
      "https://graph.facebook.com/v24.0/" +
      encodeURIComponent(pageId) +
      "?" +
      new URLSearchParams({
        fields: "id,name,access_token",
        access_token: userToken,
      }).toString();

    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const json: any = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            json?.error?.message ||
            `Facebook Graph error (${res.status}) getting page token`,
          details: json,
        },
        { status: 400 }
      );
    }

    const pageAccessToken = String(json?.access_token || "").trim();
    if (!pageAccessToken) {
      return NextResponse.json(
        {
          error:
            "No page access token returned. Usually: token missing Page access for this Page ID.",
          details: json,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      page: {
        id: String(json?.id || pageId),
        name: String(json?.name || ""),
      },
      pageAccessToken,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "page-token route crashed" },
      { status: 500 }
    );
  }
}
