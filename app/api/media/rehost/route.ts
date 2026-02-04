// app/api/media/rehost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "public-media";
const MAX_MB = 15; // keep rehost safe for serverless (images only)
const MAX_BYTES = MAX_MB * 1024 * 1024;

function safeName(name: string) {
  return (name || "file")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
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

function isHttpUrl(u: string) {
  return /^https?:\/\/.+/i.test((u || "").trim());
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json().catch(() => ({} as any));

    const url = String(body?.url || "").trim();
    const organisationId = body?.organisationId ? String(body.organisationId) : null;

    if (!url || !isHttpUrl(url)) {
      return NextResponse.json({ success: false, error: "Missing/invalid url" }, { status: 400 });
    }

    // 1) Download (Meta often blocks hotlinked hosts; we pull it server-side)
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        // Some hosts block “empty UA”
        "User-Agent": "RootHealthOpsBot/1.0 (+https://root-health-ops-dashboard1.vercel.app)",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const contentLen = Number(res.headers.get("content-length") || 0);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { success: false, error: `Failed to download image (HTTP ${res.status}).`, details: text.slice(0, 400) },
        { status: 400 }
      );
    }

    // We only rehost images in this endpoint
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: `URL is not an image (content-type: ${contentType || "unknown"}).` },
        { status: 400 }
      );
    }

    if (contentLen && contentLen > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `Image too large to rehost. Max is ${MAX_MB}MB.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `Image too large to rehost. Max is ${MAX_MB}MB.` },
        { status: 400 }
      );
    }

    // 2) Upload to Supabase Storage
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const orgPart = organisationId ? `org_${organisationId}` : "org_unknown";
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // try to derive a filename
    const urlPath = (() => {
      try {
        return new URL(url).pathname.split("/").pop() || "image";
      } catch {
        return "image";
      }
    })();

    const filename = safeName(urlPath);
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
      ? "webp"
      : contentType.includes("gif")
      ? "gif"
      : "jpg";

    const path = `rehost/${orgPart}/${yyyy}-${mm}-${dd}/${unique}_${filename}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(arrayBuffer), {
        contentType: contentType || "image/jpeg",
        upsert: false,
      });

    if (upErr) {
      return NextResponse.json(
        { success: false, error: `Supabase upload failed: ${upErr.message}` },
        { status: 500 }
      );
    }

    const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl || "";

    return NextResponse.json(
      {
        success: true,
        bucket: BUCKET,
        path,
        publicUrl,
        contentType,
        size: arrayBuffer.byteLength,
        kind: "image",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[media/rehost] fatal", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Rehost failed" },
      { status: 500 }
    );
  }
}
