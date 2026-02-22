// app/api/media/commons-images/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type CommonsImage = {
  url: string;
  title: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
};

function safeString(v: any) {
  return typeof v === "string" ? v : "";
}

function stripHtml(s: string) {
  return String(s || "").replace(/<[^>]+>/g, "").trim();
}

function commonsPageUrl(title: string) {
  const encoded = encodeURIComponent(String(title || "").replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/${encoded}`;
}

function isLikelyImageUrl(url: string) {
  const u = safeString(url).trim();
  if (!u) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

/**
 * ---- Enterprise hardening (v1) ----
 * - In-memory cache (10 mins)
 * - Basic rate limit per client (burst control)
 * - Proper User-Agent to Wikimedia (best practice)
 *
 * Note: In-memory cache/rate resets on serverless cold starts.
 * For true enterprise multi-region, move to Redis/Upstash later.
 */
type CacheEntry = { expiresAt: number; data: any };
const CACHE = new Map<string, CacheEntry>();

type RateEntry = { windowStart: number; count: number };
const RATE = new Map<string, RateEntry>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RATE_WINDOW_MS = 10 * 1000; // 10 seconds
const RATE_MAX = 8; // max 8 requests per 10 seconds per client

function norm(v: any) {
  return String(v ?? "").trim();
}

function getClientKey(req: NextRequest) {
  const fwd = norm(req.headers.get("x-forwarded-for"));
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

function getCache(key: string) {
  const it = CACHE.get(key);
  if (!it) return null;
  if (Date.now() > it.expiresAt) {
    CACHE.delete(key);
    return null;
  }
  return it.data;
}

function setCache(key: string, data: any) {
  CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
}

function rateLimit(req: NextRequest) {
  const key = getClientKey(req);
  const now = Date.now();
  const entry = RATE.get(key);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    RATE.set(key, { windowStart: now, count: 1 });
    return { ok: true as const, retryAfter: 0 };
  }

  entry.count += 1;
  RATE.set(key, entry);

  if (entry.count > RATE_MAX) {
    const retryAfter = Math.ceil(
      (RATE_WINDOW_MS - (now - entry.windowStart)) / 1000
    );
    return { ok: false as const, retryAfter: Math.max(1, retryAfter) };
  }

  return { ok: true as const, retryAfter: 0 };
}

async function fetchJson(url: string, ms = 9000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        // Wikimedia prefers an identifying UA. This helps reduce blocks/429.
        "User-Agent":
          "RootHealthOps/1.0 (https://roothealthops.com; support@roothealthops.com)",
        Accept: "application/json",
      },
    });

    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : null;

    return {
      ok: res.ok,
      status: res.status,
      json,
      raw: text.slice(0, 400),
      retryAfter: Number.isFinite(retryAfter as any) ? retryAfter : null,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  try {
    // Local burst control
    const rl = rateLimit(req);
    if (!rl.ok) {
      const res = NextResponse.json(
        {
          success: false,
          error: "Too many image searches too quickly. Wait a moment and try again.",
        },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(rl.retryAfter));
      return res;
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json(
        { success: false, error: "Missing q param." },
        { status: 400 }
      );
    }

    const limit = Math.max(
      1,
      Math.min(12, Number(req.nextUrl.searchParams.get("limit") || 6) || 6)
    );

    // Cache (same search often repeated)
    const cacheKey = `commons-images:q=${q.toLowerCase()}:limit=${limit}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(
        {
          success: true,
          query: q,
          images: cached as CommonsImage[],
          cached: true,
        },
        { status: 200 }
      );
    }

    // Wikimedia Commons API
    const apiUrl =
      "https://commons.wikimedia.org/w/api.php" +
      `?action=query&format=json&origin=*` +
      `&generator=search` +
      `&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}` +
      `&gsrlimit=${limit}` +
      `&gsrnamespace=6` +
      `&prop=imageinfo` +
      `&iiprop=url|extmetadata` +
      `&iiurlwidth=640`;

    const res = await fetchJson(apiUrl, 9000);

    // If Wikimedia itself is rate limiting us
    if (res.status === 429) {
      const retryAfter = res.retryAfter ?? 10;
      const out = NextResponse.json(
        {
          success: false,
          error: "Wikimedia rate limit hit (429). Please wait a little and try again.",
        },
        { status: 429 }
      );
      out.headers.set("Retry-After", String(retryAfter));
      return out;
    }

    if (!res.ok || !res.json) {
      return NextResponse.json(
        {
          success: false,
          error:
            res.status === 0
              ? "Wikimedia didn’t respond in time. Try again."
              : `Wikimedia request failed (HTTP ${res.status}). Try again.`,
          debug: { status: res.status, sample: res.raw },
        },
        { status: 200 }
      );
    }

    const pages = res.json?.query?.pages ? Object.values(res.json.query.pages) : [];
    const images: CommonsImage[] = [];

    for (const p of pages as any[]) {
      const title = safeString(p?.title);
      const ii = p?.imageinfo?.[0];

      const url = safeString(ii?.thumburl) || safeString(ii?.url);
      if (!title || !url) continue;
      if (!isLikelyImageUrl(url)) continue;

      const meta = ii?.extmetadata || {};
      const licenseShortName = stripHtml(safeString(meta?.LicenseShortName?.value));
      const licenseUrl = stripHtml(safeString(meta?.LicenseUrl?.value));
      const artist = stripHtml(safeString(meta?.Artist?.value));
      const credit = stripHtml(safeString(meta?.Credit?.value));

      const attribution = [artist, credit].filter(Boolean).join(" · ").slice(0, 280);

      images.push({
        url,
        title,
        pageUrl: commonsPageUrl(title),
        licenseShortName: licenseShortName || undefined,
        licenseUrl: licenseUrl || undefined,
        attribution: attribution || undefined,
      });
    }

    const finalImages = images.slice(0, limit);

    // Store cache
    setCache(cacheKey, finalImages);

    return NextResponse.json(
      {
        success: true,
        query: q,
        images: finalImages,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Commons search failed" },
      { status: 500 }
    );
  }
}
