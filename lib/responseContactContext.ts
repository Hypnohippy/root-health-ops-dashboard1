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
  cadenceStage?: string | null;
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
  if (type === "linkedin_connection_first_message") return "Acknowledge the accepted connection, explain grounded relevance and open a low-pressure conversation with one natural question.";
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
    "This is the first outbound LinkedIn message after the person accepted a connection request; it is not a reply. Never imply prior dialogue.",
    "Use the saved person's actual first name. Acknowledge the connection naturally; thanks for connecting is allowed for a recent acceptance. For an older connection acknowledge it honestly without implying it just happened.",
    "Write a complete human opener, usually 60-110 words: connection acknowledgement, one grounded recipient detail where available, a brief explanation of possible relevance from the sender's Growth Profile, then exactly one natural low-pressure question. Do not compress this into a one-line hello.",
    "Use their recorded role, company or known context naturally. Do not invent a role or company when sparse; explain sender-side relevance tentatively and ask about their perspective without assuming they have a problem.",
    "Explain what the sender actually does only from this organisation's Growth Profile. A generic sentence such as I work with workplace wellbeing must never be the entire substance. Do not recite a CV or force marketing language.",
    "No hard pitch, booking link, meeting/demo/call ask, emoji, exaggerated claims or flattery. A natural question is required, not prohibited.",
    "Never say thanks for getting in touch, glad to help, following up, as we discussed, or anything implying an earlier conversation or inbound enquiry."
  ];
  if (context.interactionType === "linkedin_followup") {
    const stage = context.cadenceStage || context.currentStage;
    return [...common,
      "This is a later LinkedIn follow-up, not a reply or first-connection opener. Use the actual previous outbound text and never invent a response or prior discussion. Drafting hierarchy: interaction type, relationship stage, contact context, history, organisation Growth Profile, then objective.",
      ...(stage === "day3_followup" || stage === "day3_dm" ? ["Follow-up 1 / Day 3: reference the existing connection and actual earlier message naturally. Add one relevant thought or angle grounded in contact context and the Growth Profile, then ask one low-pressure question. Do not merely repeat the first message or chase a meeting."] :
        stage === "day7_parity" || stage === "day10_insight" ? ["Follow-up 2 / Day 7: shorter and more direct than the first message. Introduce one concrete angle from this sender's Growth Profile, such as early stress identification, organisational insight or practical employee support only if actually supported by that profile. Offer a brief conversation conditionally if relevant; no hard pitch or assumed interest."] :
        ["Follow the actual supplied cadence-stage intent. If the stage is unknown, do not guess a follow-up number or replay missed stages."])
    ];
  }
  if (context.interactionType === "email_reply") return [...common, "Reply directly to the inbound email and preserve its thread context."];
  if (context.interactionType === "social_reply") return [...common, "Write a concise public response to the actual comment or reply."];
  if (context.interactionType === "nurture") return [...common, "This is a gentle re-engagement; do not pretend the relationship is new."];
  if (context.interactionType === "warm_opportunity") return [...common, "There is recorded interest or a commercial stage. Build on it without exaggerating what is known."];
  return [...common, "Respond directly to the latest LinkedIn message and respect the recorded history."];
}

// Structure gate for accepted-connection openers; reply/follow-up rules remain distinct.
export function safeLinkedInFirstMessage(draft: string, context?: { name?: string | null; company?: string | null; role?: string | null }) {
  const text = draft.trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 45 || words.length > 140 || text.length > 1100 || (text.match(/\?/g) || []).length !== 1 || /\p{Extended_Pictographic}/u.test(text)) return false;
  const wording = text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  if (!/\bconnect(?:ing|ed|ion)?\b/.test(wording)) return false;
  if (/thanks for getting in touch|glad to help|following up|as we discussed|our (?:earlier|previous) conversation|book (?:a|the)|booking link|\b(?:demo|pitch)\b|(?:let's|can we|could we) (?:meet|have a call)|(?:schedule|arrange) (?:a |the )?(?:meeting|call)/i.test(wording)) return false;
  const first = context?.name?.trim().split(/\s+/)[0]?.toLowerCase();
  if (first && !wording.startsWith(`hi ${first},`) && !wording.startsWith(`hello ${first},`)) return false;
  const terms = `${context?.company || ""} ${context?.role || ""}`.toLowerCase().match(/[a-z]{4,}/g)?.filter(term => !["with", "from", "their", "company", "director", "chartered", "fcipd", "cipd"].includes(term)) || [];
  if (terms.length && !terms.some(term => wording.includes(term))) return false;
  return true;
}
