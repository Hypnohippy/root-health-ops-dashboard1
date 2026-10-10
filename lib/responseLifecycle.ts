import { buildContactLifecycle, type LifecycleInput, type LifecycleRow } from "@/lib/contactLifecycle";

type Contact = ReturnType<typeof buildContactLifecycle>[number];
const closed = new Set(["converted", "lost", "dismissed"]);
const labels: Record<string, string> = { new: "New opportunity", reviewing: "Under review", outreach_ready: "First message opportunity", actioned: "Action recorded", waiting: "Waiting", needs_reply: "Needs reply", engaged: "Engaged", meeting: "Meeting", nurture: "Nurture", converted: "Converted", lost: "Closed / lost", dismissed: "Closed / dismissed", no_reply_needed: "No action due", unknown: "State unavailable" };

/** Presentation and action eligibility only; relationship state comes from Phase 4L. */
export function presentResponseLifecycle(relationship: Contact, item: LifecycleRow, threadContact?: Contact) {
  // CRM identity stays contact-level. Email reply ownership and history are
  // derived from the exact Gmail thread, never another thread from this sender.
  const relationshipOverride = ["meeting", "converted", "lost", "nurture", "dismissed"].includes(relationship.currentStage) && relationship.actionRecord.table !== "inbox_items";
  const contact = threadContact ? { ...threadContact, contactId: relationship.contactId,
    ...(relationshipOverride ? { currentStage: relationship.currentStage } : {}) } : relationship;
  const handledHistory = item.platform === "email" && contact.records.some(ref => ref.table === "inbox_items" && ref.id === item.id && ref.handledEmailHistory);
  const obsoleteThreadReply = !!threadContact && contact.nextAction === "reply" && contact.actionRecord.id !== item.id;
  const history = handledHistory || obsoleteThreadReply;
  const stage = history && !["meeting", "converted", "lost", "nurture", "dismissed"].includes(contact.currentStage) ? "no_reply_needed" : contact.currentStage;
  const due = contact.followUpStatus === "due";
  const actionItemId = contact.nextAction === "reply" && contact.actionRecord.table === "inbox_items" ? contact.actionRecord.id : null;
  const currentChannel = !contact.channel || contact.channel === item.platform;
  const supportedChannel = ["email", "linkedin", "facebook", "instagram", "threads", "reddit", "tiktok"].includes(String(item.platform));
  const correctReply = !actionItemId || actionItemId === item.id;
  const engineAction = contact.actionRecord.table === "acquisition_items" && contact.engineEvidence?.some(e => e.sourceEngine === contact.source);
  const ownsAction = contact.actionRecord.table === "inbox_items" && contact.actionRecord.id === item.id;
  const deliveryIssue = ownsAction && item.platform === "email" && item.email_classification === "bounce" && stage === "lost";
  const redirect = ownsAction && item.platform === "email" && item.email_classification === "redirect" && ["follow_up", "needs_reply"].includes(stage);
  const canDraft = !history && !engineAction && !deliveryIssue && !redirect && supportedChannel && currentChannel && correctReply && !closed.has(stage) && ["outreach_ready", "needs_reply", "follow_up", "engaged", "meeting", "nurture"].includes(stage);
  const humanActionRequired = !history && (!threadContact || ownsAction) && (deliveryIssue || redirect || stage === "needs_reply" || stage === "outreach_ready" || (stage === "follow_up" && due) || stage === "meeting");
  const onRequest = canDraft && !actionItemId && (["engaged", "meeting", "nurture"].includes(stage) || (stage === "follow_up" && !due));
  const nextAction = history ? null : deliveryIssue ? "Review delivery failure and contact details" : redirect ? "Review referral or redirect instructions" : stage === "follow_up" ? (due ? "Follow up" : "Wait for scheduled follow-up")
    : actionItemId ? "Respond to the current reply" : stage === "outreach_ready" ? "Prepare first message"
    : contact.nextAction?.replaceAll("_", " ") || null;
  return { contactId: contact.contactId, currentStage: stage,
    label: deliveryIssue ? "Delivery issue / blocked" : redirect ? "Referral / redirect needs review" : stage === "follow_up" ? (due ? "Follow-up due" : "Contacted / follow-up scheduled") : stage === "waiting" && contact.lastAction?.action === "marked_contacted" ? "Contacted / waiting" : labels[stage] || stage,
    lastAction: contact.lastAction, nextAction, nextDueDate: history ? null : contact.nextDueDate, channel: contact.channel,
    humanActionRequired, canDraft, draftOnRequest: onRequest, actionItemId,
    canMarkContacted: canDraft && stage === "outreach_ready" && item.platform === "linkedin" && item.kind === "connection_accepted" && item.status !== "replied" && !item.contacted_at && !item.last_replied_at,
    blockedReason: canDraft ? null : handledHistory ? "This inbound email was handled by a successful reply in the same Gmail thread." : obsoleteThreadReply ? "Open the current reply in this Gmail thread; this event is history." : engineAction ? "Review the current action in the source engine; this snapshot does not authorize a message." : deliveryIssue ? "Resolve the delivery issue before further outreach." : redirect ? "Review the intended recipient or destination before drafting." : closed.has(stage) ? "This contact is closed; outreach drafting is unavailable."
      : !supportedChannel ? "Message drafting is not available for this channel."
      : !correctReply ? "Open the current reply to respond; this event is history."
      : !currentChannel ? `The next action belongs to ${contact.channel}; this event is history.`
      : "No message is due for the current lifecycle state.",
  };
}
export type ResponseLifecycle = ReturnType<typeof presentResponseLifecycle>;

export function responseLifecycleMap(organisationId: string, input: LifecycleInput, now = Date.now()) {
  const contacts = buildContactLifecycle(organisationId, input, now);
  const threadContacts = buildContactLifecycle(organisationId, { acquisition_items: [], growth_targets: [],
    inbox_items: input.inbox_items.filter(row => row.platform === "email" && typeof row.email_thread_id === "string" && row.email_thread_id.trim()),
  }, now, true);
  const threadByItem = new Map(threadContacts.flatMap(contact => contact.records.map(ref => [ref.id, contact] as const)));
  const rows = new Map(input.inbox_items.filter(r => r.organisation_id === organisationId).map(r => [r.id, r]));
  const result = new Map<string, ResponseLifecycle>();
  for (const contact of contacts) for (const ref of contact.records) {
    const item = ref.table === "inbox_items" ? rows.get(ref.id) : null;
    if (item) result.set(item.id, presentResponseLifecycle(contact, item, threadByItem.get(item.id)));
  }
  return result;
}
