// app/api/media/commons-image/route.ts
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

function clean(s: any) {
  return String(s ?? "").trim();
}

function stripHtml(s: string) {
  return (s || "").replace(/<[^>]+>/g, "").trim();
}

async function fetchJsonWithTimeout(url: string, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

async function findCommonsImage(query: string): Promise<CommonsImage | null> {
  const q = clean(query);
  if (!q) return null;

  // 1) Search File namespace
  const searchUrl =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      list: "search",
      srsearch: `${q} filetype:bitmap`,
      srnamespace: "6",
      srlimit: "5",
    }).toString();

  const search = await fetchJsonWithTimeout(searchUrl, 4500);
  const first = search.json?.query?.search?.[0];
  const title: string | null = first?.title ? String(first.title) : null;
  if (!title) return null;

  // 2) Get URL + license metadata
  const infoUrl =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      titles: title,
      iiprop: "url|extmetadata",
      iiurlwidth: "1600",
    }).toString();

  const info = await fetchJsonWithTimeout(infoUrl, 4500);

  const pages = info.json?.query?.pages || {};
  const page = Object.values(pages)?.[0] as any;
  const imageinfo = page?.imageinfo?.[0];
  if (!imageinfo) return null;

  const url: string | null = imageinfo?.thumburl || imageinfo?.url || null;
  if (!url || !/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(url)) return null;

  const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;

  const meta = imageinfo?.extmetadata || {};
  const licenseShortName = meta?.LicenseShortName?.value
    ? stripHtml(String(meta.LicenseShortName.value))
    : undefined;

  const licenseUrl = meta?.LicenseUrl?.value
    ? stripHtml(String(meta.LicenseUrl.value))
    : undefined;

  const artist = meta?.Artist?.value ? stripHtml(String(meta.Artist.value)) : undefined;
  const credit = meta?.Credit?.value ? stripHtml(String(meta.Credit.value)) : undefined;

  const attribution = [artist, credit].filter(Boolean).join(" · ") || undefined;

  return {
    url,
    title,
    pageUrl,
    licenseShortName,
    licenseUrl,
    attribution,
  };
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") || "";
    const query = clean(q);

    if (!query) {
      return NextResponse.json({ success: false, error: "Missing q" }, { status: 400 });
    }

    const image = await findCommonsImage(query);

    return NextResponse.json(
      { success: true, query, image },
      { status: 200 }
    );
  } catch (e: any) {
    // If Commons is slow/unavailable, we fail softly (no 504)
    return NextResponse.json(
      { success: false, error: e?.message || "Commons lookup failed" },
      { status: 200 }
    );
  }
}
