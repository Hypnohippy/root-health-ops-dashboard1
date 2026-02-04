// app/api/media/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !service) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var."
    );
  }

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json().catch(() => ({} as any));

    const filename = String(body?.filename || "").trim();
    const size = Number(body?.size || 0);
    const organisationId = body?.organisationId ? String(body.organisationId) : null;

    if (!filename) {
      return NextResponse.json({ success: false, error: "Missing filename" }, { status: 400 });
    }

    if (!size || Number.isNaN(size)) {
      return NextResponse.json({ success: false, error: "Missing size" }, { status: 400 });
    }

    if (size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large. Max is ${MAX_MB}MB.` },
        { status: 400 }
      );
    }

    const contentType =
      (typeof body?.contentType === "string" && body.contentType.trim()) ||
      guessContentType(filename);

    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const safe = safeName(filename);
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const orgPart = organisationId ? `org_${organisationId}` : "org_unknown";
    const path = `uploads/${orgPart}/${yyyy}-${mm}-${dd}/${unique}_${safe}`;

    // ✅ Signed upload URL/token (no file bytes through server)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[media/upload:init] signed url error", error);
      return NextResponse.json(
        { success: false, error: `Could not init upload: ${error?.message || "unknown error"}` },
        { status: 500 }
      );
    }

    // Public URL (bucket is public)
    const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl || "";

    return NextResponse.json(
      {
        success: true,
        bucket: BUCKET,
        path: data.path || path,
        token: data.token,
        publicUrl,
        contentType,
        size,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[media/upload:init] fatal", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Upload init failed" },
      { status: 500 }
    );
  }
}
