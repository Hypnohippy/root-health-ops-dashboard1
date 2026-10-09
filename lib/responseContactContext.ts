import type { GenerationProfile } from "@/lib/tenantGeneration";
import type { ResponseLifecycle } from "@/lib/responseLifecycle";
import type { SocialCommentOpportunity } from "@/lib/socialCommentOpportunity";

export type InteractionType = "linkedin_connection_first_message" | "linkedin_followup" | "linkedin_reply" | "email_reply" | "social_reply" | "nurture" | "warm_opportunity" | "first_message" | "followup" | "relationship_message" | "no_action";
export type ResponseContactContext = {
  socialOpportunity?: SocialCommentOpportunity;
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
  lifecycle?: ResponseLifecycle;
};

export const plainStage = (stage?: string | null) => ({ connection: "Ready for a first message", day3_followup: "Follow-up due today", day7_parity: "Explore parity and relevance", day14_insight: "Useful insight", day28_relevance: "Clearer relevance", day42_close: "Close the loop", parked: "Parked" } as Record<string,string>)[stage || ""] || null;
export const plainSource = (source?: string | null, kind?: string | null) => source === "linkedin_connection_network" ? "Suggested through a LinkedIn connection’s network" : kind === "connection_accepted" ? "LinkedIn connection acceptance email" : source === "root_health_b2b" ? "Existing B2B outreach" : source ? "Existing outreach activity" : "Response inbox";

export function interactionTypeFor(item: Record<string, unknown>, lifecycle?: ResponseLifecycle): InteractionType {
  const platform = String(item.platform || "");
  if (lifecycle) {
    if (!lifecycle.canDraft) return "no_action";
    if (lifecycle.actionItemId || lifecycle.currentStage === "needs_reply") return platform === "email" ? "email_reply" : platform === "linkedin" ? "linkedin_reply" : "social_reply";
    if (lifecycle.currentStage === "outreach_ready") return platform === "linkedin" ? "linkedin_connection_first_message" : "first_message";
    if (lifecycle.currentStage === "follow_up") return platform === "linkedin" ? "linkedin_followup" : "followup";
    if (lifecycle.currentStage === "nurture") return "nurture";
    return "relationship_message";
  }
  return "no_action";
}

export function messageTypeLabel(type: InteractionType) {
  return ({ linkedin_connection_first_message: "First message after connection", linkedin_followup: "LinkedIn follow-up", linkedin_reply: "Reply to a LinkedIn message", email_reply: "Email reply", social_reply: "Social reply", nurture: "Nurture / re-engagement", warm_opportunity: "Warm opportunity follow-up", first_message: "First message", followup: "Follow-up", relationship_message: "Continue the current conversation", no_action: "No message due" } as Record<InteractionType,string>)[type];
}

export function objectiveFor(type: InteractionType, hasSignal: boolean) {
  if (type === "no_action") return "Do not draft outreach. Respect the current lifecycle state.";
  if (type === "relationship_message") return "Continue the established relationship on explicit human request, respecting recorded replies and commercial progress. Do not draft an unanswered-outreach follow-up.";
  if (type === "followup") return "Prepare the next scheduled follow-up using recorded history; never introduce the contact as new.";
  if (type === "first_message") return "Open a relevant first conversation using only recorded facts.";
  if (type === "linkedin_connection_first_message") return "Say hello properly to an existing connection using verified context; save questions and calls to action for later stages.";
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
  const common = ["Use only supplied facts; never invent background, dialogue, results or a buying signal.", `The desired next-message objective is: ${context.objective}`,
    "The unified current lifecycle is authoritative. Original event types are historical evidence only. Never regress a contact's stage.",
    `Current lifecycle: ${context.lifecycle?.label || context.currentStage || "unknown"}. Next action: ${context.lifecycle?.nextAction || "none"}.`,
    "Never draft a first message after recorded contact, a no-response follow-up after a human reply, or outreach to a closed/lost contact."];
  if (context.interactionType === "no_action") return [...common, "No outreach drafting is permitted."];
  if (context.interactionType === "relationship_message") return [...common, "Respect their recorded reply and the advanced relationship. Do not assume they failed to respond or send a first-contact opener."];
  if (context.interactionType === "followup") return [...common, "Draft only the scheduled next-stage message; this is not a reply to the old event."];
  if (context.interactionType === "first_message") return [...common, "Open the first conversation without inventing prior dialogue."];
  if (context.interactionType === "linkedin_connection_first_message") return [...common,
    "This is the first outbound LinkedIn message after the person accepted a connection request; it is not a reply. Day 0 is a human hello, not discovery or a later-stage follow-up.",
    "Under 300 characters. Plain spoken English, warm, conversational and lightly informal: one person saying hello with a genuine reason for connecting, not networking copy. No emojis, pitch, product explanation, question, meeting/demo/call ask, fake enthusiasm, flattery or profile/resume recital.",
    "Prefer verified company, role/remit or recorded context when it fits naturally. Exact company names and role words are optional. Do not recite their profile or force a detail into the message.",
    "When contact-specific context is sparse, prefer natural sender-side context from the supplied organisation Growth Profile: briefly say the area you work around and, where supported, a tentative reason for overlap. Describe sender work only when supported by the supplied sender profile, not a service offering or benefits. Never invent sender experience, shared interests, familiarity or facts about the recipient. If neither side has verified context, use an honest brief hello without filler.",

    "Never use networking filler: thanks for connecting; just wanted to say hello; look forward to staying in touch; stay in touch; pleasure to connect; thanks for the connection; hope you're well. Do not pad the message with a polite stock closing.",
    "Never use: great to connect here; I'd love to hear your thoughts; what's top of mind; I noticed; I came across; I love what you're doing; current wellbeing challenges; caught my attention; most important in your remit. No marketing language or HR jargon.",
    "Never imply prior dialogue and never say ‘glad to help’, ‘thanks for getting in touch’, or ‘following up on our conversation’."
  ];
  if (context.interactionType === "linkedin_followup") return [...common, "This is a later LinkedIn follow-up. Continue from the recorded relationship stage rather than writing a first-connection opener."];
  if (context.interactionType === "email_reply") return [...common, "Reply directly to the inbound email and preserve its thread context."];
  if (context.interactionType === "social_reply") return [...common, "Write a concise public response to the actual comment or reply."];
  if (context.interactionType === "nurture") return [...common, "This is a gentle re-engagement; do not pretend the relationship is new."];
  if (context.interactionType === "warm_opportunity") return [...common, "There is recorded interest or a commercial stage. Build on it without exaggerating what is known."];
  return [...common, "Respond directly to the latest LinkedIn message and respect the recorded history."];
}

// Quality gate for Day 0 only; later lifecycle stages have different intent.
export function safeLinkedInFirstMessage(draft: string, _context?: { company?: string | null; role?: string | null }) {
  const text = draft.trim();
  if (!text || text.length >= 300 || /[?]|\p{Extended_Pictographic}/u.test(text)) return false;
  const wording = text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  if (/\b(?:thanks for connecting|just wanted to say hello|look forward to staying in touch|stay in touch|pleasure to connect|thanks for the connection|hope (?:you're|you are) well)\b/.test(wording)) return false;
  if (/great to connect|love to hear your thoughts|top of mind|i noticed|i came across|love what you.re doing|current wellbeing challenges|caught my attention|most important in your remit|\b(pitch|demo|meeting|call|our product|our platform|our services|we help|connect with you|connection request)\b/i.test(text)) return false;
  return true;
}
