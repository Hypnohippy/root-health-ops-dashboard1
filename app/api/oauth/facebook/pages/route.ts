// app/api/oauth/facebook/pages/route.ts
import { NextRequest, NextResponse } from "next/server";

function base64UrlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

type StatePayload = {
  organisationId?: string;
  t?: number;
  nonce?: string;
};

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    const stateRaw = req.nextUrl.searchParams.get("state") || "";

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    let state: StatePayload = {};
    if (stateRaw) {
      try {
        state = JSON.parse(base64UrlDecode(stateRaw));
      } catch {
        state = {};
      }
    }

    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category&access_token=${encodeURIComponent(
        token
      )}`,
      { method: "GET", cache: "no-store" }
    );

    const pagesJson: any = await pagesRes.json().catch(() => null);

    if (!pagesRes.ok) {
      return NextResponse.json(
        { error: "Could not load Pages", details: pagesJson },
        { status: 400 }
      );
    }

    const pages: any[] = Array.isArray(pagesJson?.data) ? pagesJson.data : [];

    return NextResponse.json(
      {
        success: true,
        organisationId: state.organisationId || null,
        pages: pages.map((p) => ({
          id: String(p.id || ""),
          name: String(p.name || ""),
          category: String(p.category || ""),
          // we keep the page token here so the client can submit the chosen one
          pageAccessToken: String(p.access_token || ""),
        })),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "pages route crashed" },
      { status: 500 }
    );
  }
}
