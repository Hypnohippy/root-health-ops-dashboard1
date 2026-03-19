import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const STORAGE_BUCKET = "resource-library-images";

function safe(value: unknown): string {
  return String(value || "").trim();
}

function slugify(input: unknown) {
  return safe(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extFromFilename(name: string) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  return "png";
}

function extFromMime(type: string) {
  const lower = String(type || "").toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  return "png";
}

function normaliseExt(fileName: string, mimeType: string) {
  const byName = extFromFilename(fileName);
  const byMime = extFromMime(mimeType);
  return byMime || byName || "png";
}

function buildStoragePath(params: {
  organisationId: string;
  resourceId: string;
  slideIndex: number;
  resourceTitle: string;
  slideTitle: string;
  fileName: string;
  mimeType: string;
}) {
  const resourceSlug = slugify(params.resourceTitle || "resource");
  const slideSlug = slugify(params.slideTitle || `slide-${params.slideIndex + 1}`);
  const ext = normaliseExt(params.fileName, params.mimeType);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = randomUUID();

  return `uploaded-slide-art/${slugify(params.organisationId)}/${slugify(
    params.resourceId
  )}/${resourceSlug}/slide-${params.slideIndex + 1}-${slideSlug}-${stamp}-${id}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const organisationId = safe(formData.get("organisationId"));
    const resourceId = safe(formData.get("resourceId"));
    const resourceTitle = safe(formData.get("resourceTitle"));
    const slideTitle = safe(formData.get("slideTitle"));
    const slideIndexRaw = safe(formData.get("slideIndex"));
    const file = formData.get("file");

    if (!organisationId) {
      return NextResponse.json(
        { error: "organisationId is required." },
        { status: 400 }
      );
    }

    if (!resourceId) {
      return NextResponse.json(
        { error: "resourceId is required." },
        { status: 400 }
      );
    }

    const slideIndex = Number(slideIndexRaw);
    if (!Number.isInteger(slideIndex) || slideIndex < 0) {
      return NextResponse.json(
        { error: "slideIndex must be a valid non-negative integer." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A file is required." },
        { status: 400 }
      );
    }

    const mimeType = safe(file.type);
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

    if (!allowed.includes(mimeType)) {
      return NextResponse.json(
        { error: "Only PNG, JPG, JPEG, and WEBP images are supported." },
        { status: 400 }
      );
    }

    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "Image is too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const storagePath = buildStoragePath({
      organisationId,
      resourceId,
      slideIndex,
      resourceTitle,
      slideTitle,
      fileName: file.name || "upload",
      mimeType,
    });

    const uploadResult = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadResult.error) {
      return NextResponse.json(
        { error: uploadResult.error.message || "Failed to upload artwork." },
        { status: 500 }
      );
    }

    const publicUrlResult = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = safe(publicUrlResult?.data?.publicUrl);

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Upload succeeded but no public URL was returned." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      storagePath,
      fileName: file.name || "upload",
      mimeType,
      size: file.size,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Slide artwork upload failed" },
      { status: 500 }
    );
  }
}
