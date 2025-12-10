// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

if (!AYRSHARE_API_KEY) {
  console.error("Missing AYRSHARE_API_KEY in environment variables");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // New: support either `platforms` (array) or legacy `channel` (single string)
    const {
      message,
      platforms,
      channel, // legacy: "facebook" | "instagram" | "linkedin" | "tiktok" | ...
      imageUrl,
    } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    let finalPlatforms: string[] = [];

    if (Array.isArray(platforms) && platforms.length > 0) {
      finalPlatforms = platforms;
    } else if (typeof channel === "string" && channel.trim().length > 0) {
      finalPlatforms = [channel.trim()];
    }

    if (finalPlatforms.length === 0) {
      return NextResponse.json(
        { error: "At least one platform or channel is required" },
        { status: 400 }
      );
    }

    const payload: Record<string, any> = {
      post: message,
      platforms: finalPlatforms, // e.g. ["facebook"], ["instagram"], ["linkedin"], ["tiktok"]
    };

    if (imageUrl && typeof imageUrl === "string" && imageUrl.trim().length > 0) {
      payload.mediaUrls = [imageUrl.trim()];
    }

    const res = await fetch("https://app.ayrshare.com/api/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Ayrshare error", res.status, data);
      return NextResponse.json(
        {
          error: "Failed to post via Ayrshare",
          details: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in /api/social/quick-blast:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
