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

function bestThumb(p: any) {
  // Prefer a decently sized thumb if present, else original (may be large)
  const thumb = safeString(p?.thumbnail?.source);
  const original = safeString(p?.original?.source);
  return thumb || original;
}

function commonsPageUrl(title: string) {
  // title like "File:Something.jpg"
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/${encoded}`;
}

// This is a lightweight search over Wikimedia Commons.
// It returns images only; licensing is not always present in the summary,
// so we include the Commons file page URL for your reviewer + attribution trail.
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") || "";
    const query = q.trim();
    if (!query) {
      return NextResponse.json(
        { success: false, error: "Missing q param." },
        { status: 400 }
      );
    }

    const limit = Math.max(
      1,
      Math.min(12, Number(req.nextUrl.searchParams.get("limit") || 6) || 6)
    );

    // Wikimedia API: generator=search + imageinfo for URLs/thumbs
    const apiUrl =
      "https://commons.wikimedia.org/w/api.php" +
      `?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(query + " filetype:bitmap")}` +
      `&gsrlimit=${limit}` +
      `&gsrnamespace=6` +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640`;

    const res = await fetch(apiUrl, { cache: "no-store" });
    const json: any = await res.json().catch(() => null);

    const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
    const images: CommonsImage[] = [];

    for (const p of pages) {
      const title = safeString((p as any)?.title);
      const ii = (p as any)?.imageinfo?.[0];

      const url = safeString(ii?.thumburl) || safeString(ii?.url) || bestThumb(ii);
      if (!url || !title) continue;

      // Try to pull useful license info if extmetadata exists (often does)
      const meta = ii?.extmetadata || {};
      const licenseShortName = safeString(meta?.LicenseShortName?.value);
      const licenseUrl = safeString(meta?.LicenseUrl?.value);
      const artist = safeString(meta?.Artist?.value);
      const credit = safeString(meta?.Credit?.value);

      // attribution is “best effort” and may include HTML; keep it short-ish
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

    return NextResponse.json(
      {
        success: true,
        query,
        images: images.slice(0, limit),
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
