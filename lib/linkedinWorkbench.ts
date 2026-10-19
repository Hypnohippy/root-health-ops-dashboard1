/** UI selection only; no contact/lifecycle mutations. */
import type { LinkedInOutreachItem } from "@/lib/linkedinOutreach";

/** A draft belongs to the exact recipient and outreach state that produced it. */
export function outreachDraftKey(item: LinkedInOutreachItem) {
  return JSON.stringify([item.contactId, item.stage, item.mode, item.connectedAt, item.context, item.previousOutbound]);
}

export function outreachDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London" }) : "Not recorded";
}

export function selectedBatchId(items: { contactId: string }[], preferred: string | null) {
  return items.some(i => i.contactId === preferred) ? preferred : items[0]?.contactId || null;
}
export function removeBatchContact<T extends { contactId: string }>(items: T[], id: string) {
  const index = items.findIndex(i => i.contactId === id);
  const remaining = items.filter(i => i.contactId !== id);
  return { items: remaining, selectedId: remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.contactId || null };
}

export class DraftStateChangedError extends Error {}

/** Only draft generation may recover once from a stale queue; never send/action requests. */
export async function generateOutreachDraft<Q extends { organisationId: string; revision: string; view?: string; items: LinkedInOutreachItem[]; recoveryItem?: LinkedInOutreachItem | null }>(
  item: LinkedInOutreachItem, queue: Q, request: (input: string, init?: RequestInit) => Promise<Response>, signal: AbortSignal, canRecover: () => boolean,
): Promise<{ message: string; refreshedQueue: Q | null }> {
  async function attempt(revision: string) {
    const response = await request("/api/growth/linkedin-console", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: queue.organisationId, table: item.table, id: item.id, revision, action: "generate" }) });
    const data = await response.json();
    if (!response.ok) console.debug("LinkedIn draft generation rejected", JSON.stringify({ contactId: item.contactId, table: item.table, id: item.id, mode: item.mode, stage: item.stage, revision, status: response.status, body: data }));
    return { response, data };
  }
  let result = await attempt(queue.revision), refreshedQueue: Q | null = null;
  if (result.response.status === 409 && result.data.code === "STALE_QUEUE_REVISION" && canRecover() && !signal.aborted) {
    const query = new URLSearchParams({ view: queue.view || "all", organisationId: queue.organisationId, recoveryContactId: item.contactId });
    const response = await request(`/api/growth/linkedin-console?${query}`, { signal });
    const fresh: Q & { error?: string } = await response.json();
    if (!response.ok) throw Error(fresh.error || "Unable to refresh the queue for this draft.");
    console.debug("LinkedIn draft queue refreshed", JSON.stringify({ previousRevision: queue.revision, revision: fresh.revision, status: response.status }));
    const resolved = fresh.recoveryItem || fresh.items?.find(candidate => candidate.contactId === item.contactId);
    if (!canRecover() || signal.aborted) throw Error("Draft recovery was cancelled.");
    if (fresh.organisationId !== queue.organisationId || typeof fresh.revision !== "string" || !resolved || resolved.table !== item.table || resolved.id !== item.id || outreachDraftKey(resolved) !== outreachDraftKey(item)) {
      throw new DraftStateChangedError("This contact is no longer eligible in the same outreach state. Reload the queue before generating.");
    }
    refreshedQueue = fresh;
    result = await attempt(fresh.revision); // One retry only, even if this revision also changes.
  }
  if (result.data.code === "CONTACT_NOT_ELIGIBLE") throw new DraftStateChangedError(result.data.error);
  if (!result.response.ok) throw Error(result.data.error || "Draft generation failed. Retry or type your message below.");
  if (typeof result.data.message !== "string" || !result.data.message.trim()) throw Error("No draft was returned. Retry or type your message below.");
  return { message: result.data.message, refreshedQueue };
}
