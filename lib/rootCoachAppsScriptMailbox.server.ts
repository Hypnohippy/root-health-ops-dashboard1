import { createHmac, randomUUID } from "node:crypto";
import { validateMailboxLookup, participantMatch, gmailId, type MailboxLookup, type MailboxResult } from "@/lib/rootCoachMailboxPolicy";
export function signMailboxRequest(lookup: MailboxLookup, key: string, keyId: string, now = Date.now(), nonce = randomUUID()) {
  validateMailboxLookup(lookup);
  const payload = JSON.stringify({ version: 1, purpose: "root_advisor_mailbox", issuer: "root_ops", audience: "root_mailbox", keyId, issuedAt: now, expiresAt: now + 30000, nonce, lookup });
  return { payload, signature: createHmac("sha256", key).update(payload).digest("hex") };
}
export async function readAppsScriptMailbox(lookup: MailboxLookup, config: { url: string; key: string; keyId: string; ownAddresses: string[] }): Promise<MailboxResult> {
  validateMailboxLookup(lookup);
  const url = new URL(config.url);
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname) || url.search || config.key.length < 32) throw Error("Live mailbox lookup is not configured.");
  const envelope = signMailboxRequest(lookup, config.key, config.keyId);
  const nonce = JSON.parse(envelope.payload).nonce;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope), redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) });
  let resultResponse = response;
  // ContentService redirects the response to a one-time Google content URL. Never forward the signed body there.
  if ([302, 303].includes(response.status)) {
    const location = new URL(response.headers.get("location") || "");
    if (location.protocol !== "https:" || location.hostname !== "script.googleusercontent.com" || location.username || location.password || location.port) throw Error("Mailbox response destination rejected.");
    resultResponse = await fetch(location, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  }
  if (!resultResponse.ok) throw Error("Live mailbox lookup is unavailable. Stored evidence remains available.");
  const reader = resultResponse.body?.getReader(); if (!reader) throw Error("Mailbox response unavailable.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 300000) { await reader.cancel(); throw Error("Mailbox evidence exceeds the safe limit."); } chunks.push(value); } } finally { reader.releaseLock(); }
  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (raw.ok !== true || raw.nonce !== nonce || raw.operation !== lookup.operation || raw.organisationId !== lookup.organisationId || raw.account !== lookup.account || raw.relationshipLocator !== lookup.relationshipLocator || !Array.isArray(raw.messages) || !Array.isArray(raw.candidates) || raw.messages.length > 20 || raw.candidates.length > 5 || typeof raw.partial !== "boolean" || !Number.isFinite(Date.parse(raw.retrievedAt))) throw Error("Mailbox evidence could not be validated.");
  const ids = new Set<string>();
  for (const m of raw.messages) {
    if (!gmailId(m.gmailMessageId) || !gmailId(m.gmailThreadId) || ids.has(m.gmailMessageId) || !Array.isArray(m.recipientEmails) || typeof m.text !== "string" || m.text.length > 12000 || !Number.isFinite(Date.parse(m.sentAt)) || !["inbound", "outbound"].includes(m.direction) || !participantMatch(m, lookup.emails, config.ownAddresses) || lookup.operation !== "thread" || m.gmailThreadId !== lookup.selectedThreadId) throw Error("Mailbox participant or thread mismatch.");
    ids.add(m.gmailMessageId);
  }
  for (const c of raw.candidates) if (!gmailId(c.threadId) || typeof c.subject !== "string" || c.subject.length > 1000 || !Number.isFinite(Date.parse(c.latestAt)) || lookup.threadIds.length && !lookup.threadIds.includes(c.threadId)) throw Error("Mailbox candidate mismatch.");
  return { messages: raw.messages, candidates: raw.candidates, partial: raw.partial, retrievedAt: raw.retrievedAt };
}
