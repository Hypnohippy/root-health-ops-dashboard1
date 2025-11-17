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

    // Get current user info (to know author URN)
    const meRes = await fetch("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const me = await meRes.json();
    if (!meRes.ok) {
      return NextResponse.json(
        { error: me.message || "Failed to fetch LinkedIn profile" },
        { status: 500 }
      );
    }

    const personId = me.id;
    if (!personId) {
      return NextResponse.json(
        { error: "Could not determine LinkedIn person id" },
        { status: 500 }
      );
    }

    const authorUrn = `urn:li:person:${personId}`;

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
        "X-Restli-Protocol-Version": "2.0.0",
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
