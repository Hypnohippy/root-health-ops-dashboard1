export const LIVE_MAILBOX_LABEL = "Live mailbox evidence — not saved or linked in Ops.";
export type MailboxLookup = { organisationId: string; account: string; relationshipLocator: string; operation: "candidates" | "thread"; emails: string[]; threadIds: string[]; selectedThreadId?: string };
export type MailboxMessage = { gmailMessageId: string; gmailThreadId: string; senderEmail: string; recipientEmails: string[]; text: string; sentAt: string; direction: "inbound" | "outbound" };
export type MailboxResult = { messages: MailboxMessage[]; candidates: { threadId: string; subject: string; latestAt: string }[]; partial: boolean; retrievedAt: string };
export const exactEmail = (v: unknown): string | null => typeof v === "string" && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.trim()) ? v.trim().toLowerCase() : null;
export const gmailId = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{1,64}$/i.test(v);
export function validateMailboxLookup(input: MailboxLookup) {
  if (Object.keys(input).some(k => !["organisationId", "account", "relationshipLocator", "operation", "emails", "threadIds", "selectedThreadId"].includes(k))) throw Error("Mailbox queries and arbitrary operations are not accepted.");
  if (!input.organisationId || !exactEmail(input.account) || !/^(inbox|target|acquisition|founder|workspace)_[a-f0-9-]{36}$/i.test(input.relationshipLocator) || !["candidates", "thread"].includes(input.operation)) throw Error("Mailbox binding unavailable.");
  if (input.emails.length > 5 || input.threadIds.length > 5 || input.emails.some(e => exactEmail(e) !== e) || input.threadIds.some(t => !gmailId(t)) || !input.emails.length && !input.threadIds.length) throw Error("No verified email or authorised Gmail thread is linked to this relationship.");
  if (input.operation === "thread" && (!gmailId(input.selectedThreadId) || !input.emails.length && !input.threadIds.includes(input.selectedThreadId!))) throw Error("Thread selection is not authorised.");
}
export function participantMatch(message: MailboxMessage, emails: string[], own: string[]) {
  const sender = exactEmail(message.senderEmail), recipients = message.recipientEmails.map(exactEmail);
  if (!sender || recipients.some(e => !e) || !recipients.length) return false;
  const all = [sender, ...recipients] as string[];
  return all.every(e => emails.includes(e) || own.includes(e)) && all.some(e => emails.includes(e)) && all.some(e => own.includes(e)) && (message.direction === "inbound" ? emails.includes(sender) : own.includes(sender));
}
