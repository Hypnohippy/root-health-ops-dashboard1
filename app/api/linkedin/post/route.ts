import { NextRequest, NextResponse } from "next/server";

async function getLinkedInAccessToken() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  }
  return token;
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing 'text' in body" },
        { status: 400 }
      );
    }

    const token = await getLinkedInAccessToken();

    // 🔄 IMPORTANT CHANGE:
    // Use /userinfo (OpenID Connect) instead of /me
    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const userInfo = await userRes.json();

    if (!userRes.ok) {
      return NextResponse.json(
        { error: userInfo.message || "Failed to fetch LinkedIn user info" },
        { status: 500 }
      );
    }

    // "sub" is the member id in OIDC land, used to build the URN
    const sub = userInfo.sub as string | undefined;
    if (!sub) {
      return NextResponse.json(
        { error: "No 'sub' field in LinkedIn userinfo response" },
        { status: 500 }
      );
    }

    const authorUrn = `urn:li:person:${sub}`;

    // Build the UGC post
    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text,
          },
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
        // LinkedIn now expect these headers for v2 UGC posts
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202402",
      },
      body: JSON.stringify(postBody),
    });

    const postData = await postRes.json();

    if (!postRes.ok) {
      return NextResponse.json(
        { error: postData.message || "Failed to post on LinkedIn" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, post: postData });
  } catch (err: any) {
    console.error("LinkedIn post error", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
