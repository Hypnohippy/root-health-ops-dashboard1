import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const STORAGE_BUCKET = "resource-library-images";

function safe(value: unknown): string {
  return String(value || "").trim();
}

function slugify(input: unknown): string {
  return safe(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getExtension(contentType: string, filename: string) {
  const lowerName = safe(filename).toLowerCase();

  if (lowerName.endsWith(".png")) return "png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "jpg";
  if (lowerName.endsWith(".webp")) return "webp";

  const type = safe(contentType).toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";

  return "png";
}

function buildStoragePath(resourceTitle: string, slideTitle: string, ext: string) {
  const resourceSlug = slugify(resourceTitle || "resource");
  const slideSlug = slugify(slideTitle || "slide");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = randomUUID();

  return `uploaded-artwork/${resourceSlug}/${slideSlug}-${stamp}-${id}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const resourceTitle = safe(formData.get("resourceTitle"));
    const slideTitle = safe(formData.get("slideTitle"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Image file is required." },
        { status: 400 }
      );
    }

    if (!resourceTitle) {
      return NextResponse.json(
        { error: "resourceTitle is required." },
        { status: 400 }
      );
    }

    if (!slideTitle) {
      return NextResponse.json(
        { error: "slideTitle is required." },
        { status: 400 }
      );
    }

    const contentType = safe(file.type).toLowerCase();
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: "Only PNG, JPG, JPEG, and WEBP images are supported." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      return NextResponse.json(
        { error: "Uploaded image is empty." },
        { status: 400 }
      );
    }

    const ext = getExtension(contentType, file.name || "");
    const storagePath = buildStoragePath(resourceTitle, slideTitle, ext);

    const uploadResult = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: contentType || "image/png",
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
        { error: "Artwork uploaded but no public URL was returned." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      storagePath,
      source: "upload",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Artwork upload failed" },
      { status: 500 }
    );
  }
}
