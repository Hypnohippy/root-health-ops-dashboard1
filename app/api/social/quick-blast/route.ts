// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function POST(req: NextRequest) {
  if (!AYRSHARE_API_KEY) {
    console.error("Missing AYRSHARE_API_KEY in environment variables");
    return NextResponse.json(
      { error: "Server misconfiguration: missing Ayrshare API key." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    const {
      message,
      platforms,
      channel,
      imageUrl,
    }: {
      message?: string;
      platforms?: string[];
      channel?: string;
      imageUrl?: string;
    } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    let finalPlatforms: string[] = [];

    // Prefer explicit platforms array from the front-end
    if (Array.isArray(platforms) && platforms.length > 0) {
      finalPlatforms = platforms;
    }
    // Fallback: legacy single channel
    else if (typeof channel === "string" && channel.trim().length > 0) {
      finalPlatforms = [channel.trim()];
    }

    // 🔐 TEMP SAFETY NET:
    // If front-end fails to send platforms/channel for any reason,
    // do NOT 400 – just default to ["facebook"] so the request still works.
    if (finalPlatforms.length === 0) {
      finalPlatforms = ["facebook"];
      console.warn(
        "[quick-blast] No platforms/channel provided. Falling back to ['facebook']."
      );
    }

    const payload: Record<string, any> = {
      post: message,
      platforms: finalPlatforms,
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
        platforms: finalPlatforms,
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
