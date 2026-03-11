// app/api/sequences/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const organisationId = searchParams.get("organisationId");

    if (!organisationId) {
      return NextResponse.json({ error: "Missing organisationId" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("sequences")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Could not load sequences", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ sequences: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal error", details: e?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { organisationId, name, goal, audience, notes, status } = body || {};

    if (!organisationId || !name) {
      return NextResponse.json(
        { error: "organisationId and name are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("sequences")
      .insert({
        organisation_id: organisationId,
        name,
        goal: goal || null,
        audience: audience || null,
        notes: notes || null,
        status: status || "draft",
        generated_content: {},
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Could not create sequence", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, sequence: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal error", details: e?.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { organisationId, sequenceId, generatedContent, status } = body || {};

    if (!organisationId || !sequenceId) {
      return NextResponse.json(
        { error: "organisationId and sequenceId are required" },
        { status: 400 }
      );
    }

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (generatedContent !== undefined) {
      updatePayload.generated_content = generatedContent;
    }

    if (typeof status === "string" && status.trim()) {
      updatePayload.status = status.trim();
    }

    const { data, error } = await supabaseAdmin
      .from("sequences")
      .update(updatePayload)
      .eq("id", sequenceId)
      .eq("organisation_id", organisationId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Could not update sequence", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, sequence: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal error", details: e?.message },
      { status: 500 }
    );
  }
}
