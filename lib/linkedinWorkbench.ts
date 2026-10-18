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
