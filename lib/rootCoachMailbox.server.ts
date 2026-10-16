import { readAppsScriptMailbox } from "@/lib/rootCoachAppsScriptMailbox.server";
import { exactEmail, type MailboxLookup, type MailboxResult } from "@/lib/rootCoachMailboxPolicy";
export type RelationshipMailboxIdentity = { organisationId: string; relationshipLocator: string; emails: string[]; threadIds: string[] };
export type MailboxProvider = (request: MailboxLookup) => Promise<MailboxResult>;
export function mailboxConfiguration() {
  const url = process.env.ROOT_ADVISOR_MAILBOX_URL || "", key = process.env.ROOT_ADVISOR_MAILBOX_SIGNING_KEY || "", keyId = process.env.ROOT_ADVISOR_MAILBOX_KEY_ID || "", organisationId = process.env.ROOT_ADVISOR_MAILBOX_ORGANISATION_ID || "", account = exactEmail(process.env.ROOT_ADVISOR_MAILBOX_ACCOUNT), operatorId = process.env.ROOT_ADVISOR_MAILBOX_OPERATOR_ID || "";
  const ownAddresses = (process.env.ROOT_ADVISOR_MAILBOX_OWN_ADDRESSES || "").split(",").map(v => exactEmail(v.trim())).filter((v): v is string => !!v);
  if (!url || key.length < 32 || !keyId || !organisationId || !account || !operatorId || !ownAddresses.includes(account)) return null;
  return { url, key, keyId, organisationId, account, operatorId, ownAddresses };
}
export async function lookupRelationshipMailbox(identity: RelationshipMailboxIdentity, userId: string, selectedThreadId?: string) {
  const config = mailboxConfiguration();
  if (!config) throw Error("Live email checking is not activated. I can advise on stored Ops evidence only; current mailbox replies have not been checked.");
  if (config.organisationId !== identity.organisationId || config.operatorId !== userId) throw Error("Live mailbox access is not authorised for this account.");
  const emails = identity.emails.filter(e => !config.ownAddresses.includes(e));
  // Known thread access still needs a verified participant to prevent unrelated mail in a thread reaching Advisor.
  if (!emails.length) throw Error("This relationship needs a verified email association before live email can be checked.");
  const base: MailboxLookup = { ...identity, emails, account: config.account, operation: selectedThreadId ? "thread" : "candidates", ...(selectedThreadId ? { selectedThreadId } : {}) };
  const provider: MailboxProvider = request => readAppsScriptMailbox(request, config);
  const candidates = await provider({ ...base, operation: "candidates", selectedThreadId: undefined });
  if (selectedThreadId && !candidates.candidates.some(c => c.threadId === selectedThreadId)) throw Error("The selected thread is not a current verified relationship match.");
  if (!selectedThreadId && candidates.candidates.length !== 1) return candidates;
  return provider({ ...base, operation: "thread", selectedThreadId: selectedThreadId || candidates.candidates[0].threadId });
}
