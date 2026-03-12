import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const organisationId = String(body?.organisationId || "").trim();
    const sequenceId = String(body?.sequenceId || "").trim() || null;
    const title = String(body?.title || "").trim();
    const resourceType = String(body?.resource_type || "").trim();
    const content = body?.content || null;

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
