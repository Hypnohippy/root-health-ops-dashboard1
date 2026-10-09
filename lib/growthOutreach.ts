import type { GenerationProfile } from "@/lib/tenantGeneration";
export const outreachStages = ["connection", "day3_followup", "day7_parity", "day14_insight", "day28_relevance", "day42_close", "parked"] as const;
export type OutreachStage = typeof outreachStages[number];
export const cadenceDays: Record<string, number> = { connection: 0, day3_followup: 3, day7_parity: 7, day14_insight: 14, day28_relevance: 28, day42_close: 42 };
export const legacyCadenceStages: Record<string, OutreachStage> = { day3_dm: "day3_followup", day10_insight: "day7_parity", day17_followup: "day14_insight", week5_view: "day28_relevance", week6_relevance: "day28_relevance", week7_close: "day42_close" };
const validDate = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
type CadenceTarget = { stage?: string | null; last_action_at?: string | null; first_outbound_at?: unknown; manual_completion?: unknown; reply_status?: string | null; replied_at?: unknown; status?: unknown; deal_stage?: unknown };
export function firstConfirmedOutboundAt(target: CadenceTarget) {
  if (validDate(target.first_outbound_at)) return validDate(target.first_outbound_at);
  const receipt = target.manual_completion as { completed_at?: unknown; stage?: unknown; history?: { completed_at?: unknown; stage?: unknown }[] } | undefined;
  const first = [receipt, ...(receipt?.history || [])].filter(r => r?.stage === "connection").map(r => validDate(r?.completed_at)).filter((d): d is string => !!d).sort()[0];
  // Legacy connection/day3 position can prove the first send; later last_action_at cannot.
  return first || null;
}
export function growthFollowUpDueAt(target: CadenceTarget) {
  const stage = legacyCadenceStages[target.stage || ""] || target.stage || "";
  const first = firstConfirmedOutboundAt(target);
  return first && cadenceDays[stage] > 0 ? new Date(Date.parse(first) + cadenceDays[stage] * 86400000).toISOString() : null;
}
export function isGrowthTargetDue(target: CadenceTarget, now = Date.now()) {
  if (target.replied_at || (target.reply_status && target.reply_status !== "no_reply") || ["parked", "nurture", "lost", "closed", "converted"].includes(String(target.status)) || ["meeting", "lost", "closed", "converted", "won", "nurture", "engaged", "opportunity"].includes(String(target.deal_stage))) return false;
  if (target.stage === "connection") return !firstConfirmedOutboundAt(target);
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
  return ({ connection: "Day 0: human hello after accepted connection. Use verified sender Growth Profile and recipient context; no pitch or meeting ask.", day3_followup: "Day 3: briefly acknowledge they may not have seen the previous message; ask exactly one pertinent question grounded in their role/context. Do not repeat the first message.", day7_parity: "Day 7: explore genuine parity/relevance by asking about their current approach, challenges, priorities or what they are seeing. Establish a reason to continue.", day14_insight: "Day 14: offer one concise observation, idea or relevant insight grounded in known context. No invented facts or hard pitch.", day28_relevance: "Day 28: briefly explain the sender organisation's actual work and why it may be relevant; naturally invite a reply. No aggressive meeting ask.", day42_close: "Day 42: polite final message; say you will leave it there rather than keep messaging, and leave the door open. After confirmed send park the contact." } as Record<string,string>)[legacyCadenceStages[stage] || stage] || "No silent outreach for parked contacts.";
}
export function contextualOutreachDraft(target: { target_name: string; company?: string | null; role_title?: string | null; stage?: string | null; last_reply_text?: string | null; previous_outbound_text?: string | null }, profile: GenerationProfile) {
  const first = target.target_name.trim().split(/\s+/)[0] || "there";
  const stage = legacyCadenceStages[target.stage || ""] || target.stage;
  const work = profile.business.description?.trim();
  const previous = target.previous_outbound_text || target.last_reply_text;
  if (stage === "connection") return `Hi ${first}, ${work ? `my work is around ${work}. ` : ""}Good to connect — thought I'd say hello properly.`;
  if (!previous) return ""; // No invented prior conversation or promise.
  const context = target.role_title ? `in your work as ${target.role_title}` : target.company ? `at ${target.company}` : "in your work";
  if (stage === "day3_followup") return `Hi ${first}, you may not have seen my earlier message. What is one priority ${context} at the moment?`;
  if (stage === "day7_parity") return `Hi ${first}, how are you approaching your current priorities ${context}? I'd like to understand whether there is a useful reason to continue the conversation.`;
  if (stage === "day14_insight") return `Hi ${first}, one idea that may be useful ${context}: separate what needs attention now from what can wait, before choosing a next step.`;
  if (stage === "day28_relevance") return work ? `Hi ${first}, to give a little context, ${profile.business.name ? profile.business.name + ': ' : ""}${work}. If that is relevant to what you are working on, I'd be interested to hear.` : "";
  if (stage === "day42_close") return `Hi ${first}, I'll leave it there rather than keep messaging. If there is a useful reason to pick this up in future, the door is open.`;
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
