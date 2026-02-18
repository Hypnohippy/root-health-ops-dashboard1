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
    console.error("[growth/experiments/list] organisations error", error);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orgFromQuery = norm(url.searchParams.get("organisationId"));

    const organisationId = orgFromQuery || (await getLatestOrganisationId());
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    // 1) experiments
    const ex = await supabaseAdmin
      .from("growth_experiments")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (ex.error) {
      console.error("[growth/experiments/list] experiments error", ex.error);
      return NextResponse.json({ success: false, error: ex.error.message }, { status: 500 });
    }

    const items = Array.isArray(ex.data) ? ex.data : [];

    // 2) outcomes (batch)
    const ids = items.map((i: any) => i.id).filter(Boolean);
    let outcomesByExp: Record<string, any[]> = {};

    if (ids.length > 0) {
      const outs = await supabaseAdmin
        .from("growth_experiment_outcomes")
        .select("*")
        .in("experiment_id", ids)
        .order("created_at", { ascending: false });

      if (!outs.error && Array.isArray(outs.data)) {
        for (const o of outs.data) {
          const k = String((o as any).experiment_id || "");
          if (!k) continue;
          if (!outcomesByExp[k]) outcomesByExp[k] = [];
          outcomesByExp[k].push(o);
        }
      }
    }

    const merged = items.map((e: any) => ({
      ...e,
      growth_experiment_outcomes: outcomesByExp[String(e.id)] || [],
    }));

    return NextResponse.json({ success: true, organisationId, items: merged });
  } catch (e: any) {
    console.error("[growth/experiments/list] crashed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "List experiments failed" },
      { status: 500 }
    );
  }
}
