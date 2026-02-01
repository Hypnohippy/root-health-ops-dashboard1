// app/api/media/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function safeName(name: string) {
  return (name || "file")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extFromName(name: string) {
  const m = (name || "").toLowerCase().match(/\.([a-z0-9]+)$/i);
  return m?.[1] || "";
}

function isAllowedMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  if (m === "video/mp4") return true;
  if (m === "video/quicktime") return true; // .mov
  if (m === "video/x-m4v") return true; // .m4v
  return false;
}

function guessFolder(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "images";
  if (m.startsWith("video/")) return "videos";
  return "files";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Missing file. Send multipart/form-data with field name 'file'." },
        { status: 200 }
      );
    }

    const mime = String(file.type || "").trim();
    if (!isAllowedMime(mime)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported file type. Allowed: images (image/*) and video MP4/MOV/M4V.",
        },
        { status: 200 }
      );
    }

    const bucket =
      process.env.SUPABASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ||
      "media";

    const folder = guessFolder(mime);

    const original = safeName(file.name || "upload");
    const ext = extFromName(original) || (mime.startsWith("image/") ? "jpg" : "mp4");

    const id =
      (globalThis.crypto && "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

    const path = `${folder}/${id}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    const { error: upErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, bytes, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });

    if (upErr) {
      console.error("[media/upload] upload error", upErr);
      return NextResponse.json(
        { success: false, error: `Upload failed: ${upErr.message}` },
        { status: 200 }
      );
    }

    const pub = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    const url = pub?.data?.publicUrl || "";

    if (!url) {
      return NextResponse.json(
        { success: false, error: "Upload succeeded but could not create a public URL." },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        bucket,
        path,
        url,
        mime,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[media/upload] fatal error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal error uploading file." },
      { status: 200 }
    );
  }
}
