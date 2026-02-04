// app/api/media/rehost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ""; // allow either name

// Put your public bucket name here (must exist)
const BUCKET = "public-media";

// Safety limits
const MAX_MB = 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function safeName(name: string) {
  return (name || "file")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function extFromContentType(ct: string) {
  const t = (ct || "").toLowerCase();
  if (t.includes("image/jpeg")) return "jpg";
  if (t.includes("image/jpg")) return "jpg";
  if (t.includes("image/png")) return "png";
  if (t.includes("image/webp")) return "webp";
  if (t.includes("image/gif")) return "gif";
  if (t.includes("video/mp4")) return "mp4";
  if (t.includes("video/quicktime")) return "mov";
  if (t.includes("video/webm")) return "webm";
  return "";
}

function isAllowedContentType(ct: string) {
  const t = (ct || "").toLowerCase().trim();
  return (
    t.startsWith("image/") ||
    t.startsWith("video/")
  );
}

function looksLikeHtml(ct: string) {
  return (ct || "").toLowerCase().includes("text/html");
}

function supabaseService() {
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * ✅ Browser test
 * Visiting /api/media/rehost should return JSON (not 405).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/media/rehost/route.ts",
    message: "Route is live. POST { url, organisationId? } to rehost remote media into Supabase Storage.",
    maxMb: MAX_MB,
    bucket: BUCKET,
  });
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseService();
    if (!sb) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Supabase service client not configured. Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const urlRaw = String(body?.url || "").trim();
    const organisationId = body?.organisationId
      ? String(body.organisationId).trim()
      : null;

    if (!urlRaw) {
      return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
    }

    let u: URL;
    try {
      u = new URL(urlRaw);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
    }

    if (u.protocol !== "https:") {
      return NextResponse.json(
        { ok: false, error: "URL must be https" },
        { status: 400 }
      );
    }

    // 1) Download the remote file
    const remoteRes = await fetch(urlRaw, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: {
        // some hosts block unknown user agents; this usually helps
        "User-Agent":
          "Mozilla/5.0 (compatible; RootHealthOpsBot/1.0; +https://root-health-ops-dashboard1.vercel.app)",
        Accept: "image/*,video/*,*/*",
      },
    });

    const contentType = String(remoteRes.headers.get("content-type") || "").trim();
    const contentLength = Number(remoteRes.headers.get("content-length") || 0);

    if (!remoteRes.ok) {
      const text = await remoteRes.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `Remote fetch failed (HTTP ${remoteRes.status}).`,
          details: text.slice(0, 400),
          url: urlRaw,
        },
        { status: 400 }
      );
    }

    if (!contentType) {
      return NextResponse.json(
        { ok: false, error: "Remote file missing content-type header. Cannot rehost safely." },
        { status: 400 }
      );
    }

    if (looksLikeHtml(contentType)) {
      return NextResponse.json(
        { ok: false, error: "Remote URL returned HTML, not a direct image/video file." },
        { status: 400 }
      );
    }

    if (!isAllowedContentType(contentType)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported content-type: ${contentType}` },
        { status: 400 }
      );
    }

    if (contentLength && contentLength > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large. Max is ${MAX_MB}MB.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await remoteRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large. Max is ${MAX_MB}MB.` },
        { status: 400 }
      );
    }

    // 2) Build a tidy path
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const orgPart = organisationId ? `org_${organisationId}` : "org_unknown";

    const ext = extFromContentType(contentType) || "bin";
    const base = safeName(u.pathname.split("/").pop() || `file.${ext}`);
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // ensure filename ends with correct ext
    const filename = base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;

    const path = `rehost/${orgPart}/${yyyy}-${mm}-${dd}/${unique}_${filename}`;

    // 3) Upload into Supabase Storage
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType,
        upsert: false,
        cacheControl: "3600",
      });

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: `Supabase upload failed: ${upErr.message}` },
        { status: 500 }
      );
    }

    // 4) Return a clean public URL
    const pub = sb.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl || "";

    if (!publicUrl) {
      return NextResponse.json(
        { ok: false, error: "Upload succeeded but public URL could not be generated." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        originalUrl: urlRaw,
        publicUrl,
        bucket: BUCKET,
        path,
        contentType,
        size: arrayBuffer.byteLength,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Rehost crashed." },
      { status: 500 }
    );
  }
}
