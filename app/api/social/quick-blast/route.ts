// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

const ALLOWED_PLATFORMS = [
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "tiktok",
  "reddit",
  "twitter",
  "youtube",
  "google",
];

export async function POST(req: NextRequest) {
  try {
    if (!AYRSHARE_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing AYRSHARE_API_KEY in Vercel env." },
        { status: 200 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const message: string = (body?.message ?? "").toString();

    const platformsRaw: any[] = Array.isArray(body?.platforms)
      ? body.platforms
      : [];

    // ✅ IMPORTANT: accept BOTH (UI sends both)
    const imageUrl: string | undefined = body?.imageUrl;
    const videoUrl: string | undefined = body?.videoUrl;

    if (!message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    // Normalize + validate platforms
    const platforms = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean);

    const invalid = platforms.filter((p) => !ALLOWED_PLATFORMS.includes(p));

    if (platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "Choose at least one platform." },
        { status: 200 }
      );
    }

    if (invalid.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported platform(s): ${invalid.join(", ")}`,
          allowed: ALLOWED_PLATFORMS,
        },
        { status: 200 }
      );
    }

    // ✅ Prefer videoUrl if present, otherwise imageUrl
    const media =
      (typeof videoUrl === "string" && videoUrl.trim()
        ? videoUrl.trim()
        : "") ||
      (typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : "");

    const payload: Record<string, any> = {
      post: message,
      platforms,
    };

    // ✅ Actually send media to Ayrshare (THIS is what was missing)
    if (media) {
      payload.mediaUrls = [media];
    }

    // ✅ Helpful hint for IG video routing (safe to include; ignored if not needed)
    // If you ever see IG complain about VIDEO vs REELS again, this gives Ayrshare a clue.
    if (media && platforms.includes("instagram")) {
      payload.instagramOptions = {
        // Ayrshare will ignore unknown fields if not applicable,
        // but this often helps it choose the right IG publish path for video.
        mediaType: "REELS",
      };
    }

    const res = await fetch("https://app.ayrshare.com/api/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      // keep raw
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Ayrshare post failed",
          status: res.status,
          details: json ?? { raw },
          sent: payload,
        },
        { status: 200 }
      );
    }

    // Ayrshare sometimes returns 200 with per-platform errors
    const hasErrors = Array.isArray(json?.errors) && json.errors.length > 0;
    if (hasErrors) {
      return NextResponse.json(
        {
          success: false,
          error: "Ayrshare returned platform errors",
          details: json,
          sent: payload,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: true, posted: true, result: json, sent: payload },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Quick Blast crashed." },
      { status: 200 }
    );
  }
}
