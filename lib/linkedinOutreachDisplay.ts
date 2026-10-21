import { relationshipDiscoveryInventory, type DiscoveryContext } from "@/lib/relationshipDiscovery";
import { linkedInDestination, type LinkedInOutreachItem } from "@/lib/linkedinOutreach";
import type { LifecycleRow } from "@/lib/contactLifecycle";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const consensus = (values: unknown[]) => {
  const unique = new Map<string, string>();
  values.map(text).filter(Boolean).forEach(value => unique.set(value.normalize("NFKC").toLowerCase().replace(/\s+/g, " "), value));
  return unique.size === 1 ? [...unique.values()][0] : null;
};
/** Existing Truth partitions authorize display only. Never changes eligibility, context or receipts. */
export function enrichLinkedInOutreachDisplay(items: LinkedInOutreachItem[], context: DiscoveryContext) {
  const inventory = relationshipDiscoveryInventory(context);
  const safe = inventory.partition.input;
  return items.map(item => {
    const entry = inventory.entries.find(entry => entry.refs.some(ref => ref.table === item.table && ref.id === item.id));
    if (!entry || entry.result.ambiguity.state !== "established") return { ...item, role: null, company: null };
    const rows: LifecycleRow[] = entry.refs.flatMap(ref => ref.table === "founder_research_records" ? safe.founder.filter(row => row.id === ref.id) : (safe.lifecycle[ref.table as keyof typeof safe.lifecycle] || []).filter(row => row.id === ref.id));
    const fields = rows.map(row => ({ row, meta: { ...object(row.raw), ...object(object(row.raw).metadata), ...object(row.metadata) } }));
    const role = consensus(fields.map(({ row, meta }) => text(row.role_title) || text(meta.role_title) || text(meta.headline)));
    const company = consensus(fields.map(({ row, meta }) => text(row.company) || text(meta.company)));
    const recorded = linkedInDestination(rows);
    const destination = recorded && /\/messaging\//.test(recorded) ? recorded : item.destination;
    return { ...item, role, company, destination, destinationKind: /\/messaging\//.test(destination) ? "messaging" : "profile" };
  });
}
