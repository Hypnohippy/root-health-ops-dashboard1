// app/api/media/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "public-media";
const MAX_MB = 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function safeName(name: string) {
  return (name || "file")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function extFromName(name: string) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function guessContentType(name: string) {
  const ext = extFromName(name);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "application/octet-stream";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: "Missing file" }, { status: 400 });
    }

    const name = "name" in file && typeof (file as any).name === "string" ? (file as any).name : "upload.bin";
    const size = "size" in file ? (file as any).size : 0;

    if (size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large. Max is ${MAX_MB}MB.` },
        { status: 400 }
      );
    }

    const contentType =
      ("type" in file && typeof (file as any).type === "string" && (file as any).type) ||
      guessContentType(name);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Organise uploads by date (nice + predictable)
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const safe = safeName(name);
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const path = `uploads/${yyyy}-${mm}-${dd}/${unique}_${safe}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });

    if (upErr) {
      console.error("[media/upload] upload error", upErr);
      return NextResponse.json(
        { success: false, error: `Supabase upload failed: ${upErr.message}` },
        { status: 500 }
      );
    }

    const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const url = pub?.data?.publicUrl || "";

    if (!url) {
      return NextResponse.json(
        { success: false, error: "Uploaded but could not create a public URL." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        bucket: BUCKET,
        path,
        url,
        contentType,
        size,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[media/upload] fatal", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
