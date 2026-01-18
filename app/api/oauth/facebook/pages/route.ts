import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("fb_user_token")?.value || "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing fb_user_token cookie. Click Connect Facebook again." },
        { status: 401 }
      );
    }

    const url =
      "https://graph.facebook.com/v24.0/me/accounts?" +
      new URLSearchParams({
        fields: "id,name,access_token",
        limit: "100",
        access_token: token,
      }).toString();

    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const json: any = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Facebook Graph error", details: json },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: Array.isArray(json?.data) ? json.data : [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load pages" },
      { status: 500 }
    );
  }
}
