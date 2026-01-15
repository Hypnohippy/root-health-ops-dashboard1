// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

// Mode C (Make) webhooks — use what you already have in Vercel
const MAKE_FB_WEBHOOK_URL = process.env.MAKE_FB_WEBHOOK_URL;
const MAKE_INSTAGRAM_QUICK_BLAST_WEBHOOK_URL =
  process.env.MAKE_INSTAGRAM_QUICK_BLAST_WEBHOOK_URL;

// Optional: allow a forced mode switch without deleting env vars
// - If QUICK_BLAST_PROVIDER="make" → always Make
// - else → Ayrshare if key exists, otherwise Make (if possible)
const QUICK_BLAST_PROVIDER = (process.env.QUICK_BLAST_PROVIDER || "").toLowerCase();

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
] as const;

type AllowedPlatform = (typeof ALLOWED_PLATFORMS)[number];

function normalizePlatforms(platformsRaw: any[]): AllowedPlatform[] {
  const platforms = (Array.isArray(platformsRaw) ? platformsRaw : [])
    .map((p) => String(p || "").toLowerCase().trim())
    .filter(Boolean);

  const invalid = platforms.filter((p) => !ALLOWED_PLATFORMS.includes(p as any));
  if (invalid.length > 0) {
    throw new Error(`Unsupported platform(s): ${invalid.join(", ")}`);
  }
  if (platforms.length === 0) {
    throw new Error("Choose at least one platform.");
  }
  return platforms as AllowedPlatform[];
}

async function postViaAyrshare(args: {
  message: string;
  platforms: AllowedPlatform[];
  imageUrl?: string;
}) {
  if (!AYRSHARE_API_KEY) {
    return {
      ok: false,
      error: "Missing AYRSHARE_API_KEY in Vercel env.",
      details: null,
    };
  }

  const payload: Record<string, any> = {
    post: args.message,
    platforms: args.platforms,
  };

  if (args.imageUrl && String(args.imageUrl).trim()) {
    payload.mediaUrls = [String(args.imageUrl).trim()];
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
    return {
      ok: false,
      error: "Ayrshare post failed",
      details: json ?? { raw },
      status: res.status,
      sent: payload,
    };
  }

  const hasErrors = Array.isArray(json?.errors) && json.errors.length > 0;
  if (hasErrors) {
    return {
      ok: false,
      error: "Ayrshare returned platform errors",
      details: json,
      sent: payload,
    };
  }

  return { ok: true, result: json, sent: payload };
}

async function postViaMake(args: {
  message: string;
  platforms: AllowedPlatform[];
  imageUrl?: string;
}) {
  // We only wire what you actually have today
  // (Facebook + Instagram). Others will return a clear per-platform error.
  const results: Record<string, any> = {};

  for (const p of args.platforms) {
    try {
      if (p === "facebook") {
        if (!MAKE_FB_WEBHOOK_URL) {
          results[p] = { ok: false, error: "Missing MAKE_FB_WEBHOOK_URL env var." };
          continue;
        }

        const r = await fetch(MAKE_FB_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "facebook",
            message: args.message,
            imageUrl: args.imageUrl || null,
          }),
        });

        const text = await r.text();
        results[p] = { ok: r.ok, status: r.status, body: text };
        continue;
      }

      if (p === "instagram") {
        if (!MAKE_INSTAGRAM_QUICK_BLAST_WEBHOOK_URL) {
          results[p] = {
            ok: false,
            error: "Missing MAKE_INSTAGRAM_QUICK_BLAST_WEBHOOK_URL env var.",
          };
          continue;
        }

        const r = await fetch(MAKE_INSTAGRAM_QUICK_BLAST_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "instagram",
            message: args.message,
            imageUrl: args.imageUrl || null,
          }),
        });

        const text = await r.text();
        results[p] = { ok: r.ok, status: r.status, body: text };
        continue;
      }

      // Not wired yet
      results[p] = {
        ok: false,
        error:
          "This platform is not wired to Make yet. For now, use Facebook/Instagram or enable Ayrshare.",
      };
    } catch (e: any) {
      results[p] = { ok: false, error: e?.message || "Make webhook failed." };
    }
  }

  const anyOk = Object.values(results).some((x: any) => x?.ok);
  return { ok: anyOk, results };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message: string = (body?.message ?? "").toString();
    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];
    const imageUrl: string | undefined = body?.imageUrl;

    if (!message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    let platforms: AllowedPlatform[];
    try {
      platforms = normalizePlatforms(platformsRaw);
    } catch (e: any) {
      return NextResponse.json(
        {
          success: false,
          error: e?.message || "Invalid platform selection.",
          allowed: ALLOWED_PLATFORMS,
        },
        { status: 200 }
      );
    }

    const forceMake = QUICK_BLAST_PROVIDER === "make";
    const canAyrshare = Boolean(AYRSHARE_API_KEY);

    // Provider selection
    if (!forceMake && canAyrshare) {
      const out = await postViaAyrshare({ message, platforms, imageUrl });
      return NextResponse.json(
        { success: out.ok, provider: "ayrshare", ...out },
        { status: 200 }
      );
    }

    // Make fallback (Mode C)
    const out = await postViaMake({ message, platforms, imageUrl });
    return NextResponse.json(
      { success: out.ok, provider: "make", ...out },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Quick Blast crashed." },
      { status: 200 }
    );
  }
}
