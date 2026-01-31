import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error) return null;
  return data?.[0]?.id ? String(data[0].id) : null;
}

export async function GET(req: NextRequest) {
  try {
    // For now: single-tenant fallback (same pattern you use elsewhere)
    const organisationId = await getSingleTenantOrganisationId();

    if (!organisationId) {
      return NextResponse.json({ ok: true, plan: "unknown" }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from("organisation_plans")
      .select("plan, posts_per_month, updated_at")
      .eq("organisation_id", organisationId)
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: true, plan: "unknown" }, { status: 200 });
    }

    const plan = data?.[0]?.plan ? String(data[0].plan) : "unknown";
    return NextResponse.json({ ok: true, plan }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true, plan: "unknown" }, { status: 200 });
  }
}
