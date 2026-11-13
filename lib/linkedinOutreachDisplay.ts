import type { DiscoveryContext } from "@/lib/relationshipDiscovery";
import { identityDecisionPartition, truthWithIdentityDecisions } from "@/lib/relationshipIdentityReconciliation";
import { ledgerDecisions } from "@/lib/relationshipIdentityLedger";
import { visibleTruthInput, type TruthInput } from "@/lib/relationshipTruth";
import { relationshipIdentityPresentation } from "@/lib/relationshipIdentityPresentation";
import { projectRelationships } from "@/lib/relationshipWorkspace";
import { linkedInDestination, type LinkedInOutreachItem } from "@/lib/linkedinOutreach";
import { linkedInRecipientIdentity, professionalRoleConsensus } from "@/lib/linkedinRecipientContext";
import type { LifecycleRow } from "@/lib/contactLifecycle";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const consensus = (values: unknown[]) => {
  const unique = new Map<string, string>();
  values.map(text).filter(Boolean).forEach(value => unique.set(value.normalize("NFKC").toLowerCase().replace(/\s+/g, " "), value));
  return unique.size === 1 ? [...unique.values()][0] : null;
};
/** TEMPORARY, opt-in forensic data. Never populate raw records outside the scoped trace path. */
export type LinkedInOutreachDisplayTrace = {
  contactId: string;
  actionRecord: { table: string; id: string };
  path: string;
  identityGroup: { group: number | null; ambiguous: boolean; entityKind: string | null };
  anchor: null | { table: string; id: string; found: boolean; canonicalIdentity: string | null; roleCandidates: { field: string; value: string }[]; companyCandidates: { field: string; value: string }[]; categoryCandidates: { field: string; value: string }[]; roleAccepted: string | null; companyAccepted: string | null; categoryAccepted: string | null; rejection: string | null };
  output: { role: string | null; company: string | null; contextRole: string | null; contextCompany: string | null; recipientCategory: string | null };
};
// Fresh Day 0 must receive the professional fields this same projection shows.
// Unsafe agreed values remain intact for the existing Day 0 guard to reject.
function professionalContext(item: LinkedInOutreachItem, role: string | null, company: string | null, recipientCategory: string | null) {
  const reason = role ? item.reason : item.reason?.replace("; recorded role matches people, wellbeing or health leadership", "");
  return item.stage === "connection" && item.mode === "fresh"
    ? { ...item, role, company, reason, context: { ...item.context, role, company, recipientCategory, whyRelevant: reason } }
    : { ...item, role, company };
}
function queuedProfessionalContext(item: LinkedInOutreachItem) {
  return professionalContext(item, item.context.role ?? null, item.context.company ?? null, item.context.recipientCategory ?? null);
}
/**
 * When the relationship projection is ambiguous, only facts on this exact
 * LinkedIn source row may survive. Do not carry queue context across a
 * keep-separate boundary or use neighbouring records to resolve ambiguity.
 */
function anchoredProfessionalContext(item: LinkedInOutreachItem, context: DiscoveryContext, trace: (anchor: LinkedInOutreachDisplayTrace["anchor"], result: LinkedInOutreachItem, rejection?: string | null) => void) {
  const anchor = context.input.lifecycle[item.table]?.find(row => row.id === item.id);
  if (!anchor) {
    const result = professionalContext(item, null, null, null);
    trace({ table: item.table, id: item.id, found: false, canonicalIdentity: null, roleCandidates: [], companyCandidates: [], categoryCandidates: [], roleAccepted: null, companyAccepted: null, categoryAccepted: null, rejection: "action record absent from display-enrichment lifecycle snapshot" }, result, "action_record_absent_from_display_snapshot");
    return result;
  }
  const identity = linkedInRecipientIdentity(anchor);
  if (!identity) {
    const result = professionalContext(item, null, null, null);
    trace({ table: item.table, id: item.id, found: true, canonicalIdentity: null, roleCandidates: [], companyCandidates: [], categoryCandidates: [], roleAccepted: null, companyAccepted: null, categoryAccepted: null, rejection: "action record has missing or multiple LinkedIn identities" }, result, "action_record_identity_not_unambiguous");
    return result;
  }
  const raw = object(anchor.raw), rawMeta = object(raw.metadata), meta = object(anchor.metadata);
  const roleCandidates = [["role_title", anchor.role_title], ["raw.role_title", raw.role_title], ["raw.headline", raw.headline], ["raw.metadata.role_title", rawMeta.role_title], ["raw.metadata.headline", rawMeta.headline], ["metadata.role_title", meta.role_title], ["metadata.headline", meta.headline]].flatMap(([field, value]) => text(value) ? [{ field: String(field), value: text(value)! }] : []);
  const companyCandidates = [["company", anchor.company], ["raw.company", raw.company], ["raw.metadata.company", rawMeta.company], ["metadata.company", meta.company]].flatMap(([field, value]) => text(value) ? [{ field: String(field), value: text(value)! }] : []);
  const categoryCandidates = [["recipient_category", anchor.recipient_category], ["raw.recipient_category", raw.recipient_category], ["raw.metadata.recipient_category", rawMeta.recipient_category], ["metadata.recipient_category", meta.recipient_category]].flatMap(([field, value]) => text(value) ? [{ field: String(field), value: text(value)! }] : []);
  const role = roleCandidates.length ? professionalRoleConsensus(roleCandidates.map(candidate => candidate.value)) : null;
  const company = companyCandidates.length ? consensus(companyCandidates.map(candidate => candidate.value)) : null;
  const recipientCategory = categoryCandidates.length ? consensus(categoryCandidates.map(candidate => candidate.value)) : null;
  const result = professionalContext(item, role, company, recipientCategory);
  const rejection = roleCandidates.length && !role ? "conflicting role candidates on the selected action record" : companyCandidates.length && !company ? "conflicting company candidates on the selected action record" : !roleCandidates.length && !companyCandidates.length && !categoryCandidates.length ? "selected action record contains no professional facts" : null;
  trace({ table: item.table, id: item.id, found: true, canonicalIdentity: identity, roleCandidates, companyCandidates, categoryCandidates, roleAccepted: role, companyAccepted: company, categoryAccepted: recipientCategory, rejection }, result, rejection);
  return result;
}
/** Existing Truth partitions authorize presentation/Day 0 facts, never eligibility or receipts. */
export function enrichLinkedInOutreachDisplay(items: LinkedInOutreachItem[], context: DiscoveryContext, trace?: LinkedInOutreachDisplayTrace[]) {
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
    const ambiguous = group !== undefined && ambiguousGroups.has(group);
    const emit = (path: string, result: LinkedInOutreachItem, anchor: LinkedInOutreachDisplayTrace["anchor"] = null, entityKind: string | null = null) => {
      trace?.push({ contactId: item.contactId, actionRecord: { table: item.table, id: item.id }, path, identityGroup: { group: group ?? null, ambiguous, entityKind }, anchor,
        output: { role: result.role ?? null, company: result.company ?? null, contextRole: result.context.role ?? null, contextCompany: result.context.company ?? null, recipientCategory: result.context.recipientCategory ?? null } });
      return result;
    };
    // A missing display partition supplies no contradictory evidence. Keep the
    // exact-identity context already resolved by the outreach queue in that case.
    if (group === undefined) return emit("queue_context_retained_no_display_partition", queuedProfessionalContext(item));
    if (ambiguousGroups.has(group)) return anchoredProfessionalContext(item, context, (anchor, result) => { emit("ambiguous_identity_group_anchored_to_action_record", result, anchor); });
    const included = new Set(partition.groups[group]);
    const subset: TruthInput = { ...safe, lifecycle: Object.fromEntries(tables.map(table => [table, safe.lifecycle[table].filter(row => included.has(table + ":" + row.id))])) as TruthInput["lifecycle"], founder: safe.founder.filter(row => included.has("founder_research_records:" + row.id)) };
    const truth = truthWithIdentityDecisions(subset, { table: item.table, id: item.id }, context.policy, decisions, { ...partition, input: subset });
    const presentation = relationshipIdentityPresentation(truth);
    if (presentation.entityShape.entity_kind === "ambiguous") return anchoredProfessionalContext(item, context, (anchor, result) => { emit("ambiguous_entity_shape_anchored_to_action_record", result, anchor, presentation.entityShape.entity_kind); });
    if (presentation.name.disputed) {
      // A name disagreement does not erase facts independently sourced from
      // one acceptance plus acquisition evidence on the selected exact LinkedIn
      // identity. Multiple competing acceptances remain fully fail-closed.
      const anchor = subset.lifecycle[item.table].find(row => row.id === item.id);
      const identity = anchor ? linkedInRecipientIdentity(anchor) : null;
      const exactAcceptances = subset.lifecycle.inbox_items.filter(row => row.kind === "connection_accepted" && linkedInRecipientIdentity(row) === identity);
      const exactAcquisitions = subset.lifecycle.acquisition_items.filter(row => linkedInRecipientIdentity(row) === identity);
      if (identity && exactAcceptances.length === 1 && exactAcquisitions.length > 0) {
        const exactRows = Object.values(subset.lifecycle).flat().filter(row => linkedInRecipientIdentity(row) === identity);
        const roleValues = exactRows.flatMap(row => {
          const raw = object(row.raw), rawMeta = object(raw.metadata), meta = object(row.metadata);
          return [row.role_title, raw.role_title, raw.headline, rawMeta.role_title, rawMeta.headline, meta.role_title, meta.headline];
        }).map(text).filter(Boolean);
        const role = roleValues.length ? professionalRoleConsensus([...roleValues, item.context.role]) : item.context.role ?? null;
        return emit("disputed_name_exact_profile_consensus", professionalContext(item, role, null, null), null, presentation.entityShape.entity_kind);
      }
      return emit("disputed_name_fail_closed", professionalContext(item, null, null, null), null, presentation.entityShape.entity_kind);
    }
    const rows: LifecycleRow[] = [...Object.values(subset.lifecycle).flat(), ...subset.founder];
    const fields = rows.map(row => ({ row, raw: object(row.raw), rawMeta: object(object(row.raw).metadata), meta: object(row.metadata) }));
    // Compare every value candidate from each exact-identity source. Field
    // precedence must not hide conflicting role/headline/company evidence.
    const roleValues = fields.flatMap(({ row, raw, rawMeta, meta }) => [row.role_title, raw.role_title, raw.headline, rawMeta.role_title, rawMeta.headline, meta.role_title, meta.headline]).map(text).filter(Boolean);
    const companyValues = fields.flatMap(({ row, raw, rawMeta, meta }) => [row.company, raw.company, rawMeta.company, meta.company]).map(text).filter(Boolean);
    const categoryValues = fields.flatMap(({ row, raw, rawMeta, meta }) => [row.recipient_category, raw.recipient_category, rawMeta.recipient_category, meta.recipient_category]).map(text).filter(Boolean);
    const role = roleValues.length ? professionalRoleConsensus([...roleValues, item.context.role]) : item.context.role ?? null;
    const company = companyValues.length ? consensus([...companyValues, item.context.company]) : item.context.company ?? null;
    const recipientCategory = categoryValues.length ? consensus([...categoryValues, item.context.recipientCategory]) : item.context.recipientCategory ?? null;
    const recorded = linkedInDestination(rows);
    const destination = recorded && /\/messaging\//.test(recorded) ? recorded : item.destination;
    return emit("relationship_truth_projection", { ...professionalContext(item, role, company, recipientCategory), destination, destinationKind: /\/messaging\//.test(destination) ? "messaging" : "profile" }, null, presentation.entityShape.entity_kind);
  });
}
