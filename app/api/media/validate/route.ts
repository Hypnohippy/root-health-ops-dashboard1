// app/api/media/validate/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type UserHelp = {
  headline?: string;
  what?: string;
  doThis?: string[];
  notes?: string[];
};

function isHttps(url: string) {
  return /^https:\/\/.+/i.test((url || "").trim());
}

function looksLikeImageExt(url: string) {
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test((url || "").trim());
}

function looksLikeVideoExt(url: string) {
  const u = (url || "").toLowerCase().trim();
  return /\.(mp4|mov|webm)(\?.*)?$/i.test(u) || u.includes(".mp4") || u.includes(".mov") || u.includes(".webm");
}

function mb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

async function fetchHeadOrGet(url: string) {
  // Some hosts block HEAD, so try HEAD then fallback GET
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return head;
  } catch {}
  return await fetch(url, { method: "GET", cache: "no-store" });
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get("url") || "";
    const platform = (req.nextUrl.searchParams.get("platform") || "").toLowerCase().trim();

    if (!url.trim()) {
      return NextResponse.json({ ok: false, userHelp: { headline: "Missing URL", doThis: ["Paste a media URL and try again."] } }, { status: 200 });
    }

    if (!isHttps(url)) {
      const userHelp: UserHelp = {
        headline: "This link needs to start with https://",
        what: "Most social platforms reject non-https links.",
        doThis: ["Use an https:// link", "If your link is http://, re-host the file somewhere secure"],
        notes: [`URL: ${url}`],
      };
      return NextResponse.json({ ok: false, platform, url, userHelp }, { status: 200 });
    }

    const res = await fetchHeadOrGet(url);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const cl = Number(res.headers.get("content-length") || "0") || 0;

    if (!res.ok) {
      const userHelp: UserHelp = {
        headline: "We can’t fetch that media link",
        what: "The link may be blocked, private, expired, or not publicly downloadable.",
        doThis: ["Try a different link", "Or re-upload the file so it becomes a public direct file URL"],
        notes: [`HTTP status: ${res.status}`, `URL: ${url}`],
      };
      return NextResponse.json({ ok: false, platform, url, userHelp, httpStatus: res.status }, { status: 200 });
    }

    const isImage = ct.startsWith("image/");
    const isVideo = ct.startsWith("video/");

    // Helpful hints for LinkedIn specifically
    const isLinkedIn = platform === "linkedin";

    // If content-type doesn’t look right, still allow if extension strongly suggests it
    const extSuggestsImage = looksLikeImageExt(url);
    const extSuggestsVideo = looksLikeVideoExt(url);

    const kind =
      isVideo || extSuggestsVideo ? "video" :
      isImage || extSuggestsImage ? "image" :
      "unknown";

    if (kind === "unknown") {
      const userHelp: UserHelp = {
        headline: "This doesn’t look like a direct image/video file",
        what: "It might be a webpage, a redirect, or a blocked link.",
        doThis: [
          "Use a direct file URL (ends .jpg/.png/.webp/.gif or .mp4/.mov/.webm)",
          "Open the link in a browser: it should show ONLY the media file (not a webpage)",
        ],
        notes: [`Content-Type: ${ct || "unknown"}`, `URL: ${url}`],
      };
      return NextResponse.json({ ok: false, platform, url, contentType: ct, userHelp }, { status: 200 });
    }

    // Size guidance (basic, safe defaults)
    const sizeNote = cl ? `${mb(cl)}MB (from headers)` : "Unknown (host didn’t provide size)";
    const notes: string[] = [`Content-Type: ${ct || "unknown"}`, `Size: ${sizeNote}`];

    const doThis: string[] = [];
    if (kind === "image") {
      doThis.push("Use JPG/PNG/WebP for best compatibility.");
      if (isLinkedIn) doThis.push("For LinkedIn: direct image links can be flaky — if it fails, swap image or re-host it.");
      if (cl && cl > 20 * 1024 * 1024) doThis.push("This image looks large — try a smaller version (under ~20MB).");
    }

    if (kind === "video") {
      doThis.push("Use MP4 for best compatibility.");
      if (cl && cl > 150 * 1024 * 1024) doThis.push("This video looks large — try a smaller file (under ~150MB).");
    }

    const userHelp: UserHelp = {
      headline: "Looks usable ✅",
      what: "This link looks like a direct media file that we can download.",
      doThis,
      notes,
    };

    return NextResponse.json(
      { ok: true, platform, url, kind, contentType: ct, contentLength: cl || null, userHelp },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        userHelp: {
          headline: "Media test failed",
          what: "We couldn’t test that link right now.",
          doThis: ["Try again in a minute", "Or try a different media link"],
          notes: [String(e?.message || "Unknown error")],
        },
      },
      { status: 200 }
    );
  }
}
