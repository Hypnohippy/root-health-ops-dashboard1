/** Code-owned first-message strategy for verified, recently accepted connections. */
export const FRESH_CONNECTION_MS = 7 * 24 * 60 * 60 * 1000;
export type LinkedInConnectionMode = "fresh" | "catchup" | "unverified";
/** Exactly seven days is fresh; unknown, invalid and future acceptance times never authorise Day 0. */
export function linkedInConnectionMode(acceptedAt: unknown, now = Date.now()): LinkedInConnectionMode {
  const at = typeof acceptedAt === "string" && acceptedAt.trim() ? Date.parse(acceptedAt) : NaN;
  if (!Number.isFinite(at) || !Number.isFinite(now) || at > now) return "unverified";
  return now - at <= FRESH_CONNECTION_MS ? "fresh" : "catchup";
}

export type LinkedInFirstMessageFamily = "hr_consultant" | "people_leader" | "executive" | "partner" | "general";
export type DayZeroContext = { name?: string | null; role?: string | null; company?: string | null; recipientCategory?: string | null };
const clean = (value?: string | null) => (value || "").replace(/\s+/g, " ").trim();
const familyLabels: Record<LinkedInFirstMessageFamily, string> = {
  hr_consultant: "HR Consultant",
  people_leader: "People Leader",
  executive: "CEO",
  partner: "Partner",
  general: "General",
};
export function linkedInFirstMessageAngle(family: LinkedInFirstMessageFamily) { return familyLabels[family]; }

/**
 * Classify from already-canonical professional context only. Company is used
 * narrowly to recognise a verified HR consultancy founder; it is never copied
 * into the message. Conflicting role signals fall back to General.
 */
export function linkedInFirstMessageFamily(context: DayZeroContext): LinkedInFirstMessageFamily {
  const role = clean(context.role), company = clean(context.company), category = clean(context.recipientCategory).toLowerCase();
  const hrConsultant = /\b(?:hr|human resources|people)\b.*\b(?:consultant|consultancy|advisor|adviser|fractional)\b|\b(?:consultant|consultancy|advisor|adviser|fractional)\b.*\b(?:hr|human resources|people)\b/i.test(role) ||
    /\b(?:hr|human resources|people)\s+director\s+for\s+hire\b|\bindependent\s+(?:hr|human resources|people)\b/i.test(role) ||
    category === "hr_consultancy" ||
    (/\b(?:founder|co[- ]?founder|owner|director|managing director|md|ceo)\b/i.test(role) && /\b(?:hr|human resources|people)\s+(?:consultants?|consultancy|advisers?)\b/i.test(company));
  if (hrConsultant) return "hr_consultant";
  if (/\bmanaging partner\b/i.test(role)) return "executive";

  const peopleLeader = /\b(?:people|hr|human resources|employee experience|people operations|learning and development|l&d)\b/i.test(role) ||
    (/\bwellbeing\b/i.test(role) && !/\bwellbeing\s+(?:consultant|advisor|adviser|coach)\b/i.test(role)) || category === "hr_people";
  const executive = /\b(?:ceo|chief executive|managing director|\bmd\b|owner|founder|co[- ]?founder|business owner|managing partner)\b/i.test(role);
  const partner = /\b(?:partner|referr(?:al|er)|introducer|distribution|workplace wellbeing|employee wellbeing|occupational health|health consultant|wellbeing consultant|coach|therapist|training provider)\b/i.test(role) || category === "partner_referrer";
  const signals = [peopleLeader, executive, partner].filter(Boolean).length;
  if (signals > 1) return "general";
  if (peopleLeader) return "people_leader";
  if (executive) return "executive";
  if (partner) return "partner";
  return "general";
}

const templates: Record<LinkedInFirstMessageFamily, readonly [string, string, string]> = {
  hr_consultant: [
    "Hi {name} — thanks for connecting. I’m interested in how independent HR consultants keep adding value after the initial client project ends. We’re exploring a way to bring more continuous workforce wellbeing insight into those client relationships, with potential for recurring revenue without the consultant needing to build their own technology. I’m testing the model with people who know this work well. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I’m speaking with independent HR consultants about what happens after an initial client project: how to stay useful to the organisation without building another piece of technology. We’re exploring whether ongoing workforce wellbeing insight could add value between projects and create a potential recurring revenue stream. I’d value your practical view. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I’m looking at a model that could help HR consultants extend client relationships beyond the first project, using more continuous workforce wellbeing insight rather than asking consultants to build their own platform. There may also be a recurring revenue opportunity if it proves useful to clients. I’m testing that assumption with practitioners. Would you be open to a short 20-minute call next week?",
  ],
  people_leader: [
    "Hi {name} — thanks for connecting. I’m working on a preventative wellbeing platform designed to give People teams a clearer view of workforce pressure, recovery and emerging risk before it turns into absence, burnout or disengagement. The aim is to give HR something more useful than another wellbeing benefit — ongoing visibility into how the workforce is actually doing and where support may be needed. I’d really value your perspective. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I’m exploring how People teams might get a clearer, more continuous view of workforce wellbeing between formal surveys or one-off initiatives. The idea is to make emerging pressure and possible support needs easier to notice, while giving employees something useful day to day. I’d be interested in your perspective on the approach. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I’m working on a preventative wellbeing approach that aims to give People teams earlier insight into how employees are doing and where support may be useful. It is designed to complement existing benefits with a more continuous view, rather than waiting for concerns to become visible through absence or disengagement. I’d value your honest reaction. Would you be open to a short 20-minute call next week?",
  ],
  executive: [
    "Hi {name} — thanks for connecting. I’m working on a preventative workplace wellbeing platform aimed at helping business leaders see workforce pressure earlier, before it may show up as absence, lost performance, disengagement or people leaving. The question I’m exploring is whether earlier insight gives organisations a practical chance to respond sooner. I’d be interested in your view from the business side. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I’m looking at a commercial problem many organisations find hard to see early: workforce pressure can become visible only once absence, disengagement or retention problems are already affecting the business. We’re exploring whether more continuous wellbeing insight could help leaders notice where support may be needed sooner. I’d value your perspective as a business leader. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I’m working on an approach to give leaders a clearer view of workforce wellbeing over time, so emerging pressure may be easier to spot before it becomes an operational concern. We’re testing whether that kind of visibility is useful to businesses and practical to act on. I’d be interested in your view. Would you be open to a short 20-minute call next week?",
  ],
  partner: [
    "Hi {name} — thanks for connecting. I’m working on something that may sit quite naturally alongside the work consultants and wellbeing professionals already do with organisations. The idea is to give employers a more continuous view of workforce wellbeing between interventions, without replacing the existing service or client relationship. There may be an interesting partnership or referral angle in that. Would you be open to a short 20-minute conversation next week?",
    "Hi {name} — thanks for connecting. I’m looking at whether continuous workforce wellbeing insight could sit alongside the support and advice organisations already receive from experienced practitioners. The intention is to complement existing services, not replace them, and there may be a useful referral or partnership angle. I’d value your view on whether that feels relevant. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. We’re exploring a workplace wellbeing offer that could help organisations maintain a clearer view between projects or interventions. It may fit alongside the work of people already supporting employers, rather than competing with their service. I’m speaking with potential partners to understand where a practical referral relationship might make sense. Would you be open to a short 20-minute call next week?",
  ],
  general: [
    "Hi {name} — thanks for connecting. I’m looking at how organisations can understand workforce wellbeing more continuously, rather than relying only on occasional initiatives or support once someone is already struggling. The aim is to make it easier to see where support may be useful while giving employees something practical day to day. I’d be interested in your perspective from the work you do. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I spend time thinking about how organisations can get a steadier picture of workforce wellbeing between surveys, programmes or moments when someone is already struggling. We’re exploring a practical way to offer employees useful day-to-day support and give organisations clearer insight. I’d be interested in your perspective if this touches your work. Would you be open to a short 20-minute call next week?",
    "Hi {name} — thanks for connecting. I’m exploring a more continuous approach to workplace wellbeing, so organisations are not relying only on occasional initiatives to understand how people are doing. The idea is to combine useful everyday support for employees with clearer insight into where help may be needed. I’d value your perspective on the idea. Would you be open to a short 20-minute call next week?",
  ],
};

function firstName(context: DayZeroContext) {
  const first = clean(context.name).replace(/^(?:dr|mr|mrs|ms|miss|prof)\.?\s+/i, "").split(" ")[0];
  if (!first || !/^[\p{L}][\p{L}’'\-]*$/u.test(first)) throw Error("Resolve the saved person's name before generating a first message.");
  return first;
}
function validateContext(context: DayZeroContext) {
  const role = clean(context.role), company = clean(context.company);
  const roleLimit = linkedInFirstMessageFamily(context) === "general" ? 180 : 240;
  if (role.length > roleLimit || company.length > 180 || [role, company].some(value => /\p{Extended_Pictographic}/u.test(value) || /[?!\n<>]|https?:|\b(ignore|instructions?|prompt|system|book|demo|pitch)\b|hear your (?:thoughts|perspective)|glad to help|thanks for getting in touch|following up|shared focus|share this space/i.test(value))) {
    throw Error("Review the recorded professional context before generating a first message.");
  }
}

export function linkedInDayZeroMessage(context: DayZeroContext, variant = 0): string {
  const first = firstName(context);
  validateContext(context);
  const selectedVariant = Number.isInteger(variant) && variant >= 0 && variant <= 2 ? variant : 0;
  const family = linkedInFirstMessageFamily(context);
  return templates[family][selectedVariant].replaceAll("{name}", first);
}

export function safeDayZeroMessage(draft: string, context: DayZeroContext) {
  try { return [0, 1, 2].some(variant => draft.trim() === linkedInDayZeroMessage(context, variant)); } catch { return false; }
}
