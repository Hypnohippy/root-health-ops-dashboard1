/** Code-owned post-acceptance strategy. Invitation notes and later stages never use this. */
export const FRESH_CONNECTION_MS = 7 * 24 * 60 * 60 * 1000;
export type LinkedInConnectionMode = "fresh" | "catchup" | "unverified";
/** Exactly seven days is fresh; unknown, invalid and future acceptance times never authorise Day 0. */
export function linkedInConnectionMode(acceptedAt: unknown, now = Date.now()): LinkedInConnectionMode {
  const at = typeof acceptedAt === "string" && acceptedAt.trim() ? Date.parse(acceptedAt) : NaN;
  if (!Number.isFinite(at) || !Number.isFinite(now) || at > now) return "unverified";
  return now - at <= FRESH_CONNECTION_MS ? "fresh" : "catchup";
}
export const recipientCategories = ["hr_people", "partner_referrer", "hr_consultancy", "college", "care_health", "other"] as const;
export type RecipientCategory = typeof recipientCategories[number];
export type DayZeroContext = { name?: string | null; role?: string | null; company?: string | null; recipientCategory?: string | null };
const clean = (value?: string | null) => (value || "").replace(/\s+/g, " ").trim();
export function dayZeroCategory(context: DayZeroContext): RecipientCategory {
  if (recipientCategories.some(category => category === context.recipientCategory)) return context.recipientCategory as RecipientCategory;
  const supplied = context.recipientCategory || "";
  if (/^partner(?:_|$)|referrer|introducer/i.test(supplied)) return "partner_referrer";
  if (/hr.*(?:agency|consult)|outsourced/i.test(supplied)) return "hr_consultancy";
  if (/education|college|training/i.test(supplied)) return "college";
  if (/care|health|nursing/i.test(supplied)) return "care_health";
  if (/hr|people|buyer/i.test(supplied)) return "hr_people";
  const facts = `${context.role || ""} ${context.company || ""}`;
  if (/\b(consultan\w*|outsourced|agency)\b/i.test(facts) && /\b(hr|human resources|people)\b/i.test(facts)) return "hr_consultancy";
  if (/\b(partner|referr\w*|introducer|distribution)\b/i.test(facts)) return "partner_referrer";
  if (/\b(college|education|training|university|learner)\b/i.test(facts)) return "college";
  if (/\b(care|health|nurs\w*|clinical)\b/i.test(facts) && !/\b(hr|human resources|people)\b/i.test(facts)) return "care_health";
  if (/\b(hr|human resources|people|wellbeing)\b/i.test(facts)) return "hr_people";
  return "other";
}
// Category supplies a tentative reason to connect, never invented facts about a person.
const angles: Record<RecipientCategory, string> = {
  hr_people: "thought there might be some overlap around people and workplace wellbeing",
  partner_referrer: "thought there might be some complementary work or potential for referrals",
  hr_consultancy: "thought there might be some overlap in supporting client organisations",
  college: "thought there might be some overlap around training and learner or staff wellbeing",
  care_health: "thought there might be some overlap around workforce wellbeing and resilience",
  other: "thought there might be some professional overlap in what we do",
};
export function linkedInDayZeroMessage(context: DayZeroContext): string {
  const first = clean(context.name).replace(/^(?:dr|mr|mrs|ms|miss|prof)\.?\s+/i, "").split(" ")[0];
  if (!first || !/^[\p{L}][\p{L}’'\-]*$/u.test(first)) throw Error("Resolve the saved person's name before generating a first message.");
  const role = clean(context.role), company = clean(context.company);
  // Treat supplied context as data, not instructions. Do not silently downgrade rich unsafe context.
  if ([role, company].some(value => value.length > 180 || /\p{Extended_Pictographic}/u.test(value) || /[?!\n<>]|https?:|\b(ignore|instructions?|prompt|system|call|meeting|demo|pitch)\b|hear your (?:thoughts|perspective)|glad to help|thanks for getting in touch|following up|shared focus|share this space/i.test(value))) throw Error("Review the recorded professional context before generating a first message.");
  const category = dayZeroCategory(context);
  const area = /\b(hr|human resources|people)\b/i.test(role) ? "your work in people and HR" : /\b(college|education|training|university)\b/i.test(role) ? "your work in education and training" : /\b(care|health|nurs\w*|clinical)\b/i.test(role) ? "your work in care and health" : `your work as ${role}`;
  // Prefer a natural role area; a company-only record stays grounded in the actual company.
  const anchor = role ? area : company ? `your work at ${company}` : "";
  if (!anchor && category === "other") return `Hi ${first}, thanks for connecting. Just wanted to say hello.`;
  return `Hi ${first}, thanks for connecting. I noticed ${anchor || "your recorded professional background"} and ${angles[category]}. Good to be connected.`;
}
export function safeDayZeroMessage(draft: string, context: DayZeroContext) {
  // The delivered, editable draft is the code-owned strategy, not unchecked provider prose.
  try { return draft.trim() === linkedInDayZeroMessage(context); } catch { return false; }
}
