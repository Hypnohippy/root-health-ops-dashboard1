// app/api/media/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_PUBLIC_MEDIA_BUCKET || "public-media";

// Safety limits
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

function safeName(input: string) {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function extFromContentType(ct: string) {
  const c = (ct || "").toLowerCase();
  if (c.includes("image/jpeg")) return "jpg";
  if (c.includes("image/jpg")) return "jpg";
  if (c.includes("image/png")) return "png";
  if (c.includes("image/webp")) return "webp";
  if (c.includes("image/gif")) return "gif";
  return "bin";
}

async function uploadBuffer(args: {
  bytes: Uint8Array;
  contentType: string;
  folder?: string;
  filenameBase?: string;
}) {
  const folder = safeName(args.folder || "uploads") || "uploads";
  const ext = extFromContentType(args.contentType);
  const base = safeName(args.filenameBase || "image") || "image";

  const path = `${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}-${base}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, args.bytes, {
      contentType: args.contentType,
      upsert: false,
      cacheControl: "3600",
    });

  if (upErr) {
    return { ok: false as const, error: upErr.message };
  }

  const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub?.data?.publicUrl || "";

  if (!publicUrl) {
    return { ok: false as const, error: "Upload succeeded but public URL missing." };
  }

  return { ok: true as const, path, publicUrl };
}

export async function POST(req: NextRequest) {
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();

    // Option A: JSON body with { url, folder?, filenameBase? }
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));

      const url = String(body?.url || "").trim();
      const folder = String(body?.folder || "uploads").trim();
      const filenameBase = String(body?.filenameBase || "image").trim();

      if (!/^https?:\/\/.+/i.test(url)) {
        return NextResponse.json(
          { ok: false, error: "Missing or invalid url (must be http/https)." },
          { status: 400 }
        );
      }

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: `Failed to download remote file (${r.status}).` },
          { status: 400 }
        );
      }

      const contentType = String(r.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        return NextResponse.json(
          { ok: false, error: `URL is not an image (content-type: ${contentType || "unknown"}).` },
          { status: 400 }
        );
      }

      const ab = await r.arrayBuffer();
      if (!ab || ab.byteLength === 0) {
        return NextResponse.json({ ok: false, error: "Downloaded file was empty." }, { status: 400 });
      }

      if (ab.byteLength > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: `Image too large (${Math.round(ab.byteLength / 1024 / 1024)}MB). Max is 8MB.` },
          { status: 400 }
        );
      }

      const bytes = new Uint8Array(ab);
      const up = await uploadBuffer({ bytes, contentType, folder, filenameBase });

      if (!up.ok) {
        return NextResponse.json({ ok: false, error: up.error }, { status: 500 });
      }

      return NextResponse.json(
        {
          ok: true,
          bucket: BUCKET,
          path: up.path,
          publicUrl: up.publicUrl,
          sourceUrl: url,
        },
        { status: 200 }
      );
    }

    // Option B: multipart/form-data with file
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const folder = String(form.get("folder") || "uploads");
      const filenameBase = String(form.get("filenameBase") || "image");

      if (!(file instanceof File)) {
        return NextResponse.json({ ok: false, error: "Missing file in form-data." }, { status: 400 });
      }

      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: `Image too large (${Math.round(file.size / 1024 / 1024)}MB). Max is 8MB.` },
          { status: 400 }
        );
      }

      const contentType = (file.type || "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        return NextResponse.json(
          { ok: false, error: `File is not an image (type: ${contentType || "unknown"}).` },
          { status: 400 }
        );
      }

      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);

      const up = await uploadBuffer({ bytes, contentType, folder, filenameBase });

      if (!up.ok) {
        return NextResponse.json({ ok: false, error: up.error }, { status: 500 });
      }

      return NextResponse.json(
        {
          ok: true,
          bucket: BUCKET,
          path: up.path,
          publicUrl: up.publicUrl,
          sourceUrl: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Unsupported content-type. Use JSON or multipart/form-data." },
      { status: 415 }
    );
  } catch (err: any) {
    console.error("[media/upload] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error", details: err?.message || null },
      { status: 500 }
    );
  }
}
