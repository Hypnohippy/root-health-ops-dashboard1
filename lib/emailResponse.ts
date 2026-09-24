export const emailClassifications = ["human_positive", "human_neutral", "human_negative", "question", "redirect", "auto_acknowledgement", "waiting_for_human", "closed_or_lost", "out_of_office", "bounce"] as const;
export const emailResponseStates = ["needs_reply", "waiting_for_human", "no_reply_needed", "follow_up", "nurture", "closed_or_lost", "engaged", "converted"] as const;
export type EmailClassification = typeof emailClassifications[number];

const has = (text: string, pattern: RegExp) => pattern.test(text);
export function classifyEmailResponse(subject: string, body: string) {
  const text = `${subject}\n${body}`.toLowerCase();
  let classification: EmailClassification;
  if (has(text, /delivery (status notification|failed)|undeliverable|mailbox (is )?full|address not found|message blocked|couldn['’]t be delivered/)) classification = "bounce";
  else if (has(text, /out of (the )?office|automatic reply:|auto-reply|away from (the )?office|on annual leave|returning on/)) classification = "out_of_office";
  else if (has(text, /tender (is |has )?(now )?closed|procurement (is )?closed|opportunity has closed|not (be )?progressing|unsuccessful|not interested|decline your/)) classification = "closed_or_lost";
  else if (has(text, /e-?sourcing portal|procurement portal|redirect(?:ed)? you|contact (?:our |the )?(?:procurement|commissioning|hr) team|submit (?:this|your).{0,30}(?:portal|website)/)) classification = "redirect";
  else if (has(text, /one of our team will be in touch|we (?:have )?received your (?:email|enquiry|message)|thank you for (?:contacting|your email|your enquiry)|this is an automated|automated acknowledgement|case (?:has been )?created|ticket (?:has been )?(?:raised|created)/)) classification = "auto_acknowledgement";
  else if (has(text, /forwarded (?:this|your|it) (?:internally|to)|passed (?:this|it|your email) (?:to|on)|waiting for .{2,40}(?:to|who|before)|colleague will (?:review|respond|come back)|with (?:julia|the relevant team)/)) classification = "waiting_for_human";
  else if (has(text, /\?|could you|can you|would you|please (?:send|confirm|explain|provide)/)) classification = "question";
  else if (has(text, /sounds (?:good|useful|interesting)|interested|let['’]s (?:talk|book|arrange)|happy to (?:chat|meet)|yes,|please send|book a call/)) classification = "human_positive";
  else if (has(text, /no thank|not right for us|not a fit|remove me|unsubscribe/)) classification = "human_negative";
  else classification = "human_neutral";
  const responseState = classification === "auto_acknowledgement" || classification === "waiting_for_human" ? "waiting_for_human"
    : classification === "closed_or_lost" || classification === "bounce" ? "closed_or_lost"
    : classification === "out_of_office" || classification === "redirect" ? "follow_up" : "needs_reply";
  return { classification, responseState, needsHumanReply: responseState === "needs_reply" };
}

export function normalizeEmailClassification(subject: string, body: string, supplied?: unknown) {
  void supplied;
  const detected = classifyEmailResponse(subject, body);
  // Upstream labels are evidence only: Ops applies one consistent classifier and
  // cannot inherit HUMAN_REPLY_REQUIRED mistakes from acknowledgements.
  return detected;
}

const emailActions = ["mark_no_reply", "set_follow_up", "nurture", "closed_lost", "engaged", "converted"] as const;
const transitions: Record<typeof emailActions[number], string[]> = {
  mark_no_reply: ["needs_reply", "waiting_for_human", "follow_up", "nurture"],
  set_follow_up: ["needs_reply", "waiting_for_human", "no_reply_needed", "follow_up", "nurture", "engaged"],
  nurture: ["needs_reply", "waiting_for_human", "follow_up", "engaged"],
  closed_lost: ["needs_reply", "waiting_for_human", "no_reply_needed", "follow_up", "nurture", "engaged"],
  engaged: ["needs_reply", "waiting_for_human", "follow_up", "nurture"],
  converted: ["needs_reply", "follow_up", "nurture", "engaged"],
};
export function planEmailResponseAction(currentState: string, action: string) {
  if (!emailActions.includes(action as typeof emailActions[number])) throw new Error("Unsupported email action.");
  if (!transitions[action as typeof emailActions[number]].includes(currentState)) throw new Error("Email action is not allowed from the current state.");
  const states: Record<string,string> = { mark_no_reply:"no_reply_needed", set_follow_up:"follow_up", nurture:"nurture", closed_lost:"closed_or_lost", engaged:"engaged", converted:"converted" };
  return { newState: states[action], status: action === "engaged" || action === "converted" ? "replied" : "archived" };
}
