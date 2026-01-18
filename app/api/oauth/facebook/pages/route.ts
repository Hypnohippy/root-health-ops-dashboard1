import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type FbPage = { id: string; name: string; access_token?: string };

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("fb_user_token")?.value || "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing token cookie. Please click Connect again." },
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

    const fbRes = await fetch(url, { method: "GET", cache: "no-store" });
    const json: any = await fbRes.json().catch(() => null);

    if (!fbRes.ok) {
      return NextResponse.json(
        {
          error:
            json?.error?.message ||
            `Facebook Graph error (${fbRes.status}) loading pages`,
          details: json,
        },
        { status: 400 }
      );
    }

    const pages: FbPage[] = Array.isArray(json?.data) ? json.data : [];
    return NextResponse.json({ pages });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load pages" },
      { status: 500 }
    );
  }
}
