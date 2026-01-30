// app/api/org/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type TierKey = "solo" | "growth" | "team";

function normalizeTierFromAny(value: any): TierKey {
  const v = String(value || "").toLowerCase().trim();

  // enterprise/team
  if (v.includes("enterprise") || v === "team") return "team";

  // pro/growth
  if (v.includes("pro") || v.includes("growth")) return "growth";

  // default
  return "solo";
}

function computeCapabilities(tier: TierKey) {
  return {
    tier,
    approvalsEnabled: tier === "team", // ✅ enterprise-only
    teamEnabled: tier === "team",
    // Keep this flexible for future gating:
    // e.g. posts/month, schedules, etc.
  };
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[org/plan] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

export async function GET(req: NextRequest) {
  try {
    let organisationId = req.nextUrl.searchParams.get("organisationId")?.trim() || "";

    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "Missing organisationId." },
        { status: 200 }
      );
    }

    // ✅ We use select("*") so we don't explode if columns change (plan vs plan_key etc)
    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("organisation_plans")
      .select("*")
      .eq("organisation_id", organisationId)
      .limit(1)
      .maybeSingle();

    if (planErr) {
      // If table exists but schema cache is weird, still fail gracefully
      console.warn("[org/plan] organisation_plans error", planErr);
    }

    // Try multiple likely columns
    const raw =
      (planRow as any)?.plan ??
      (planRow as any)?.plan_key ??
      (planRow as any)?.tier ??
      (planRow as any)?.plan_name ??
      "";

    const tier: TierKey = normalizeTierFromAny(raw);

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        planRaw: raw || null,
        ...computeCapabilities(tier),
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[org/plan] fatal", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal error." },
      { status: 200 }
    );
  }
}
