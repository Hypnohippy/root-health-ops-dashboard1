// app/api/oauth/facebook/pages/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?` +
        new URLSearchParams({
          fields: "id,name,tasks",
          access_token: token,
        }).toString(),
      { method: "GET", cache: "no-store" }
    );

    const json: any = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not load Facebook Pages. Usually: wrong token, missing scopes, or no Page access.", details: json },
        { status: 400 }
      );
    }

    return NextResponse.json(json, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "pages route crashed" },
      { status: 500 }
    );
  }
}
