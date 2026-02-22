// app/api/media/import-external/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Bucket name you already use for uploads (change if yours differs)
const BUCKET = (process.env.SUPABASE_MEDIA_BUCKET || "media").trim();

// Hard safety limits (Meta hates big files)
const MAX_BYTES = 9.5 * 1024 * 1024; // 9.5MB

function safeUrl(u: string) {
  const s = String(u || "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function guessExt(contentType: string, url: string) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("jpeg")) return "jpg";
  if (ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";

  const m = String(url || "").toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
  if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const externalUrl = safeUrl(body?.url || "");
    const organisationId = String(body?.organisationId || "").trim();

    if (!externalUrl) {
      return NextResponse.json({ success: false, error: "Missing or invalid URL." }, { status: 200 });
    }
    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId." }, { status: 200 });
    }

    // 1) HEAD check (size/type) if possible
    let contentType = "";
    let contentLength = 0;

    try {
      const head = await fetch(externalUrl, { method: "HEAD", cache: "no-store" });
      contentType = String(head.headers.get("content-type") || "");
      contentLength = Number(head.headers.get("content-length") || "0") || 0;
    } catch {
      // Some hosts block HEAD; we’ll still try GET with stream limits
    }

    if (contentLength && contentLength > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `Image is too large (${Math.round(contentLength / 1024 / 1024)}MB). Pick a smaller one (<10MB).` },
        { status: 200 }
      );
    }

    const ext = guessExt(contentType, externalUrl);
    if (!ext) {
      return NextResponse.json(
        { success: false, error: "Unsupported image type. Choose JPG/PNG/WebP/GIF." },
        { status: 200 }
      );
    }

    // 2) Download
    const res = await fetch(externalUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Could not download image (${res.status}).` },
        { status: 200 }
      );
    }

    const ct = String(res.headers.get("content-type") || contentType || "").toLowerCase();
    if (!ct.includes("image/")) {
      return NextResponse.json({ success: false, error: "URL did not return an image." }, { status: 200 });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `Image is too large (${Math.round(buf.byteLength / 1024 / 1024)}MB). Pick a smaller one (<10MB).` },
        { status: 200 }
      );
    }

    // 3) Upload to storage
    const key = `${organisationId}/imports/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(key, buf, { contentType: ct || `image/${ext}`, upsert: true });

    if (upErr) {
      return NextResponse.json({ success: false, error: upErr.message }, { status: 200 });
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);

    const publicUrl = String(pub?.publicUrl || "").trim();
    if (!publicUrl) {
      return NextResponse.json({ success: false, error: "Upload succeeded but no public URL returned." }, { status: 200 });
    }

    return NextResponse.json(
      { success: true, url: publicUrl, bucket: BUCKET, path: key },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Import failed." },
      { status: 200 }
    );
  }
}
