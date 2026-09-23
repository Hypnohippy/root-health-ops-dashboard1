import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function daysSince(date: string | null) {
  if (!date) return 999;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function isDue(target: any) {
  const days = daysSince(target.last_action_at);

  if (target.stage === "connection") return true;
  if (target.stage === "day3_dm") return days >= 3;
  if (target.stage === "day10_insight") return days >= 7;
  if (target.stage === "day17_followup") return days >= 7;

  return false;
}

function firstName(name: string) {
  return name.trim().split(" ")[0] || name;
}

function getMessage(target: any) {
  const name = firstName(target.target_name);

  if (target.stage === "connection") {
    return `Hi ${name}, I noticed your work in ${target.role_title || "your field"}. Would be good to connect.`;
  }

  if (target.stage === "day3_dm") {
    return `Thanks for connecting, ${name}. Quick question — what is your main business priority at the moment?`;
  }

  if (target.stage === "day10_insight") {
    return `Hi ${name}, what would make the biggest practical difference for your team right now?`;
  }

  if (target.stage === "day17_followup") {
    return `Just wanted to follow up, ${name}. Would it be useful to continue our conversation?`;
  }

  return "";
}

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  const { data, error } = await supabaseAdmin
    .from("growth_targets")
    .select("*").eq("organisation_id", tenant.organisationId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const due = (data || []).filter(isDue).map((target: any) => ({
    ...target,
    suggested_message: getMessage(target),
  }));

  return NextResponse.json({ success: true, data: due });
}, { generation: false, write: false });
