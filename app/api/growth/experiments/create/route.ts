import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

async function getLatestOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[growth/experiments/create] organisations error", error);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = norm(body?.title);
    const platform = norm(body?.platform);
    const hypothesis = norm(body?.hypothesis) || null;
    const pattern_type = norm(body?.pattern_type) || null;
    const format = norm(body?.format) || null;

    let status = norm(body?.status || "planned").toLowerCase();
    if (!["planned", "running", "completed", "abandoned"].includes(status)) status = "planned";

    // org id (we support passing it, but fallback to latest org)
    let organisationId = norm(body?.organisationId || body?.organisation_id);
    if (!organisationId) {
      organisationId = (await getLatestOrganisationId()) || "";
    }

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found to attach experiment to." },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json({ success: false, error: "Missing title" }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ success: false, error: "Missing platform" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const started_at = status === "running" ? now : null;
    const completed_at = status === "completed" ? now : null;

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .insert({
        organisation_id: organisationId,
        title,
        hypothesis,
        platform,
        pattern_type,
        format,
        status,
        started_at,
        completed_at,
        updated_at: now,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error("[growth/experiments/create] insert error", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (e: any) {
    console.error("[growth/experiments/create] crashed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Create experiment failed" },
      { status: 500 }
    );
  }
}
