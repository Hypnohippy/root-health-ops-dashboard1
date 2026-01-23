import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function pickText(body: any) {
  const t =
    (typeof body?.text === "string" && body.text) ||
    (typeof body?.message === "string" && body.message) ||
    (typeof body?.content === "string" && body.content) ||
    "";
  return String(t || "").trim();
}

async function getLinkedInAccessToken() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  return token;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = pickText(body);

    if (!text) {
      return NextResponse.json(
        { error: "Missing post text. Send { text: '...' } (or { message: '...' })." },
        { status: 400 }
      );
    }

    const token = await getLinkedInAccessToken();

    // Use OIDC userinfo
    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const userInfo = await safeJson(userRes);

    if (!userRes.ok) {
      return NextResponse.json(
        { error: userInfo?.message || "Failed to fetch LinkedIn user info", details: userInfo },
        { status: 500 }
      );
    }

    const sub = userInfo?.sub as string | undefined;
    if (!sub) {
      return NextResponse.json(
        { error: "No 'sub' field in LinkedIn userinfo response", details: userInfo },
        { status: 500 }
      );
    }

    const authorUrn = `urn:li:person:${sub}`;

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

    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202402",
      },
      body: JSON.stringify(postBody),
    });

    const postJson = await safeJson(postRes);

    if (!postRes.ok) {
      return NextResponse.json(
        { error: postJson?.message || "Failed to post on LinkedIn", details: postJson },
        { status: 500 }
      );
    }

    // ✅ LinkedIn often returns the created URN in headers, not body
    const headerId =
      postRes.headers.get("x-restli-id") ||
      postRes.headers.get("x-linkedin-id") ||
      postRes.headers.get("location") ||
      "";

    const postedId =
      (typeof postJson?.id === "string" && postJson.id) ||
      (typeof postJson === "string" && postJson) ||
      headerId ||
      null;

    return NextResponse.json({
      ok: true,
      postedId,
      raw: postJson,
    });
  } catch (err: any) {
    console.error("LinkedIn post error", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
