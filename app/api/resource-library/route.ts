import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type JsonMap = Record<string, any>;

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

function isObject(v: unknown): v is JsonMap {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isDataImageUrl(value: unknown): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  return s.startsWith("data:image/");
}

function sanitizeSlideForStorage(slide: unknown): JsonMap {
  const next: JsonMap = isObject(slide) ? { ...slide } : {};

  if (isDataImageUrl(next.generated_image_url)) {
    next.generated_image_url = "";
    next.generated_image_status = "generated_not_persisted";
  }

  return next;
}

function sanitizeContentForStorage(content: unknown): unknown {
  if (Array.isArray(content)) {
    return content.map((item): unknown => sanitizeContentForStorage(item));
  }

  if (!isObject(content)) {
    return content ?? null;
  }

  const next: JsonMap = {};

  for (const key in content) {
    const value = content[key];

    if (key === "slides" && Array.isArray(value)) {
      next[key] = value.map((slide): JsonMap => sanitizeSlideForStorage(slide));
      continue;
    }

    if (Array.isArray(value)) {
      next[key] = value.map((item): unknown => sanitizeContentForStorage(item));
      continue;
    }

    if (isObject(value)) {
      next[key] = sanitizeContentForStorage(value);
      continue;
    }

    next[key] = value;
  }

  return next;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bodyObj = body as JsonMap;

    const mode = norm(bodyObj?.mode || "create").toLowerCase();

    if (mode === "duplicate") {
      const organisationId = norm(bodyObj?.organisationId);
      const resourceId = norm(bodyObj?.resourceId);

      if (!organisationId) {
        return NextResponse.json(
          { error: "organisationId required" },
          { status: 400 }
        );
      }

      if (!resourceId) {
        return NextResponse.json(
          { error: "resourceId required" },
          { status: 400 }
        );
      }

      const { data: existing, error: loadErr } = await supabaseAdmin
        .from("resource_library")
        .select("*")
        .eq("organisation_id", organisationId)
        .eq("id", resourceId)
        .maybeSingle();

      if (loadErr) {
        return NextResponse.json({ error: loadErr.message }, { status: 500 });
      }

      if (!existing) {
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        );
      }

      const duplicateTitle = `${String(existing.title || "Untitled")} (Copy)`;
      const safeContent = sanitizeContentForStorage(existing.content ?? null);

      const { data: duplicated, error: dupErr } = await supabaseAdmin
        .from("resource_library")
        .insert({
          organisation_id: existing.organisation_id,
          sequence_id: existing.sequence_id ?? null,
          title: duplicateTitle,
          resource_type: existing.resource_type,
          content: safeContent,
        })
        .select()
        .single();

      if (dupErr) {
        return NextResponse.json({ error: dupErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        mode: "duplicate",
        resource: duplicated,
      });
    }

    const organisationId = norm(bodyObj?.organisationId);
    const sequenceId = norm(bodyObj?.sequenceId) || null;
    const title = norm(bodyObj?.title);
    const resourceType = norm(bodyObj?.resource_type);
    const content = sanitizeContentForStorage(bodyObj?.content ?? null);

    if (!organisationId) {
      return NextResponse.json(
        { error: "organisationId required" },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    if (!resourceType) {
      return NextResponse.json(
        { error: "resource_type required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("resource_library")
      .insert({
        organisation_id: organisationId,
        sequence_id: sequenceId,
        title,
        resource_type: resourceType,
        content,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mode: "create",
      resource: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create resource" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const organisationId = req.nextUrl.searchParams.get("organisationId");

    if (!organisationId) {
      return NextResponse.json(
        { error: "organisationId required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("resource_library")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      resources: data || [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load library" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bodyObj = body as JsonMap;

    const organisationId = norm(bodyObj?.organisationId);
    const resourceId = norm(bodyObj?.resourceId);
    const title = norm(bodyObj?.title);
    const resourceType = norm(bodyObj?.resource_type);

    const hasContentField = Object.prototype.hasOwnProperty.call(bodyObj, "content");
    const hasResourceTypeField = Object.prototype.hasOwnProperty.call(
      bodyObj,
      "resource_type"
    );

    const content = hasContentField
      ? sanitizeContentForStorage(bodyObj?.content ?? null)
      : undefined;

    const hasSlidePatch =
      Object.prototype.hasOwnProperty.call(bodyObj, "slideIndex") &&
      Object.prototype.hasOwnProperty.call(bodyObj, "slidePatch");

    const slideIndexRaw = bodyObj?.slideIndex;
    const slidePatch = bodyObj?.slidePatch;

    if (!organisationId) {
      return NextResponse.json(
        { error: "organisationId required" },
        { status: 400 }
      );
    }

    if (!resourceId) {
      return NextResponse.json(
        { error: "resourceId required" },
        { status: 400 }
      );
    }

    if (!title && !hasContentField && !hasSlidePatch && !hasResourceTypeField) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    if (hasSlidePatch) {
      const slideIndex = Number(slideIndexRaw);

      if (!Number.isInteger(slideIndex) || slideIndex < 0) {
        return NextResponse.json(
          { error: "slideIndex must be a valid non-negative integer" },
          { status: 400 }
        );
      }

      if (!isObject(slidePatch)) {
        return NextResponse.json(
          { error: "slidePatch must be an object" },
          { status: 400 }
        );
      }

      const { data: existing, error: loadErr } = await supabaseAdmin
        .from("resource_library")
        .select("id, title, content, resource_type")
        .eq("organisation_id", organisationId)
        .eq("id", resourceId)
        .maybeSingle();

      if (loadErr) {
        return NextResponse.json({ error: loadErr.message }, { status: 500 });
      }

      if (!existing) {
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        );
      }

      const nextContent: JsonMap = isObject(existing.content)
        ? { ...existing.content }
        : {};

      const slides: any[] = Array.isArray(nextContent.slides)
        ? [...nextContent.slides]
        : [];

      while (slides.length <= slideIndex) {
        slides.push({});
      }

      const currentSlide: JsonMap = isObject(slides[slideIndex])
        ? slides[slideIndex]
        : {};

      slides[slideIndex] = sanitizeSlideForStorage({
        ...currentSlide,
        ...slidePatch,
      });

      nextContent.slides = slides;

      const updatePayload: JsonMap = {
        updated_at: new Date().toISOString(),
        content: sanitizeContentForStorage(nextContent),
      };

      if (title) {
        updatePayload.title = title;
      }

      if (hasResourceTypeField && resourceType) {
        updatePayload.resource_type = resourceType;
      }

      const { data, error } = await supabaseAdmin
        .from("resource_library")
        .update(updatePayload)
        .eq("organisation_id", organisationId)
        .eq("id", resourceId)
        .select()
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        resource: data,
      });
    }

    const updatePayload: JsonMap = {
      updated_at: new Date().toISOString(),
    };

    if (title) {
      updatePayload.title = title;
    }

    if (hasContentField) {
      updatePayload.content = content;
    }

    if (hasResourceTypeField) {
      if (!resourceType) {
        return NextResponse.json(
          { error: "resource_type cannot be empty" },
          { status: 400 }
        );
      }
      updatePayload.resource_type = resourceType;
    }

    const { data, error } = await supabaseAdmin
      .from("resource_library")
      .update(updatePayload)
      .eq("organisation_id", organisationId)
      .eq("id", resourceId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Resource not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      resource: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update resource" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bodyObj = body as JsonMap;

    const organisationId = norm(bodyObj?.organisationId);
    const resourceId = norm(bodyObj?.resourceId);

    if (!organisationId) {
      return NextResponse.json(
        { error: "organisationId required" },
        { status: 400 }
      );
    }

    if (!resourceId) {
      return NextResponse.json(
        { error: "resourceId required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("resource_library")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("id", resourceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to delete resource" },
      { status: 500 }
    );
  }
}
