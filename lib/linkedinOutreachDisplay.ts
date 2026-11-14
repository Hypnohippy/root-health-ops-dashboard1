import type { DiscoveryContext } from "@/lib/relationshipDiscovery";
import { identityDecisionPartition, truthWithIdentityDecisions } from "@/lib/relationshipIdentityReconciliation";
import { ledgerDecisions } from "@/lib/relationshipIdentityLedger";
import { visibleTruthInput, type TruthInput } from "@/lib/relationshipTruth";
import { relationshipIdentityPresentation } from "@/lib/relationshipIdentityPresentation";
import { projectRelationships } from "@/lib/relationshipWorkspace";
import { linkedInDestination, type LinkedInOutreachItem, type ProfessionalContextStatus } from "@/lib/linkedinOutreach";
import { linkedInRecipientIdentity, professionalRoleConsensus } from "@/lib/linkedinRecipientContext";
import type { LifecycleRow } from "@/lib/contactLifecycle";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const consensus = (values: unknown[]) => {
  const unique = new Map<string, string>();
  values.map(text).filter(Boolean).forEach(value => unique.set(value.normalize("NFKC").toLowerCase().replace(/\s+/g, " "), value));
  return unique.size === 1 ? [...unique.values()][0] : null;
};
const hasContext = (role: string | null | undefined, company: string | null | undefined, category: string | null | undefined) => !!(role || company || category);
const queuedHasContext = (item: LinkedInOutreachItem) => hasContext(item.context.role, item.context.company, item.context.recipientCategory);

function professionalContext(item: LinkedInOutreachItem, role: string | null, company: string | null, recipientCategory: string | null, status?: ProfessionalContextStatus) {
  const reason = role ? item.reason : item.reason?.replace("; recorded role matches people, wellbeing or health leadership", "");
  const professionalContextStatus = item.stage === "connection" && item.mode === "fresh"
    ? status || { state: hasContext(role, company, recipientCategory) ? "available" as const : "unavailable" as const }
    : item.professionalContextStatus;
  return item.stage === "connection" && item.mode === "fresh"
    ? { ...item, role, company, reason, professionalContextStatus, context: { ...item.context, role, company, recipientCategory, whyRelevant: reason } }
    : { ...item, role, company };
}
function queuedProfessionalContext(item: LinkedInOutreachItem) {
  return professionalContext(item, item.context.role ?? null, item.context.company ?? null, item.context.recipientCategory ?? null);
}
function factCandidates(row: LifecycleRow) {
  const raw = object(row.raw), rawMeta = object(raw.metadata), meta = object(row.metadata);
  return {
    role: [row.role_title, raw.role_title, raw.headline, rawMeta.role_title, rawMeta.headline, meta.role_title, meta.headline].map(text).filter(Boolean),
    company: [row.company, raw.company, rawMeta.company, meta.company].map(text).filter(Boolean),
    category: [row.recipient_category, raw.recipient_category, rawMeta.recipient_category, meta.recipient_category].map(text).filter(Boolean),
  };
}
function factStatus(item: LinkedInOutreachItem, role: string | null, company: string | null, category: string | null, evidencePresent: boolean, unresolvedConflict = false, discrepancy = false): ProfessionalContextStatus {
  if (hasContext(role, company, category)) return { state: "available" };
  if (evidencePresent || unresolvedConflict || queuedHasContext(item)) return { state: "withheld", ...(discrepancy ? { discrepancy: true } : {}) };
  return { state: "unavailable" };
}
/** Only exact canonical-identity evidence can anchor display when names disagree. */
function disputedNameProfessionalContext(item: LinkedInOutreachItem, subset: TruthInput, identity: string | null) {
  if (!identity) return professionalContext(item, null, null, null, factStatus(item, null, null, null, false, true));
  const exactRows = Object.values(subset.lifecycle).flat().filter(row => linkedInRecipientIdentity(row) === identity);
  const exactAcceptances = subset.lifecycle.inbox_items.filter(row => row.kind === "connection_accepted" && linkedInRecipientIdentity(row) === identity);
  // The accepted record itself is the evidence anchor. A name dispute alone does
  // not invalidate facts owned by an exact-profile acceptance. Other exact-profile
  // rows only participate in consensus; unrelated/similar-name rows are excluded.
  if (!exactAcceptances.length || item.mode !== "fresh" || item.stage !== "connection") {
    return professionalContext(item, null, null, null, factStatus(item, null, null, null, false, true));
  }
  const roleValues = exactRows.flatMap(row => factCandidates(row).role);
  const companyValues = exactRows.flatMap(row => factCandidates(row).company);
  const categoryValues = exactRows.flatMap(row => factCandidates(row).category);
  const role = roleValues.length ? professionalRoleConsensus([...roleValues, item.context.role]) : null;
  const company = companyValues.length ? consensus([...companyValues, item.context.company]) : null;
  const recipientCategory = categoryValues.length ? consensus([...categoryValues, item.context.recipientCategory]) : null;
  const conflict = roleValues.length > 0 && !role || companyValues.length > 0 && !company || categoryValues.length > 0 && !recipientCategory;
  const resultStatus = factStatus(item, role, company, recipientCategory, roleValues.length + companyValues.length + categoryValues.length > 0, !!conflict);
  // If an exact acceptance exists separately from the action record, the same
  // exact-identity rule applies; it does not authorize facts from other identities.
  return professionalContext(item, role, company, recipientCategory, resultStatus);
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
    if (group === undefined) return queuedProfessionalContext(item);
    if (ambiguousGroups.has(group)) {
      const anchor = context.input.lifecycle[item.table]?.find(row => row.id === item.id);
      const identity = anchor ? linkedInRecipientIdentity(anchor) : null;
      const roleValues = anchor ? factCandidates(anchor).role : [];
      const companyValues = anchor ? factCandidates(anchor).company : [];
      const categoryValues = anchor ? factCandidates(anchor).category : [];
      const role = roleValues.length ? professionalRoleConsensus(roleValues) : null;
      const company = companyValues.length ? consensus(companyValues) : null;
      const category = categoryValues.length ? consensus(categoryValues) : null;
      const exact = !!anchor && !!identity && anchor.organisation_id === context.policy.organisationId;
      const conflict = roleValues.length > 0 && !role || companyValues.length > 0 && !company || categoryValues.length > 0 && !category;
      const status = exact ? factStatus(item, role, company, category, roleValues.length + companyValues.length + categoryValues.length > 0, !!conflict)
        : factStatus(item, null, null, null, false, true);
      return professionalContext(item, exact ? role : null, exact ? company : null, exact ? category : null, status);
    }
    const included = new Set(partition.groups[group]);
    const subset: TruthInput = { ...safe, lifecycle: Object.fromEntries(tables.map(table => [table, safe.lifecycle[table].filter(row => included.has(table + ":" + row.id))])) as TruthInput["lifecycle"], founder: safe.founder.filter(row => included.has("founder_research_records:" + row.id)) };
    const truth = truthWithIdentityDecisions(subset, { table: item.table, id: item.id }, context.policy, decisions, { ...partition, input: subset });
    const presentation = relationshipIdentityPresentation(truth);
    if (presentation.entityShape.entity_kind === "ambiguous") {
      const anchor = context.input.lifecycle[item.table]?.find(row => row.id === item.id);
      const identity = anchor ? linkedInRecipientIdentity(anchor) : null;
      const roleValues = anchor ? factCandidates(anchor).role : [];
      const companyValues = anchor ? factCandidates(anchor).company : [];
      const categoryValues = anchor ? factCandidates(anchor).category : [];
      const role = roleValues.length ? professionalRoleConsensus(roleValues) : null;
      const company = companyValues.length ? consensus(companyValues) : null;
      const category = categoryValues.length ? consensus(categoryValues) : null;
      const exact = !!anchor && !!identity && anchor.organisation_id === context.policy.organisationId;
      const conflict = roleValues.length > 0 && !role || companyValues.length > 0 && !company || categoryValues.length > 0 && !category;
      const status = exact ? factStatus(item, role, company, category, roleValues.length + companyValues.length + categoryValues.length > 0, !!conflict)
        : factStatus(item, null, null, null, false, true);
      return professionalContext(item, exact ? role : null, exact ? company : null, exact ? category : null, status);
    }
    if (presentation.name.disputed) {
      const anchor = subset.lifecycle[item.table].find(row => row.id === item.id);
      const identity = anchor ? linkedInRecipientIdentity(anchor) : null;
      return disputedNameProfessionalContext(item, subset, identity);
    }
    const rows: LifecycleRow[] = [...Object.values(subset.lifecycle).flat(), ...subset.founder];
    const fields = rows.map(row => ({ row, ...factCandidates(row) }));
    // Compare every value candidate from each exact-identity source. Field precedence
    // must not hide conflicting role/headline/company evidence.
    const roleValues = fields.flatMap(({ role }) => role);
    const companyValues = fields.flatMap(({ company }) => company);
    const categoryValues = fields.flatMap(({ category }) => category);
    const role = roleValues.length ? professionalRoleConsensus([...roleValues, item.context.role]) : item.context.role ?? null;
    const company = companyValues.length ? consensus([...companyValues, item.context.company]) : item.context.company ?? null;
    const recipientCategory = categoryValues.length ? consensus([...categoryValues, item.context.recipientCategory]) : item.context.recipientCategory ?? null;
    const recorded = linkedInDestination(rows);
    const destination = recorded && /\/messaging\//.test(recorded) ? recorded : item.destination;
    const conflict = roleValues.length > 0 && !role || companyValues.length > 0 && !company || categoryValues.length > 0 && !recipientCategory;
    const unexpectedLoss = queuedHasContext(item) && !hasContext(role, company, recipientCategory) && !conflict;
    const status = factStatus(item, role, company, recipientCategory, roleValues.length + companyValues.length + categoryValues.length > 0, !!conflict, unexpectedLoss);
    return { ...professionalContext(item, role, company, recipientCategory, status), destination, destinationKind: /\/messaging\//.test(destination) ? "messaging" : "profile" };
  });
}
