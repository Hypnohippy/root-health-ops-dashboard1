import type { GenerationProfile } from "@/lib/tenantGeneration";

export const outreachStages = ["connection", "day3_dm", "day10_insight", "day17_followup", "parked"] as const;
export type OutreachStage = typeof outreachStages[number];

export function isGrowthTargetDue(target: { stage?: string | null; last_action_at?: string | null }, now = Date.now()) {
  if (target.stage === "connection") return true;
  if (!target.last_action_at) return false;
  const days = (now - new Date(target.last_action_at).getTime()) / 86400000;
  return target.stage === "day3_dm" ? days >= 3 : ["day10_insight", "day17_followup"].includes(target.stage || "") ? days >= 7 : false;
}

export function nextGrowthStage(stage: string): OutreachStage {
  if (stage === "connection") return "day3_dm";
  if (stage === "day3_dm") return "day10_insight";
  if (stage === "day10_insight") return "day17_followup";
  return "parked";
}

export function contextualOutreachDraft(target: { target_name: string; company?: string | null; role_title?: string | null; stage?: string | null }, profile: GenerationProfile) {
  const first = target.target_name.trim().split(/\s+/)[0] || target.target_name;
  const role = target.role_title?.trim();
  const company = target.company?.trim();
  const remit = role && company ? `your ${role} remit at ${company}` : role ? `your work as ${role}` : company ? `your work at ${company}` : "your current priorities";
  const business = profile.business.name || "our team";
  const audience = profile.customers.audience;
  const relevance = audience ? ` We work with ${audience}; I was curious what is most important in ${remit} right now.` : ` I was curious what is most important in ${remit} right now.`;
  if (target.stage === "connection") return `Hi ${first} — ${remit.charAt(0).toUpperCase() + remit.slice(1)} caught my attention. It would be good to connect.`;
  if (target.stage === "day3_dm") return `Hi ${first} — good to be connected.${relevance}`;
  if (target.stage === "day10_insight") return `Hi ${first} — thinking about ${remit}, what change would make the most practical difference this year?`;
  if (target.stage === "day17_followup") return `Hi ${first} — I’ll leave this with you. If a conversation with ${business} would be useful, I’m happy to compare notes.`;
  return "";
}

export function canonicalLinkedInProfile(value: string) {
  try { const url = new URL(value); return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "").toLowerCase()}`; }
  catch { return value.trim().toLowerCase().split(/[?#]/)[0].replace(/\/$/, ""); }
}
