import { isGrowthTargetDue } from "@/lib/growthOutreach";

type GrowthTarget = { stage?: string | null; status?: string | null; last_action_at?: string | null; reply_status?: string | null; deal_stage?: string | null };
export function growthAttentionCounts(targets: GrowthTarget[], now = Date.now()) {
  const active = targets.filter(target => target.status === "active");
  return {
    followupsDue: active.filter(target => isGrowthTargetDue(target, now)).length,
    waiting: active.filter(target => Boolean(target.last_action_at) && !isGrowthTargetDue(target, now)).length,
    warmOpportunities: targets.filter(target => ["positive", "interested", "engaged", "call_booked"].includes(target.reply_status || "") || ["engaged", "opportunity", "meeting"].includes(target.deal_stage || "")).length,
    meetingsOrConversions: targets.filter(target => target.reply_status === "call_booked" || ["meeting", "converted", "won"].includes(target.deal_stage || "")).length,
  };
}

export function plainGrowthStage(stage?: string | null) {
  return ({ connection: "New contact", day3_dm: "Follow up today", day10_insight: "Share useful insight", day17_followup: "Final follow-up", parked: "Nurture" } as Record<string,string>)[stage || ""] || "Next action";
}
