import { personalDistributionKind } from "@/lib/personalDistribution";
import type { PersonalSignalItem } from "@/lib/personalSignal";

export type PersonalOpportunity = PersonalSignalItem & { id: string; organisation_id: string; entity?: string | null; person?: string | null; company?: string | null; created_at?: string; suggested_action?: string | null };
export type OpportunityGroup = { item: PersonalOpportunity; members: PersonalOpportunity[]; category: string; blocked: boolean };
export const explicitTestRecord = (item: { metadata?: Record<string, unknown> }) => item.metadata?.test === true;
export function personalCategory(item: PersonalOpportunity) {
  if (item.source_engine !== "root_health_personal") return null;
  if (item.record_type === "partner_opportunity") return "partners";
  const kind = personalDistributionKind(item);
  return kind === "PUBLIC_RESPONSE" ? "people" : kind === "SOCIAL_CONTENT" || kind === "SEARCH_ASSET" ? "content" : "review";
}
function sourceKey(item: PersonalOpportunity) {
  const kind = personalDistributionKind(item);
  if (!["SOCIAL_CONTENT", "SEARCH_ASSET"].includes(kind || "")) return item.id;
  try {
    const url = new URL(item.source_url || "");
    if (url.protocol !== "https:") return item.id;
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
    url.searchParams.sort(); url.pathname = url.pathname.replace(/\/$/, "");
    // Exact source text/intent prevents unrelated discussions being combined.
    return JSON.stringify([item.organisation_id, kind, url.href, kind === "SOCIAL_CONTENT" ? item.metadata.original_post || item.metadata.post_text : item.signal]);
  } catch { return item.id; }
}
const rank: Record<string, number> = { new: 0, reviewing: 1, accepted: 2, nurture: 3, actioned: 4, engaged: 5, dismissed: 6, lost: 7, converted: 8 };
export function groupPersonalOpportunities(items: PersonalOpportunity[]): OpportunityGroup[] {
  const groups = new Map<string, PersonalOpportunity[]>();
  for (const item of items) {
    if (!personalCategory(item) || explicitTestRecord(item)) continue;
    const key = sourceKey(item); groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.values()].map(members => {
    const acted = members.filter(m => m.acquisition_item_events?.some(e => !["start_review", "accept"].includes(e.action)) || m.metadata.handoff);
    const candidates = acted.length ? acted : members;
    const item = [...candidates].sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0) || a.id.localeCompare(b.id))[0];
    const blocked = acted.length > 1 || members.some(m => ["dismissed", "lost", "converted"].includes(m.status) && m.status !== item.status);
    return { item, members, category: personalCategory(item)!, blocked };
  }).sort((a, b) => String(b.item.created_at || "").localeCompare(String(a.item.created_at || "")) || a.item.id.localeCompare(b.item.id));
}
export function opportunityProvenance(item: PersonalOpportunity) {
  let origin = "Personal discovery";
  try { origin = new URL(item.source_url || "").hostname.replace(/^www\./, ""); } catch { /* no guessed source */ }
  return { origin, reason: item.reason || item.signal || "Review the source evidence before choosing an action." };
}
