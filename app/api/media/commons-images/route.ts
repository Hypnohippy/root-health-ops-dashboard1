import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type CommonsImage = {
  url: string; // ALWAYS a thumbnail URL
  originalUrl?: string;
  title: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
  mime?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
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

async function fetchJson(url: string, ms = 9000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, raw: text.slice(0, 400) };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ success: false, error: "Missing q param." }, { status: 400 });
    }

    const limit = Math.max(
      1,
      Math.min(12, Number(req.nextUrl.searchParams.get("limit") || 6) || 6)
    );

    // IMPORTANT:
    // - We request thumbnails (iiurlwidth) and we will ONLY return thumburl.
    // - We also request mime + size so we can filter out obviously bad results.
    const apiUrl =
      "https://commons.wikimedia.org/w/api.php" +
      `?action=query&format=json&origin=*` +
      `&generator=search` +
      `&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}` +
      `&gsrlimit=${limit}` +
      `&gsrnamespace=6` +
      `&prop=imageinfo` +
      `&iiprop=url|extmetadata|mime|size` +
      `&iiurlwidth=1200`;

    const res = await fetchJson(apiUrl, 9500);

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

      // ✅ FORCE THUMB URL ONLY
      const thumbUrl = safeString(ii?.thumburl).trim();
      const originalUrl = safeString(ii?.url).trim();

      if (!title || !thumbUrl) continue;
      if (!isLikelyImageUrl(thumbUrl)) continue;

      const meta = ii?.extmetadata || {};
      const licenseShortName = stripHtml(safeString(meta?.LicenseShortName?.value));
      const licenseUrl = stripHtml(safeString(meta?.LicenseUrl?.value));
      const artist = stripHtml(safeString(meta?.Artist?.value));
      const credit = stripHtml(safeString(meta?.Credit?.value));
      const attribution = [artist, credit].filter(Boolean).join(" · ").slice(0, 280);

      const mime = safeString(ii?.mime) || undefined;
      const width = Number.isFinite(Number(ii?.thumbwidth)) ? Number(ii.thumbwidth) : undefined;
      const height = Number.isFinite(Number(ii?.thumbheight)) ? Number(ii.thumbheight) : undefined;
      const sizeBytes = Number.isFinite(Number(ii?.size)) ? Number(ii.size) : undefined;

      // Optional: filter out huge originals if sizeBytes is present
      // (Thumb URLs are usually safe, but this gives extra safety.)
      if (sizeBytes && sizeBytes > 20 * 1024 * 1024) {
        continue;
      }

      images.push({
        url: thumbUrl,
        originalUrl: originalUrl || undefined,
        title,
        pageUrl: commonsPageUrl(title),
        licenseShortName: licenseShortName || undefined,
        licenseUrl: licenseUrl || undefined,
        attribution: attribution || undefined,
        mime,
        width,
        height,
        sizeBytes,
      });
    }

    return NextResponse.json(
      { success: true, query: q, images: images.slice(0, limit) },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Commons search failed" },
      { status: 500 }
    );
  }
}
