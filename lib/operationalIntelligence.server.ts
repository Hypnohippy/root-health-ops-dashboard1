import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { getRelationship, relationshipContext, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { relationshipDiscoveryInventory } from "@/lib/relationshipDiscovery";
import { readTenantHistory } from "@/lib/opsSearch.server";
import type { IdentityLedgerRow } from "@/lib/relationshipIdentityLedger";
import { parseRelationshipLocator, sourcePrefixes, projectRelationships, chronologicalEvidence, type SourceRef } from "@/lib/relationshipWorkspace";
import { proactiveRetention, proactiveSuppression, relationshipMemory } from "@/lib/operationalIntelligence";
import { linkedInOutreachQueue } from "@/lib/linkedinOutreach";
import { readOutreachSelfIdentity } from "@/lib/outreachSelfIdentity.server";
import type { TruthRow } from "@/lib/relationshipTruth";
/** Read orchestration only. Identity partition scopes existing lifecycle/history readers;
 * shadow Truth action recommendations never authorize an operational action. */
export async function readOperationalIntelligence(tenant: RelationshipTenant, locator: string) {
    const ctx = await relationshipContext(tenant), org = tenant.organisationId;
    const ledger = await readTenantHistory("relationship_identity_decisions", org, "*", ["sequence"]) as IdentityLedgerRow[];
    const inventory = relationshipDiscoveryInventory({ input: { lifecycle: ctx.input, founder: ctx.founder as TruthRow[], workspaces: ctx.workspaces as TruthRow[], links: ctx.links as TruthRow[], founderActivities: [], emailMessages: [], linkedinMessages: [], activities: [], tasks: [], acquisitionEvents: [], responseEvents: [] }, policy: { organisationId: org, founderAllowed: ctx.canFounder, asOf: new Date().toISOString() }, ledger });
    const parsed = parseRelationshipLocator(locator);
    const requested: SourceRef[] = parsed.prefix === "workspace" ? ctx.links.filter(l => l.workspace_id === parsed.id).map(l => ({ table: l.source_table as SourceRef["table"], id: String(l.source_id) })) : [{ table: sourcePrefixes[parsed.prefix as keyof typeof sourcePrefixes], id: parsed.id }];
    const entries = inventory.entries.filter(e => e.refs.some(r => requested.some(s => r.table === s.table && r.id === s.id)));
    if (entries.length !== 1 || !requested.length)
        throw Error("Relationship identity requires review. Choose an exact source.");
    const identity = entries[0], established = identity.result.ambiguity.state === "established" || identity.result.reconciliationStatus === "confirmed";
    if (parsed.prefix === "workspace" && (!established || !requested.every(s => identity.refs.some(r => r.table === s.table && r.id === s.id))))
        throw Error("Relationship identity requires review. Choose an exact source.");
    const refs = established ? identity.refs : requested;
    const contains = (table: unknown, id: unknown) => refs.some(r => r.table === table && r.id === id);
    const input = { inbox_items: ctx.input.inbox_items.filter(r => contains("inbox_items", r.id)), growth_targets: ctx.input.growth_targets.filter(r => contains("growth_targets", r.id)), acquisition_items: ctx.input.acquisition_items.filter(r => contains("acquisition_items", r.id)) };
    const founder = ctx.founder.filter(r => contains("founder_research_records", r.id));
    // A workspace spanning unresolved/foreign canonical sources cannot widen the read.
    const workspaces = ctx.workspaces.filter(w => { const links = ctx.links.filter(l => l.workspace_id === w.id); return links.length && links.every(l => contains(l.source_table, l.source_id)); });
    const links = ctx.links.filter(l => workspaces.some(w => w.id === l.workspace_id));
    const scoped = { ...ctx, input, founder, workspaces, links, values: ctx.values.filter(v => workspaces.some(w => w.id === v.workspace_id)), items: projectRelationships(org, input, founder) };
    const data = await getRelationship(tenant, locator, false, scoped);
    const sourceEvents = input.inbox_items.filter(r => r.platform === "email" && typeof r.text === "string" && r.text.trim() && ![...data.history.dated, ...data.history.undated].some(e => e.text === r.text)).map(r => ({ id: `source:${r.id}`, kind: "Stored inbound source; quoted text is not a separate outbound", channel: "Email", direction: "inbound", text: String(r.text), at: typeof r.created_at_platform === "string" ? r.created_at_platform : null, recordedAt: typeof r.inserted_at === "string" ? r.inserted_at : null, source: `inbox_items:${r.id}` }));
    data.history = chronologicalEvidence([...data.history.dated, ...data.history.undated, ...sourceEvents]);
    data.conversation = chronologicalEvidence([...data.conversation.dated, ...data.conversation.undated, ...sourceEvents]);
    const stale = proactiveRetention(org, ctx.input, ctx.workspaces, ctx.links), suppressionReason = proactiveSuppression(refs, stale);
    const self = await readOutreachSelfIdentity(org, tenant.userId);
    const queue = linkedInOutreachQueue(org, ctx.input, Date.now(), "all", [], Infinity, self, stale);
    const eligible = queue.items.filter(i => refs.some(r => r.table === i.table && r.id === i.id));
    const memory = relationshipMemory(data.history);
    const rawInput = await readLifecycleInput(org, false);
    const rawCadence = rawInput.growth_targets.filter(r => contains("growth_targets", r.id)).map(r => ({ source: { table: "growth_targets", id: r.id }, stage: r.stage, lastActionAt: r.last_action_at }));
    return { ...data, intelligence: { identity: { ...identity.result, sourceRefs: refs, workspaceRefs: workspaces.map(w => String(w.id)), humanReviewRequired: !established }, state: { lifecycleStage: data.relationship.stage, lifecycleLastAction: data.relationship.lastAction, retention: data.workspace?.retention || (suppressionReason ? "stale" : "active"), owner: data.workspace?.owner_user_id || data.relationship.owner, actionSource: data.relationship.operationalHref }, ...memory, notes: data.notes, tasks: data.tasks, actionability: { rawCadence, projectedDueDate: data.relationship.nextDueDate, recordedDueReached: !!data.relationship.nextDueDate && Date.parse(data.relationship.nextDueDate) <= Date.now(), currentlyDue: !suppressionReason && eligible.length > 0 && !!data.relationship.nextDueDate && Date.parse(data.relationship.nextDueDate) <= Date.now(), linkedInEligible: eligible.length > 0, suppressionReasons: suppressionReason ? [suppressionReason] : queue.audit.filter(a => Array.isArray(a.records) && a.records.some((r: {
                    table: string;
                    id: string;
                }) => contains(r.table, r.id))).map(a => String(a.eligibility)), otherGuardedAction: data.relationship.stage === "needs_reply" ? "Review inbound in Responses; existing reply governor applies" : "No additional action authorization established" }, uncertainty: [...identity.result.ambiguity.reasons, "Only linked stored conversations are included; quoted text is not a separate send receipt.", ...(data.history.undated.length ? ["Some relationship evidence has no actual event date."] : [])], provenance: refs.map(r => `${r.table}:${r.id}`) } };
}
