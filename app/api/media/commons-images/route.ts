// app/api/media/commons-images/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/media/commons-images?q=calm+health
 * Also supports: ?query=...
 *
 * Returns:
 * { success: true, items: [{ title, url, thumb }] }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Support both param names so UI + Brainstorm patterns don’t drift
    const q =
      String(url.searchParams.get("q") || "").trim() ||
      String(url.searchParams.get("query") || "").trim();

    if (!q) {
      return NextResponse.json(
        { success: false, error: "Missing query param: q (or query)" },
        { status: 200 }
      );
    }

    // MediaWiki API (Commons)
    // We do a search for files, then fetch imageinfo (URL + thumbnail)
    const endpoint = "https://commons.wikimedia.org/w/api.php";

    // 1) Search files
    const searchParams = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      list: "search",
      srsearch: q,
      srnamespace: "6", // File namespace
      srlimit: "24",
    });

    const searchRes = await fetch(`${endpoint}?${searchParams.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "RootHealthOps/1.0 (commons-images)" },
    });

    const searchJson: any = await searchRes.json().catch(() => null);

    const searchHits: any[] = Array.isArray(searchJson?.query?.search)
      ? searchJson.query.search
      : [];

    if (searchHits.length === 0) {
      return NextResponse.json({ success: true, items: [] }, { status: 200 });
    }

    // Convert search results into page titles
    const titles = searchHits
      .map((s) => String(s?.title || "").trim())
      .filter(Boolean)
      .slice(0, 24);

    if (titles.length === 0) {
      return NextResponse.json({ success: true, items: [] }, { status: 200 });
    }

    // 2) Fetch imageinfo (full url + thumb)
    const infoParams = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "640",
      titles: titles.join("|"),
    });

    const infoRes = await fetch(`${endpoint}?${infoParams.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "RootHealthOps/1.0 (commons-images)" },
    });

    const infoJson: any = await infoRes.json().catch(() => null);
    const pages = infoJson?.query?.pages || {};

    const items = Object.values(pages)
      .map((p: any) => {
        const title = String(p?.title || "").trim();
        const ii = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;

        const url = String(ii?.url || "").trim();
        const thumb = String(ii?.thumburl || "").trim();

        if (!title || !url) return null;

        return { title, url, thumb: thumb || url };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "commons-images failed" },
      { status: 200 }
    );
  }
}
