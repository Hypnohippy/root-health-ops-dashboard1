import type { GenerationProfile } from "@/lib/tenantGeneration";

export type InteractionType = "linkedin_connection_first_message" | "linkedin_followup" | "linkedin_reply" | "email_reply" | "social_reply" | "nurture" | "warm_opportunity";
export type ResponseContactContext = {
  interactionType: InteractionType;
  messageType: string;
  name: string | null;
  role: string | null;
  company: string | null;
  sector: string | null;
  source: string;
  whyRelevant: string;
  relationship: string;
  latestEvent: string;
  whatWeKnow: string[];
  history: string[];
  lastAction: string | null;
  currentStage: string | null;
  buyingSignal: "actual" | "strategic_fit" | "unknown";
  buyingSignalLabel: string;
  objective: string;
};

export const plainStage = (stage?: string | null) => ({ connection: "Ready for a first message", day3_dm: "Follow-up due today", day10_insight: "Useful insight follow-up", day17_followup: "Final follow-up", parked: "Nurture / re-engagement" } as Record<string,string>)[stage || ""] || null;
export const plainSource = (source?: string | null, kind?: string | null) => source === "linkedin_connection_network" ? "Suggested through a LinkedIn connection’s network" : kind === "connection_accepted" ? "LinkedIn connection acceptance email" : source === "root_health_b2b" ? "Existing B2B outreach" : source ? "Existing outreach activity" : "Response inbox";

export function interactionTypeFor(item: Record<string, unknown>, target?: Record<string, unknown> | null): InteractionType {
  const platform = String(item.platform || ""); const kind = String(item.kind || "");
  const stage = String(target?.stage || ""); const reply = String(target?.reply_status || ""); const deal = String(target?.deal_stage || "");
  if (["positive","interested","engaged","call_booked"].includes(reply) || ["engaged","opportunity","meeting","converted","won"].includes(deal)) return "warm_opportunity";
  if (stage === "parked") return "nurture";
  if (platform === "linkedin" && kind === "connection_accepted" && (!target || stage === "connection") && !target?.last_action_at) return "linkedin_connection_first_message";
  if (platform === "linkedin" && ["dm","comment","mention"].includes(kind)) return "linkedin_reply";
  if (platform === "linkedin") return "linkedin_followup";
  if (platform === "email") return "email_reply";
  return "social_reply";
}

export function messageTypeLabel(type: InteractionType) {
  return ({ linkedin_connection_first_message: "First message after connection", linkedin_followup: "LinkedIn follow-up", linkedin_reply: "Reply to a LinkedIn message", email_reply: "Email reply", social_reply: "Social reply", nurture: "Nurture / re-engagement", warm_opportunity: "Warm opportunity follow-up" } as Record<InteractionType,string>)[type];
}

export function objectiveFor(type: InteractionType, hasSignal: boolean) {
  if (type === "linkedin_connection_first_message") return "Acknowledge the connection and open a relevant, low-friction conversation without a hard pitch.";
  if (type === "linkedin_followup") return "Continue the relationship with a useful, specific follow-up based on the known context.";
  if (type === "linkedin_reply") return "Respond directly to what they said and move the conversation forward naturally.";
  if (type === "email_reply") return "Answer the email directly and agree a clear next step only where appropriate.";
  if (type === "social_reply") return "Respond helpfully to the comment in a natural public tone.";
  if (type === "nurture") return "Re-open the relationship gently with something relevant and useful.";
  return hasSignal ? "Build on the known interest and suggest a proportionate next step." : "Explore relevance conversationally before suggesting a meeting.";
}

export function profileFit(headline: string, company: string, profile: GenerationProfile) {
  const normal = (value: string) => value.toLowerCase().replace(/\b([a-z]{4,})s\b/g, "$1");
  const contact = normal(`${headline} ${company}`);
  const values = [profile.customers.audience, ...profile.offer.priorityServices, ...profile.customers.problems].filter(Boolean);
  const matches = values.filter(value => normal(String(value)).split(/[,;/|]/).some(term => term.trim().length >= 3 && contact.includes(term.trim())));
  return matches.map(String).slice(0, 3);
}

export function responseDraftRules(context: ResponseContactContext) {
  const common = ["Use only supplied facts; never invent background, dialogue, results or a buying signal.", `The desired next-message objective is: ${context.objective}`];
  if (context.interactionType === "linkedin_connection_first_message") return [...common, "This is the first outbound LinkedIn message after the person accepted a connection request; it is not a reply.", "Acknowledge the connection naturally, keep it short and human, avoid a hard pitch, and open a relevant low-friction conversation.", "Never imply prior dialogue and never say ‘glad to help’, ‘thanks for getting in touch’, or ‘following up on our conversation’." ];
  if (context.interactionType === "linkedin_followup") return [...common, "This is a later LinkedIn follow-up. Continue from the recorded relationship stage rather than writing a first-connection opener."];
  if (context.interactionType === "email_reply") return [...common, "Reply directly to the inbound email and preserve its thread context."];
  if (context.interactionType === "social_reply") return [...common, "Write a concise public response to the actual comment or reply."];
  if (context.interactionType === "nurture") return [...common, "This is a gentle re-engagement; do not pretend the relationship is new."];
  if (context.interactionType === "warm_opportunity") return [...common, "There is recorded interest or a commercial stage. Build on it without exaggerating what is known."];
  return [...common, "Respond directly to the latest LinkedIn message and respect the recorded history."];
}
