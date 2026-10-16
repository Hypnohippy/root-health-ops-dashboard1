import { getRelationship, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { responseLifecycleMap } from "@/lib/responseLifecycle";
import { verifiedEmails } from "@/lib/founderMemory";
import { boundAdvisorEvidence, type AdvisorEvidence, type AdvisorPacket } from "@/lib/rootCoachAdvisor";
import { exactEmail, gmailId } from "@/lib/rootCoachMailboxPolicy";
import type { RelationshipMailboxIdentity } from "@/lib/rootCoachMailbox.server";

export async function advisorRelationshipContext(tenant: RelationshipTenant, locator: string): Promise<{ packet: AdvisorPacket; mailbox: RelationshipMailboxIdentity }> {
  // This resolver enforces tenant, source/workspace identity and Founder boundaries. Opening never creates a workspace.
  const state = await getRelationship(tenant, locator);
  const input = await readLifecycleInput(tenant.organisationId);
  const refs = state.relationship.refs;
  const rows = refs.flatMap(ref => ref.table === "founder_research_records" ? [] : input[ref.table].filter(r => r.organisation_id === tenant.organisationId && r.id === ref.id));
  const lifecycle = responseLifecycleMap(tenant.organisationId, input);
  const emails = new Set<string>(), threadIds = new Set<string>();
  for (const row of rows) {
    if (row.platform === "email") {
      const email = exactEmail(row.sender_email); if (email) emails.add(email);
      for (const id of [row.email_thread_id, row.email_sent_thread_id]) if (gmailId(id)) threadIds.add(id);
    }
    // Discovery guesses and arbitrary notes are not authoritative mailbox identities.
    const meta = row.metadata as Record<string, unknown> | null;
    if (row.email_verified === true || meta?.email_verification === "PASSED") {
      const email = exactEmail(row.email || meta?.email); if (email) emails.add(email);
    }
  }
  for (const f of state.founder) for (const email of verifiedEmails(f)) emails.add(email);
  const history = [...state.history.dated, ...state.history.undated];
  const evidence: AdvisorEvidence[] = history.map(e => ({ id: e.id, origin: "ops_stored", kind: e.kind, channel: e.channel, text: e.text, at: e.at, recordedAt: e.recordedAt, source: e.source, ...(e.direction ? { direction: e.direction } : {}) }));
  // Preserve evidence type: user notes are assertions, research is research, notification is never message text.
  for (const row of rows) for (const field of ["company", "role_title", "reason", "signal", "evidence", "notes", "reply_notes", "next_step"]) if (typeof row[field] === "string" && row[field]) evidence.push({ id: `record:${row.id}:${field}`, origin: "ops_stored", kind: `Recorded ${field}`, channel: "Ops", text: String(row[field]), at: null, recordedAt: null, source: `Existing relationship source ${row.id}` });
  for (const task of state.tasks) evidence.push({ id: `task:${task.id}`, origin: "ops_stored", kind: "Recorded task", channel: "Ops", text: JSON.stringify({ task: task.task, status: task.status, due_at: task.due_at }), at: null, recordedAt: String(task.updated_at || task.created_at || "") || null, source: "Permission-filtered relationship task" });
  for (const f of state.founder) {
    const snapshot = f.research_snapshot as Record<string, unknown>;
    evidence.push({ id: `founder:${f.id}`, origin: "ops_stored", kind: "Founder research — recorded assessment, not verified message", channel: "Founder", text: JSON.stringify(Object.fromEntries(["name", "strategicFit", "audienceFit", "risks", "questions", "recommendedApproach", "currentSignals", "sourceUrls"].map(k => [k, snapshot?.[k]]))), at: null, recordedAt: String(f.updated_at || "") || null, source: "Authorised linked Founder research" });
  }
  const lifecycleEvidence: AdvisorEvidence = { id: "lifecycle:current", origin: "ops_stored", kind: "Authoritative lifecycle projection", channel: "Ops", text: JSON.stringify({ stage: state.relationship.stage, nextAction: state.relationship.nextAction, nextDueDate: state.relationship.nextDueDate }), at: null, recordedAt: new Date().toISOString(), source: "Existing lifecycle projection; Advisor cannot change it" };
  const bounded = boundAdvisorEvidence(evidence, 79, 47000);
  const limitations = ["Only legitimately associated stored evidence is included. Mailbox freshness is not established unless an explicit live lookup succeeds.", "Snapshots without message dates are undated; recorded time is not message time.", "Research, notes and manual activity are attributed records, not independent verification."];
  if (bounded.partial) limitations.push("History is partial: the evidence budget omitted or shortened entries. Commitments outside this packet cannot be ruled out.");
  const hasInbound = [...state.conversation.dated, ...state.conversation.undated].some(e => e.direction === "inbound" && e.text.trim());
  const canDraft = hasInbound && rows.some(row => { const s = lifecycle.get(row.id); return s?.canDraft && ["needs_reply", "engaged", "meeting", "nurture"].includes(s.currentStage); });
  if (!canDraft) limitations.push("Reply drafting is unavailable for the current recorded state or because actual inbound message text is missing. Notification-only evidence cannot support a reply draft. Use the existing workflow for accepted-connection first messages.");
  return { packet: { organisationId: tenant.organisationId, locator, name: state.relationship.name, stage: state.relationship.stage, nextAction: state.relationship.nextAction, canDraft, evidence: [lifecycleEvidence, ...bounded.evidence], limitations, asOf: new Date().toISOString() }, mailbox: { organisationId: tenant.organisationId, relationshipLocator: locator, emails: [...emails], threadIds: [...threadIds] } };
}
