// app/api/media/commons-images/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/media/commons-images?q=calm+health&limit=9
 * Also supports: ?query=...
 *
 * Returns BOTH shapes to avoid UI drift:
 * {
 *   success: true,
 *   query: "calm health",
 *   images: [{ url, title, pageUrl, licenseShortName?, licenseUrl?, attribution? }],
 *   items:  [{ title, url, thumb }]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Support both param names so UI + Brainstorm patterns don’t drift
    const q =
      String(url.searchParams.get("q") || "").trim() ||
      String(url.searchParams.get("query") || "").trim();

    const limitRaw = url.searchParams.get("limit");
    const limit = Number.isFinite(Number(limitRaw)) ? Math.min(24, Math.max(1, Number(limitRaw))) : 12;

    if (!q) {
      return NextResponse.json(
        { success: false, error: "Missing query param: q (or query)" },
        { status: 200 }
      );
    }

    const endpoint = "https://commons.wikimedia.org/w/api.php";

    // Helpers
    const isImageTitle = (t: string) => {
      const s = String(t || "").toLowerCase().trim();
      // Only allow common image extensions
      return (
        s.endsWith(".jpg") ||
        s.endsWith(".jpeg") ||
        s.endsWith(".png") ||
        s.endsWith(".gif") ||
        s.endsWith(".webp") ||
        s.endsWith(".svg") ||
        s.endsWith(".tif") ||
        s.endsWith(".tiff")
      );
    };

    const toFilePageUrl = (title: string) =>
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;

    const pickExtMetaText = (ext: any, key: string) => {
      const v = ext?.[key];
      const raw = typeof v?.value === "string" ? v.value : "";
      return raw || "";
    };

    // 1) Search Commons for File: pages
    const searchParams = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      list: "search",
      srsearch: q,
      srnamespace: "6", // File namespace
      srlimit: String(Math.min(24, Math.max(1, limit * 3))), // grab extra, we filter non-images
    });

    const searchRes = await fetch(`${endpoint}?${searchParams.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "RootHealthOps/1.0 (commons-images)" },
    });

    const searchJson: any = await searchRes.json().catch(() => null);
    const searchHits: any[] = Array.isArray(searchJson?.query?.search) ? searchJson.query.search : [];

    if (searchHits.length === 0) {
      return NextResponse.json({ success: true, query: q, images: [], items: [] }, { status: 200 });
    }

    // Convert search results into page titles, filter to image file extensions
    const titles = searchHits
      .map((s) => String(s?.title || "").trim())
      .filter(Boolean)
      .filter(isImageTitle)
      .slice(0, 24);

    if (titles.length === 0) {
      return NextResponse.json({ success: true, query: q, images: [], items: [] }, { status: 200 });
    }

    // 2) Fetch imageinfo (url + thumb + extmetadata for licensing)
    const infoParams = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "960",
      titles: titles.join("|"),
    });

    const infoRes = await fetch(`${endpoint}?${infoParams.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "RootHealthOps/1.0 (commons-images)" },
    });

    const infoJson: any = await infoRes.json().catch(() => null);
    const pages = infoJson?.query?.pages || {};

    const images = Object.values(pages)
      .map((p: any) => {
        const title = String(p?.title || "").trim();
        if (!title || !isImageTitle(title)) return null;

        const ii = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
        const fileUrl = String(ii?.url || "").trim();
        const thumbUrl = String(ii?.thumburl || "").trim();

        if (!fileUrl) return null;

        const ext = ii?.extmetadata || {};
        const licenseShortName =
          pickExtMetaText(ext, "LicenseShortName") ||
          pickExtMetaText(ext, "License") ||
          "";

        const licenseUrl =
          pickExtMetaText(ext, "LicenseUrl") ||
          "";

        // Best-effort attribution (Commons varies a lot)
        const attribution =
          pickExtMetaText(ext, "Attribution") ||
          pickExtMetaText(ext, "Artist") ||
          pickExtMetaText(ext, "Credit") ||
          "";

        return {
          url: fileUrl,
          title,
          pageUrl: toFilePageUrl(title),
          licenseShortName: licenseShortName || undefined,
          licenseUrl: licenseUrl || undefined,
          attribution: attribution || undefined,

          // keep thumb around internally (Scheduled page uses thumb sometimes)
          _thumb: thumbUrl || fileUrl,
        };
      })
      .filter(Boolean) as Array<{
      url: string;
      title: string;
      pageUrl: string;
      licenseShortName?: string;
      licenseUrl?: string;
      attribution?: string;
      _thumb: string;
    }>;

    // Apply limit after filtering
    const trimmed = images.slice(0, limit);

    // Backwards compatible "items" (your earlier consumers)
    const items = trimmed.map((img) => ({
      title: img.title,
      url: img.url,
      thumb: img._thumb || img.url,
    }));

    // Drop internal field
    const imagesOut = trimmed.map(({ _thumb, ...rest }) => rest);

    return NextResponse.json(
      { success: true, query: q, images: imagesOut, items },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "commons-images failed" },
      { status: 200 }
    );
  }
}
