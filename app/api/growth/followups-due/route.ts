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
    return `Hi ${name}, I noticed your work in ${target.role_title || "HR / wellbeing"}. I’ve been speaking with HR leaders about what actually gets used beyond EAPs. Would be good to connect.`;
  }

  if (target.stage === "day3_dm") {
    return `Thanks for connecting, ${name}. Quick question — what parts of your current wellbeing setup actually get used, and where does it fall short?`;
  }

  if (target.stage === "day10_insight") {
    return `Hi ${name}, one thing I keep seeing is support exists, but people only use it once things escalate. Do you see that in your organisation?`;
  }

  if (target.stage === "day17_followup") {
    return `Just wanted to follow up, ${name}. Curious how you're seeing engagement with wellbeing support in practice.`;
  }

  return "";
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("growth_targets")
    .select("*")
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
}
