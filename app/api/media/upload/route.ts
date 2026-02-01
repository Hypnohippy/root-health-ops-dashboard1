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
    // ✅ IMPORTANT: only accept JSON metadata (no file)
    const body = await req.json().catch(() => ({}));

    const filename = String(body?.filename || body?.name || "").trim();
    const size = Number(body?.size || 0);
    const contentTypeIncoming = String(body?.contentType || body?.type || "").trim();

    if (!filename) {
      return NextResponse.json(
        { success: false, error: "Missing filename." },
        { status: 400 }
      );
    }

    if (!size || !Number.isFinite(size)) {
      return NextResponse.json(
        { success: false, error: "Missing file size." },
        { status: 400 }
      );
    }

    if (size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large. Max is ${MAX_MB}MB.` },
        { status: 400 }
      );
    }

    const contentType = contentTypeIncoming || guessContentType(filename);

    // Organise uploads by date (nice + predictable)
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const safe = safeName(filename);
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const path = `uploads/${yyyy}-${mm}-${dd}/${unique}_${safe}`;

    // ✅ Create a signed upload URL (server-side using service role)
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[media/upload] createSignedUploadUrl error", error);
      return NextResponse.json(
        { success: false, error: `Could not create signed upload URL: ${error?.message || "unknown error"}` },
        { status: 500 }
      );
    }

    // ✅ Build the final public URL (bucket is public)
    const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl || "";

    if (!publicUrl) {
      return NextResponse.json(
        { success: false, error: "Could not create public URL for uploaded file path." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        bucket: BUCKET,
        path,
        token: data.token, // used by uploadToSignedUrl(...)
        signedUrl: data.signedUrl, // optional, useful for debugging
        publicUrl,
        contentType,
        size,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[media/upload] fatal", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Upload init failed" },
      { status: 500 }
    );
  }
}
