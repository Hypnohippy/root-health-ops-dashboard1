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
  return ({ connection: "Day 0: acknowledge the accepted connection naturally using the saved name. Reference recorded role/company/context where available, explain possible relevance from this sender Growth Profile and end naturally with no question mark, question or CTA. Adapt the reason for connecting to verified recipient context. Write a complete human opener, not a one-line template; no hard pitch or meeting ask.", day3_followup: "Follow-up 1 / Day 3: reference the existing connection and actual earlier message naturally, add one relevant thought or angle from the contact context and sender Growth Profile, then ask one low-pressure question. Do not repeat the first message or invent a reply.", day7_parity: "Follow-up 2 / Day 7: shorter and more direct; introduce one concrete sender angle supported by the Growth Profile, establish genuine relevance and offer a brief conversation if relevant. No hard pitch or assumed interest.", day14_insight: "Day 14: offer one concise observation, idea or relevant insight grounded in known context. No invented facts or hard pitch.", day28_relevance: "Day 28: briefly explain the sender organisation's actual work and why it may be relevant; naturally invite a reply. No aggressive meeting ask.", day42_close: "Day 42: polite final message; say you will leave it there rather than keep messaging, and leave the door open. After confirmed send park the contact." } as Record<string,string>)[legacyCadenceStages[stage] || stage] || "No silent outreach for parked contacts.";
}
export function contextualOutreachDraft(target: { target_name: string; company?: string | null; role_title?: string | null; stage?: string | null; last_reply_text?: string | null; previous_outbound_text?: string | null }, profile: GenerationProfile) {
  const first = target.target_name.trim().split(/\s+/)[0] || "there";
  const stage = legacyCadenceStages[target.stage || ""] || target.stage;
  const work = profile.business.description?.trim();
  const previous = target.previous_outbound_text || target.last_reply_text;
  if (stage === "connection") {
    if (!target.target_name.trim() || !work) return ""; // Request the missing facts, never fill with a generic nameless hello.
    const recipient = target.role_title ? `Your work as ${target.role_title}${target.company ? ` at ${target.company}` : ""} may give us a useful point of overlap.` : target.company ? `Your work at ${target.company} may give us a useful point of overlap.` : "I wanted to introduce the work behind my profile.";
    return `Hi ${first}, thanks for connecting. ${recipient} To give a little context, ${work}. That is the context behind connecting, without assuming it is a priority for you. It is good to be connected here.`;
  }
  if (!previous) return ""; // No invented prior conversation or promise.
  const context = target.role_title ? `in your work as ${target.role_title}` : target.company ? `at ${target.company}` : "in your work";
  const angle = [...(profile.offer?.priorityServices || []), ...(profile.customers?.problems || [])].find(value => value.trim() && !previous.toLowerCase().includes(value.toLowerCase())) || work;
  if (stage === "day3_followup") return angle ? `Hi ${first}, picking up from my earlier message after we connected: one angle worth exploring is ${angle}. That might offer a useful angle ${context}, without assuming it is your priority. How are you approaching that at the moment?` : "";
  if (stage === "day7_parity") return angle ? `Hi ${first}, one more concrete angle on my earlier message: ${angle}. If that is relevant ${context}, would a brief conversation be useful?` : "";
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
