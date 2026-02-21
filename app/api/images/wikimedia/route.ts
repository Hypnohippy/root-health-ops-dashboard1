import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Simple in-memory cache + rate limiter (per server instance).
 * This is already good enough for “enterprise hardening” v1:
 * - prevents spam bursts
 * - reduces external dependency load
 * - keeps UI fast
 *
 * If you later want multi-region durability, we can move cache/rate-limit to Redis/Upstash.
 */

type CacheEntry = { expiresAt: number; data: any };
const CACHE = new Map<string, CacheEntry>();

type RateEntry = { windowStart: number; count: number };
const RATE = new Map<string, RateEntry>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const RATE_WINDOW_MS = 10 * 1000;    // 10 sec
const RATE_MAX = 8;                  // max 8 requests / 10 sec per IP-ish

function norm(v: any) {
  return String(v ?? "").trim();
}

function getClientKey(req: NextRequest) {
  // Best effort: Vercel/proxies may provide this header
  const fwd = norm(req.headers.get("x-forwarded-for"));
  if (fwd) return fwd.split(",")[0].trim();
  // fallback
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

function rateLimitOrThrow(req: NextRequest) {
  const key = getClientKey(req);
  const now = Date.now();
  const entry = RATE.get(key);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    RATE.set(key, { windowStart: now, count: 1 });
    return;
  }

  entry.count += 1;
  RATE.set(key, entry);

  if (entry.count > RATE_MAX) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - entry.windowStart)) / 1000);
    const res = NextResponse.json(
      {
        success: false,
        error: "Rate limited (local). Please wait a moment and try again.",
        retryAfter,
      },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(retryAfter));
    throw res;
  }
}

async function fetchJson(url: string) {
  // Wikimedia asks for an identifying UA; for server requests we can set User-Agent.
  // (From browser JS you often cannot, so this proxy route is the right approach.)
  const headers: Record<string, string> = {
    "User-Agent": "RootHealthOps/1.0 (https://roothealthops.com; support@roothealthops.com)",
    "Accept": "application/json",
  };

  const r = await fetch(url, { headers, cache: "no-store" });

  // If Wikimedia rate limits us, pass back a helpful message
  if (r.status === 429) {
    const retryAfter = r.headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : null;
    return {
      __rate_limited: true,
      retryAfter: Number.isFinite(seconds as any) ? seconds : null,
      status: 429,
      text: await r.text().catch(() => ""),
    };
  }

  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { __parse_error: true, status: r.status, text };
  }
}

export async function GET(req: NextRequest) {
  try {
    // Local rate limit first (protects you + Wikimedia)
    try {
      rateLimitOrThrow(req);
    } catch (resp: any) {
      // If we threw a NextResponse above, return it
      if (resp instanceof NextResponse) return resp;
      throw resp;
    }

    const { searchParams } = new URL(req.url);
    const q = norm(searchParams.get("q"));
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "6"), 1), 12);
    const thumb = Math.min(Math.max(Number(searchParams.get("thumb") || "420"), 120), 1200);

    if (!q) {
      return NextResponse.json(
        { success: false, error: "Missing q (search query)." },
        { status: 400 }
      );
    }

    const cacheKey = `wikimedia:q=${q.toLowerCase()}:l=${limit}:t=${thumb}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, cached: true, items: cached });
    }

    // Wikimedia Commons Action API search (returns images + thumbnail urls)
    const url =
      "https://commons.wikimedia.org/w/api.php" +
      "?action=query" +
      "&format=json" +
      "&origin=*" +
      "&generator=search" +
      `&gsrsearch=${encodeURIComponent(q)}` +
      "&gsrnamespace=6" + // File:
      `&gsrlimit=${encodeURIComponent(String(limit))}` +
      "&prop=imageinfo" +
      `&iiprop=url|mime|extmetadata` +
      `&iiurlwidth=${encodeURIComponent(String(thumb))}`;

    const json: any = await fetchJson(url);

    if (json?.__rate_limited) {
      const retryAfter = json.retryAfter ?? 10;
      const res = NextResponse.json(
        {
          success: false,
          error: "Wikimedia rate limit hit (429). Slow down and retry.",
          retryAfter,
        },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(retryAfter));
      return res;
    }

    const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
    const items = (pages as any[])
      .map((p) => {
        const ii = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
        if (!ii) return null;

        const title = String(p?.title || "").replace(/^File:/i, "");
        const thumbUrl = ii?.thumburl || null;
        const fullUrl = ii?.url || null;

        // some nice-to-have licensing metadata
        const meta = ii?.extmetadata || {};
        const license = meta?.LicenseShortName?.value || meta?.License?.value || null;
        const author = meta?.Artist?.value || null;
        const credit = meta?.Credit?.value || null;

        return {
          title,
          thumbUrl,
          fullUrl,
          license,
          author,
          credit,
          pageId: p?.pageid ?? null,
        };
      })
      .filter(Boolean);

    setCache(cacheKey, items);

    return NextResponse.json({ success: true, cached: false, items });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Wikimedia search failed." },
      { status: 500 }
    );
  }
}
