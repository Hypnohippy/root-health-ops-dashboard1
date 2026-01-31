// app/api/billing/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type PlanKey = "solo" | "growth" | "team";

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[billing/plan] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

function mapPlan(raw: string | null | undefined): PlanKey {
  const p = String(raw || "").toLowerCase().trim();

  // We’ve used these labels in other places:
  // - organisation_plans.plan often: basic | pro | enterprise
  // - pricing uses: solo | growth | team
  if (p === "enterprise" || p === "team") return "team";
  if (p === "pro" || p === "growth") return "growth";
  if (p === "basic" || p === "solo") return "solo";

  // Default safe assumption: solo
  return "solo";
}

export async function GET(req: NextRequest) {
  try {
    // optional orgId override
    let organisationId = req.nextUrl.searchParams.get("organisationId")?.trim() || "";

    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisationId available." },
        { status: 200 }
      );
    }

    // Try organisation_plans first (your webhook writes here)
    const { data: planRows, error: planErr } = await supabaseAdmin
      .from("organisation_plans")
      .select("plan, posts_per_month, trial_ends_at, updated_at")
      .eq("organisation_id", organisationId)
      .limit(1);

    if (planErr) {
      console.error("[billing/plan] organisation_plans error", planErr);
    }

    const rawPlan = planRows?.[0]?.plan ?? null;
    const plan = mapPlan(rawPlan);

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        plan, // solo | growth | team  (what UI wants)
        rawPlan, // basic | pro | enterprise (what DB may store)
        postsPerMonth: planRows?.[0]?.posts_per_month ?? null,
        trialEndsAt: planRows?.[0]?.trial_ends_at ?? null,
        updatedAt: planRows?.[0]?.updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[billing/plan] fatal", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal error." },
      { status: 200 }
    );
  }
}
