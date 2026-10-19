export const dismissalReasons = ["Promotional solicitation", "Spam / irrelevant", "Not an opportunity", "Other"] as const;

export function isSocialResponse(item: { platform?: unknown; kind?: unknown }) {
  return ["instagram", "facebook", "threads", "reddit", "tiktok", "linkedin"].includes(String(item.platform)) &&
    ["comment", "dm", "mention", "reaction"].includes(String(item.kind));
}

export function canDismissResponse(item: { platform?: unknown; kind?: unknown; responseState?: unknown; response_state?: unknown }) {
  return isSocialResponse(item) &&
    !["no_reply_needed", "converted", "closed_or_lost"].includes(String(item.responseState || item.response_state));
}

/** Remove acknowledged rows only, selecting the next visible row without waiting for reload. */
export function afterResponseCleanup<T extends { id: string }>(items: T[], visible: T[], selectedId: string | null, ids: string[]) {
  const removed = new Set(ids);
  const remaining = items.filter(item => !removed.has(item.id));
  const index = visible.findIndex(item => item.id === selectedId);
  const next = removed.has(selectedId || "")
    ? visible.slice(index + 1).find(item => !removed.has(item.id)) || visible.find(item => !removed.has(item.id))
    : visible.find(item => item.id === selectedId);
  return { items: remaining, selectedId: next?.id || null };
}
