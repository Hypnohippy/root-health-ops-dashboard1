import type { DiscoveryContext } from "@/lib/relationshipDiscovery";
import { identityDecisionPartition, truthWithIdentityDecisions } from "@/lib/relationshipIdentityReconciliation";
import { ledgerDecisions } from "@/lib/relationshipIdentityLedger";
import { visibleTruthInput, type TruthInput } from "@/lib/relationshipTruth";
import { relationshipIdentityPresentation } from "@/lib/relationshipIdentityPresentation";
import { projectRelationships } from "@/lib/relationshipWorkspace";
import { linkedInDestination, type LinkedInOutreachItem } from "@/lib/linkedinOutreach";
import type { LifecycleRow } from "@/lib/contactLifecycle";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const consensus = (values: unknown[]) => {
  const unique = new Map<string, string>();
  values.map(text).filter(Boolean).forEach(value => unique.set(value.normalize("NFKC").toLowerCase().replace(/\s+/g, " "), value));
  return unique.size === 1 ? [...unique.values()][0] : null;
};
// Fresh Day 0 must receive the professional fields this same projection shows.
// Unsafe agreed values remain intact for the existing Day 0 guard to reject.
function professionalContext(item: LinkedInOutreachItem, role: string | null, company: string | null, recipientCategory: string | null) {
  const reason = role ? item.reason : item.reason?.replace("; recorded role matches people, wellbeing or health leadership", "");
  return item.stage === "connection" && item.mode === "fresh"
    ? { ...item, role, company, reason, context: { ...item.context, role, company, recipientCategory, whyRelevant: reason } }
    : { ...item, role, company };
}
/** Existing Truth partitions authorize presentation/Day 0 facts, never eligibility or receipts. */
export function enrichLinkedInOutreachDisplay(items: LinkedInOutreachItem[], context: DiscoveryContext) {
  const visible = visibleTruthInput(context.input, context.policy);
  const tables = ["inbox_items", "growth_targets", "acquisition_items"] as const;
  const keys = new Set([...tables.flatMap(table => visible.lifecycle[table].map(row => table + ":" + row.id)), ...visible.founder.map(row => "founder_research_records:" + row.id)]);
  const decisions = ledgerDecisions(context.ledger, context.policy).filter(d => keys.has(d.sourceRefA.table + ":" + d.sourceRefA.id) && keys.has(d.sourceRefB.table + ":" + d.sourceRefB.id));
  const partition = identityDecisionPartition(visible, context.policy, decisions), safe = partition.input;
  const current = projectRelationships(context.policy.organisationId, visible.lifecycle, visible.founder);
  const ambiguousGroups = new Set<number>();
  for (const relationship of current) {
    const groups = new Set(relationship.refs.map(ref => partition.byRef.get(ref.table + ":" + ref.id)).filter((id): id is number => id !== undefined));
    if (groups.size > 1) groups.forEach(id => ambiguousGroups.add(id));
  }
  return items.map(item => {
    const group = partition.byRef.get(item.table + ":" + item.id);
    if (group === undefined || ambiguousGroups.has(group)) return professionalContext(item, null, null, null);
    const included = new Set(partition.groups[group]);
    const subset: TruthInput = { ...safe, lifecycle: Object.fromEntries(tables.map(table => [table, safe.lifecycle[table].filter(row => included.has(table + ":" + row.id))])) as TruthInput["lifecycle"], founder: safe.founder.filter(row => included.has("founder_research_records:" + row.id)) };
    const truth = truthWithIdentityDecisions(subset, { table: item.table, id: item.id }, context.policy, decisions, { ...partition, input: subset });
    const presentation = relationshipIdentityPresentation(truth);
    if (presentation.name.disputed || presentation.entityShape.entity_kind === "ambiguous") return professionalContext(item, null, null, null);
    const rows: LifecycleRow[] = [...Object.values(subset.lifecycle).flat(), ...subset.founder];
    const fields = rows.map(row => ({ row, meta: { ...object(row.raw), ...object(object(row.raw).metadata), ...object(row.metadata) } }));
    const role = consensus(fields.map(({ row, meta }) => text(row.role_title) || text(meta.role_title) || text(meta.headline)));
    const company = consensus(fields.map(({ row, meta }) => text(row.company) || text(meta.company)));
    const recipientCategory = consensus(fields.map(({ meta }) => meta.recipient_category));
    const recorded = linkedInDestination(rows);
    const destination = recorded && /\/messaging\//.test(recorded) ? recorded : item.destination;
    return { ...professionalContext(item, role, company, recipientCategory), destination, destinationKind: /\/messaging\//.test(destination) ? "messaging" : "profile" };
  });
}
