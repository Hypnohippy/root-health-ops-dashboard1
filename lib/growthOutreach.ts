import { firstSendEvidence, cadenceEvidence } from "@/lib/linkedinSendEvidence";
import type { GenerationProfile } from "@/lib/tenantGeneration";
export const outreachStages = ["connection", "day3_followup", "day7_parity", "day14_insight", "day28_relevance", "day42_close", "parked"] as const;
export type OutreachStage = typeof outreachStages[number];
export const cadenceDays: Record<string, number> = { connection: 0, day3_followup: 3, day7_parity: 7, day14_insight: 14, day28_relevance: 28, day42_close: 42 };
export const legacyCadenceStages: Record<string, OutreachStage> = { day3_dm: "day3_followup", day10_insight: "day7_parity", day17_followup: "day14_insight", week5_view: "day28_relevance", week6_relevance: "day28_relevance", week7_close: "day42_close" };
type CadenceTarget = { linkedin_cadence_anchor?: unknown; linkedin_conversation_active?: unknown; linkedin_previously_contacted?: unknown; stage?: string | null; last_action_at?: string | null; first_outbound_at?: unknown; manual_completion?: unknown; reply_status?: string | null; replied_at?: unknown; status?: unknown; deal_stage?: unknown };
export function firstConfirmedOutboundAt(target: CadenceTarget) {
  return cadenceEvidence(target).sentAt;

}
export function growthFollowUpDueAt(target: CadenceTarget) {
  const stage = legacyCadenceStages[target.stage || ""] || target.stage || "";
  const first = firstConfirmedOutboundAt(target);
  return first && cadenceDays[stage] > 0 ? new Date(Date.parse(first) + cadenceDays[stage] * 86400000).toISOString() : null;
}
export function isGrowthTargetDue(target: CadenceTarget, now = Date.now()) {
  if (target.linkedin_conversation_active || target.replied_at || (target.reply_status && target.reply_status !== "no_reply") || ["parked", "nurture", "lost", "closed", "converted"].includes(String(target.status)) || ["meeting", "lost", "closed", "converted", "won", "nurture", "engaged", "opportunity"].includes(String(target.deal_stage))) return false;
  if (target.stage === "connection") return !target.linkedin_previously_contacted && !firstSendEvidence(target.manual_completion).receipt && !target.last_action_at;
  const due = growthFollowUpDueAt(target); return due !== null && now >= Date.parse(due);
}
export function nextGrowthStage(stage: string): OutreachStage {
  const canonical = legacyCadenceStages[stage] || stage;
  const i = outreachStages.indexOf(canonical as OutreachStage);
  return i >= 0 ? outreachStages[Math.min(i + 1, outreachStages.length - 1)] : "parked";
}
export function elapsedCadenceStage(first: string, now = Date.now()): OutreachStage {
  const days = (now - Date.parse(first)) / 86400000;
  return days >= 42 ? "day42_close" : days >= 28 ? "day28_relevance" : days >= 14 ? "day14_insight" : days >= 7 ? "day7_parity" : "day3_followup";
}
export function cadenceIntent(stage: string) {
  return ({ connection: "Day 0: human hello after accepted connection. Use verified sender Growth Profile and recipient context; no pitch or meeting ask.", day3_followup: "Day 3: the next natural turn after the ACTUAL previous outbound. A hello did not require a reply: move from its real subject to one specific, easy conversational question. Never chase, mention silence or imply the message was missed. No pitch or meeting ask.", day7_parity: "Day 7: deepen the subject actually introduced in our recorded outbound, with one simple new question. No reply means no two-way conversation: do not invent their views, interest or priorities, repeat the last question, or chase an answer.", day14_insight: "Day 14: add one genuinely useful observation or practical idea relevant to the actual recorded subject. Do not invent a resource, statistic, result, recipient view or past discussion. No chase or hard pitch.", day28_relevance: "Day 28: explain the sender organisation's verified work only where relevant to the subject WE actually introduced. Invite a response naturally without pretending there was a reply or established interest. No stock chase or meeting pressure.", day42_close: "Day 42: a brief, courteous close that leaves the door open. No tally of messages, guilt, reference to silence, passive aggression or invented discussion." } as Record<string,string>)[legacyCadenceStages[stage] || stage] || "No silent outreach for parked contacts.";
}
export function contextualOutreachDraft(target: { target_name: string; company?: string | null; role_title?: string | null; stage?: string | null; last_reply_text?: string | null; previous_outbound_text?: string | null }, profile: GenerationProfile) {
  const first = target.target_name.trim().split(/\s+/)[0] || "there";
  const stage = legacyCadenceStages[target.stage || ""] || target.stage;
  const work = profile.business.description?.trim();
  if (stage === "connection") return `Hi ${first}, ${work ? `my work is around ${work}. ` : ""}Good to connect — thought I'd say hello properly.`;
  // A static template cannot establish the next turn from an arbitrary real outbound.
  // Follow-up suggestions are generated by the Console's evidence-grounded path.
  return "";
}

export function canonicalLinkedInProfile(
  value: string
) {
  try {
    const url = new URL(value);

    return `${url.hostname
      .toLowerCase()
      .replace(/^www\./, "")}${url.pathname
      .replace(/\/$/, "")
      .toLowerCase()}`;
  } catch {
    return value
      .trim()
      .toLowerCase()
      .split(/[?#]/)[0]
      .replace(/\/$/, "");
  }
}
