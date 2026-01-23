// app/api/linkedin/post/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function getLinkedInAccessToken() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  return token;
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, headers: res.headers };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // ✅ Backwards compatible: accept text OR message
    const text = String(body?.text ?? body?.message ?? "").trim();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Missing 'text' (or 'message') in body" },
        { status: 400 }
      );
    }

    const token = await getLinkedInAccessToken();

    // ✅ OIDC userinfo (works with openid/profile scopes)
    const userRes = await fetchJson("https://api.linkedin.com/v2/userinfo", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!userRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            userRes.json?.message ||
            userRes.json?.error_description ||
            "Failed to fetch LinkedIn user info",
          details: userRes.json,
          status: userRes.status,
        },
        { status: 500 }
      );
    }

    const sub = userRes.json?.sub ? String(userRes.json.sub) : "";
    if (!sub) {
      return NextResponse.json(
        { ok: false, error: "No 'sub' field in LinkedIn userinfo response", details: userRes.json },
        { status: 500 }
      );
    }

    const authorUrn = `urn:li:person:${sub}`;

    // ✅ Text-only UGC post (images/video later)
    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    // LinkedIn returns the new post URN in the "x-restli-id" header for ugcPosts
    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202402",
      },
      body: JSON.stringify(postBody),
      cache: "no-store",
    });

    const postJson: any = await postRes.json().catch(() => null);
    const postedIdHeader = postRes.headers.get("x-restli-id") || "";
    const postedId =
      postedIdHeader ||
      postJson?.id ||
      postJson?.entity ||
      null;

    if (!postRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: postJson?.message || postJson?.error || "Failed to post on LinkedIn",
          details: postJson,
          status: postRes.status,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      postedId,
      raw: postJson,
    });
  } catch (err: any) {
    console.error("[linkedin/post] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
