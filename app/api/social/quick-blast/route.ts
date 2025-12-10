// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function POST(req: NextRequest) {
  if (!AYRSHARE_API_KEY) {
    console.error("Missing AYRSHARE_API_KEY in environment variables");
    return NextResponse.json(
      { success: false, error: "Server misconfiguration: missing Ayrshare API key." },
      { status: 200 }
    );
  }

  try {
    const body = await req.json();

    const {
      message,
      channel,
      imageUrl,
    }: {
      message?: string;
      channel?: string;
      imageUrl?: string;
    } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { success: false, error: "message is required" },
        { status: 200 }
      );
    }

    if (!channel || typeof channel !== "string" || !channel.trim()) {
      return NextResponse.json(
        { success: false, error: "channel is required" },
        { status: 200 }
      );
    }

    const platform = channel.trim(); // "facebook" | "instagram" | "linkedin" | "tiktok" etc.

    const payload: Record<string, any> = {
      post: message,
      platforms: [platform],
    };

    if (imageUrl && typeof imageUrl === "string" && imageUrl.trim().length > 0) {
      payload.mediaUrls = [imageUrl.trim()];
    }

    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch (e) {
      console.error("Ayrshare non-JSON response", res.status);
    }

    const statusFromBody = data && typeof data === "object" ? data.status : null;

    // If HTTP status is not OK or Ayrshare returns status: "error", treat as failure
    if (!res.ok || statusFromBody === "error") {
      console.error("Ayrshare error", res.status, data);
      return NextResponse.json(
        {
          success: false,
          // 👇 Surface the full Ayrshare payload so we can see exactly what they are complaining about
          error:
            (data && (data.error || data.message)) ||
            `Ayrshare returned ${res.status}: ${JSON.stringify(data)}`,
          ayrshareStatusCode: res.status,
          ayrshareRaw: data,
        },
        { status: 200 }
      );
    }

    // Success case
    return NextResponse.json(
      {
        success: true,
        ayrshareStatusCode: res.status,
        ayrshareRaw: data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in /api/social/quick-blast:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 200 }
    );
  }
}
