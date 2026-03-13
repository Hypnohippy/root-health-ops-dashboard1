import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const mode = norm(body?.mode || "create").toLowerCase();

    // -----------------------------
    // DUPLICATE
    // -----------------------------
    if (mode === "duplicate") {
      const organisationId = norm(body?.organisationId);
      const resourceId = norm(body?.resourceId);

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
        return NextResponse.json(
          { error: loadErr.message },
          { status: 500 }
        );
      }

      if (!existing) {
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        );
      }

      const duplicateTitle = `${String(existing.title || "Untitled")} (Copy)`;

      const { data: duplicated, error: dupErr } = await supabaseAdmin
        .from("resource_library")
        .insert({
          organisation_id: existing.organisation_id,
          sequence_id: existing.sequence_id ?? null,
          title: duplicateTitle,
          resource_type: existing.resource_type,
          content: existing.content ?? null,
        })
        .select()
        .single();

      if (dupErr) {
        return NextResponse.json(
          { error: dupErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        mode: "duplicate",
        resource: duplicated,
      });
    }

    // -----------------------------
    // CREATE
    // -----------------------------
    const organisationId = norm(body?.organisationId);
    const sequenceId = norm(body?.sequenceId) || null;
    const title = norm(body?.title);
    const resourceType = norm(body?.resource_type);
    const content = body?.content ?? null;

    if (!organisationId) {
      return NextResponse.json(
        { error: "organisationId required" },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { error: "title required" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
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
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
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

    const organisationId = norm(body?.organisationId);
    const resourceId = norm(body?.resourceId);
    const title = norm(body?.title);
    const hasContent = Object.prototype.hasOwnProperty.call(body, "content");
    const content = hasContent ? body.content : undefined;

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

    if (!title && !hasContent) {
      return NextResponse.json(
        { error: "Nothing to update. Provide title and/or content." },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (title) {
      updatePayload.title = title;
    }

    if (hasContent) {
      updatePayload.content = content;
    }

    const { data, error } = await supabaseAdmin
      .from("resource_library")
      .update(updatePayload)
      .eq("organisation_id", organisationId)
      .eq("id", resourceId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
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

    const organisationId = norm(body?.organisationId);
    const resourceId = norm(body?.resourceId);

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
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
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
