/** UI selection only; no contact/lifecycle mutations. */
export function selectedBatchId(items: { contactId: string }[], preferred: string | null) {
  return items.some(i => i.contactId === preferred) ? preferred : items[0]?.contactId || null;
}
export function removeBatchContact<T extends { contactId: string }>(items: T[], id: string) {
  const index = items.findIndex(i => i.contactId === id);
  const remaining = items.filter(i => i.contactId !== id);
  return { items: remaining, selectedId: remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.contactId || null };
}
