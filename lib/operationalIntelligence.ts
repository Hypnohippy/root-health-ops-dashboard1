import { workspaceActivityEvidence } from "@/lib/relationshipWorkspace";
import type { EvidenceEvent, Row } from "@/lib/relationshipWorkspace";
import type { LifecycleInput } from "@/lib/contactLifecycle";
export const STALE_REASON = "Relationship marked stale";
/** Explicit source links only: no name, company, domain or activity-address joins. */
export function proactiveRetention(org: string, input: LifecycleInput, workspaces: Row[], links: Row[]) {
    const owned = new Set(Object.entries(input).flatMap(([table, rows]) => rows.filter(r => r.organisation_id === org).map(r => `${table}:${r.id}`)));
    const stale = new Set(workspaces.filter(w => w.organisation_id === org && w.retention === "stale").map(w => w.id));
    return new Set(links.filter(l => l.organisation_id === org && stale.has(l.workspace_id) && owned.has(`${l.source_table}:${l.source_id}`)).map(l => `${l.source_table}:${l.source_id}`));
}
export function proactiveSuppression(refs: {
    table: string;
    id: string;
}[], stale: ReadonlySet<string>) {
    return refs.some(r => stale.has(`${r.table}:${r.id}`)) ? STALE_REASON : null;
}
/** Actual dates and recording dates stay separate; scheduled meetings are not past interactions. */
export function relationshipMemory(history: {
    dated: EvidenceEvent[];
    undated: EvidenceEvent[];
}, now = Date.now()) {
    const events = [...history.dated, ...history.undated];
    const actual = events.filter(e => e.at && Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) <= now && !e.kind.startsWith("Meeting scheduled"));
    const latest = (list: EvidenceEvent[], field: "at" | "recordedAt") => [...list].sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")) || a.id.localeCompare(b.id))[0] || null;
    const confirmed = events.filter(e => !e.id.startsWith("workspace:") && ["inbound", "outbound"].includes(e.direction || "") && e.at && Date.parse(e.at) <= now);
    return { latestRelationshipEvent: latest(actual, "at"), latestRecordedEvent: latest(events.filter(e => e.recordedAt), "recordedAt"), latestConfirmedInbound: latest(confirmed.filter(e => e.direction === "inbound"), "at"), latestConfirmedOutbound: latest(confirmed.filter(e => e.direction === "outbound"), "at"), manualActivity: events.filter(e => e.id.startsWith("workspace:")), meetingCallEvidence: events.filter(e => ["Calls", "Meetings"].includes(e.channel)), coverage: "Linked stored evidence only; mailbox completeness and independent delivery are not established." };
}
/** Search uses the same memory semantics, bounded to the displayed canonical sources.
 * An unresolved source never inherits a workspace spanning other identities. */
export function operationalSearchSummary(org: string, sources: {
    source: string;
    channel: string;
    actualAt: string | null;
    recordedAt: string | null;
}[], workspaces: Row[], links: Row[], events: Row[], canFounder: boolean) {
    const refs = new Set(sources.map(s => s.source));
    const ownedLinks = links.filter(l => l.organisation_id === org);
    const owned = workspaces.filter(w => w.organisation_id === org && ownedLinks.some(l => l.workspace_id === w.id) && ownedLinks.filter(l => l.workspace_id === w.id).every(l => refs.has(`${l.source_table}:${l.source_id}`)));
    const ids = new Set(owned.map(w => w.id));
    const manual = events.filter(e => e.organisation_id === org && ids.has(e.workspace_id) && (canFounder || !e.founder_only)).map(workspaceActivityEvidence);
    const sourceEvents = sources.map(s => ({ id: s.source, kind: "Source event", channel: s.channel, text: "Stored source evidence; open the source for details.", at: s.actualAt, recordedAt: s.recordedAt, source: s.source }));
    return { latestRelationshipEvent: relationshipMemory({ dated: [...manual, ...sourceEvents].filter(e => e.at), undated: [...manual, ...sourceEvents].filter(e => !e.at) }).latestRelationshipEvent, retention: owned.length === 1 ? String(owned[0].retention || "active") : null };
}
