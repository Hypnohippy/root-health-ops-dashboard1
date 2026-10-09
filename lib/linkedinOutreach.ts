import { externalSentAt, sendReceipts, firstSendEvidence } from "@/lib/linkedinSendEvidence";
import { isOutreachSelfContact, emptyOutreachSelfIdentity, type OutreachSelfIdentity } from "@/lib/outreachSelfIdentity";
import { buildContactLifecycle, lifecycleLinkedInIdentity, type LifecycleInput, type LifecycleRow } from "@/lib/contactLifecycle";
import { planManualCompletion } from "@/lib/operationalGovernor";
import { outreachStages } from "@/lib/growthOutreach";
import { objectiveFor, type ResponseContactContext } from "@/lib/responseContactContext";

export const FRESH_CONNECTION_MS = 7 * 24 * 60 * 60 * 1000;
export type OutreachView = "all" | "fresh" | "catchup" | "followups";
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(String(v))) ? new Date(String(v)).toISOString() : null;
/** Recorded evidence only; neither a profile nor a cadence stage proves connection. */
function profiles(row: LifecycleRow) {
  const raw = object(row.raw), rawMeta = object(raw.metadata), meta = object(row.metadata);
  return [...new Set([row.linkedin_identity, row.linkedin_url, raw.profile_url, raw.canonical_profile_url, raw.linkedin_url, rawMeta.profile_url, rawMeta.linkedin_url, meta.profile_url, meta.canonical_profile_url, meta.linkedin_url,
    row.kind === "connection_accepted" ? row.permalink : null].map(lifecycleLinkedInIdentity).filter((v): v is string => !!v))];
}
export function linkedInDestination(rows: LifecycleRow[]) {
  for (const row of rows) {
    const raw = object(row.raw);
    for (const value of [row.linkedin_message_url, raw.message_url]) try {
      const url = new URL(String(value || ""));
      const path = url.pathname.replace(/^\/comm\//, "/");
      const addressed = /^\/messaging\/(?:thread|compose)\/[^/]+/.test(path) ||
        (/^\/messaging\/(?:compose|new)\/?$/.test(path) && ["connId", "recipient", "recipients"].some(key => !!url.searchParams.get(key)));
      if (url.protocol === "https:" && /^(www\.)?linkedin\.com$/i.test(url.hostname) && !url.username && !url.password && !url.port && addressed) return url.href;
    } catch { /* Try only recorded canonical profile evidence next. */ }
  }
  for (const row of rows) { const identity = profiles(row)[0]; if (identity) return "https://" + identity; }
  return null;
}
export type LinkedInOutboundHistory = { contentKind?: string; message: string; sentAt: string; table: "inbox_items" | "growth_targets"; id: string; source: "manual completion receipt" | "recorded acceptance message sent" };
export function linkedInRecordedEvidence(rows: LifecycleRow[], identity: string, now = Date.now()) {
  const canonical = identity.startsWith("linkedin:") ? identity.slice(9) : null;
  const matching = rows.filter(r => canonical && profiles(r).length === 1 && profiles(r)[0] === canonical);
  const acceptance = matching.filter(r => r.platform === "linkedin" && r.kind === "connection_accepted" && r.status !== "archived")
    .sort((a,b) => String(b.created_at_platform || b.inserted_at || "").localeCompare(String(a.created_at_platform || a.inserted_at || "")))[0];
  const contradictory = rows.some(r => {
    const raw = object(r.raw), meta = { ...raw, ...object(raw.metadata), ...object(r.metadata) };
    return [r.connection_status, r.connection_state, r.invitation_status, meta.connection_status, meta.connection_state, meta.invitation_status]
      .some(v => ["pending", "invited", "not_connected", "disconnected", "withdrawn", "rejected", "2nd", "2nd-degree", "second_degree", "third_degree"].includes(String(v || "").toLowerCase())) || meta.is_connected === false || r.is_connected === false;
  });
  const ambiguous = rows.some(r => profiles(r).length > 1) || rows.filter(r => r.kind === "connection_accepted" || r.stage).some(r => !canonical || profiles(r).length !== 1 || profiles(r)[0] !== canonical);
  const history: LinkedInOutboundHistory[] = [];
  let hasConfirmedSend = false;
  for (const row of matching) {
    const table = row.kind === "connection_accepted" ? "inbox_items" : row.stage ? "growth_targets" : null;
    if (!table) continue;
    const savedReceipt = object(row.manual_completion);
    const receipts = sendReceipts(savedReceipt);
    if (receipts.length) hasConfirmedSend = true;
    const firstEvidence = firstSendEvidence(savedReceipt, now);
    if (firstEvidence.status !== "verified") continue;
    for (const receipt of receipts) {
      if (receipt.correction_type === "first_send_classification" || receipt === firstEvidence.receipt || receipt.stage !== "connection" && receipt.stage) {
        const sentAt = externalSentAt(receipt, now);
        if (sentAt) history.push({ contentKind: typeof receipt.content_kind === "string" ? receipt.content_kind : undefined, message: String(receipt.message), sentAt, table, id: row.id, source: "manual completion receipt" });
      }
    }
  }
  history.sort((a,b) => b.sentAt.localeCompare(a.sentAt));
  return { acceptance, contradictory, ambiguous, matching, hasConfirmedSend, previousOutbound: history[0] || null, destination: linkedInDestination(matching) };
}
export function linkedInOutreachQueue(organisationId: string, input: LifecycleInput, now = Date.now(), view: OutreachView = "all", excluded: string[] = [], limit = 10, self: OutreachSelfIdentity = emptyOutreachSelfIdentity()) {
  const contacts = buildContactLifecycle(organisationId, input, now);
  const index = new Map(Object.entries(input).flatMap(([table, rows]) => rows.filter(r => r.organisation_id === organisationId).map(r => [`${table}:${r.id}`, r] as const)));
  const audit: Record<string, unknown>[] = [];
  const items = contacts.flatMap(contact => {
    if (contact.channel !== "linkedin") return [];
    const refs = contact.records, rows = refs.map(ref => index.get(`${ref.table}:${ref.id}`)!);
    const truth = linkedInRecordedEvidence(rows, contact.identity, now);
    const evidence = { connectionVerified: !!truth.acceptance && !truth.contradictory && !truth.ambiguous, destinationPresent: !!truth.destination, outboundConfirmed: truth.hasConfirmedSend, previousOutbound: truth.previousOutbound, defects: [!truth.acceptance || truth.contradictory ? "connection state unverified" : null, truth.ambiguous ? "ambiguous identity" : null, !truth.destination ? "destination missing" : null, contact.currentStage === "follow_up" && (!truth.hasConfirmedSend || !truth.previousOutbound) ? "outbound history incomplete" : null].filter(Boolean), name: contact.name, identity: contact.identity, currentStage: contact.currentStage, actionRecord: contact.actionRecord,
      records: refs.map((ref, i) => { const r = rows[i], raw = object(r.raw); return { table: ref.table, id: r.id, kind: r.kind, platform: r.platform, status: r.status, response_state: r.response_state, stage: r.stage, source_engine: r.source_engine, source_type: r.source_type, source_record_id: r.source_record_id, notes: r.notes, created_at_platform: r.created_at_platform, inserted_at: r.inserted_at, contacted_at: r.contacted_at, last_replied_at: r.last_replied_at, last_action_at: r.last_action_at, last_reply_text: r.last_reply_text, replied_at: r.replied_at, reply_status: r.reply_status, deal_stage: r.deal_stage, canonicalIdentity: lifecycleLinkedInIdentity(r.linkedin_identity) || lifecycleLinkedInIdentity(r.linkedin_url) || lifecycleLinkedInIdentity(raw.profile_url) || lifecycleLinkedInIdentity(r.permalink), destination: linkedInDestination([r])?.split("?")[0] || null, rawSource: raw.source_engine, rawSourceType: raw.source_type, manualReceipt: { completed_at: object(r.manual_completion).completed_at, evidence: object(r.manual_completion).evidence, message: object(r.manual_completion).message }, hasManualReceipt: !!r.manual_completion, hasEngineState: !!r.engine_state }; }) };
    const reject = (reason: string) => { audit.push({ ...evidence, eligibility: reason }); return []; };
    if (excluded.includes(contact.contactId)) return reject("skipped in this batch");
    if (!["outreach_ready", "follow_up"].includes(contact.currentStage)) return reject("stronger lifecycle stage");
    if (isOutreachSelfContact(rows, self)) return reject("self identity");
    const row = index.get(`${contact.actionRecord.table}:${contact.actionRecord.id}`)!;
    const first = contact.currentStage === "outreach_ready";
    // A weaker historical record must never authorise outreach over a reply or closure.
    if (refs.some(ref => ["needs_reply", "engaged", "meeting", "converted", "lost", "dismissed", "no_reply_needed", "nurture", "waiting"].includes(ref.stage) && !(ref.table === "inbox_items" && index.get(`${ref.table}:${ref.id}`)?.kind === "connection_accepted" && !first && truth.hasConfirmedSend && ref.stage === "waiting"))) return reject("stronger reply/closure/waiting record");
    if (rows.some(r => r.replied_at || (r.reply_status && r.reply_status !== "no_reply") || r.status === "archived" || (r.platform === "linkedin" && r.kind === "dm" && text(r.text)))) return reject("reply or archived record");
    if (contact.engineEvidence.length || rows.some(r => !(r.platform === "linkedin" && r.kind === "connection_accepted") && (r.engine_state || ["root_health_b2b", "google_b2b_lead_engine", "root_health_personal"].includes(String(r.source_engine || r.source_type)) || ["root_health_b2b", "google_b2b_lead_engine"].includes(String(object(r.metadata).source))))) return reject("source ownership");
    const table = contact.actionRecord.table;
    if (table !== "inbox_items" && table !== "growth_targets") return reject("unsupported action table");
    if (table === "inbox_items" && (!first || row.kind !== "connection_accepted")) return reject("inbox action is not unsent acceptance");
    if (table === "growth_targets" && (!outreachStages.includes(String(row.stage) as typeof outreachStages[number]) || row.next_step || (row.lead_quality && !["valid", "unreviewed"].includes(String(row.lead_quality))))) return reject("growth stage/next-step/quality exclusion");
    const acceptance = truth.acceptance;
    if (truth.contradictory || !acceptance) return reject("connection state unverified");
    if (truth.ambiguous) return reject("ambiguous identity");
    if (!truth.destination) return reject("destination missing");
    const previousOutbound = truth.previousOutbound;
    if (first && (truth.hasConfirmedSend || rows.some(r => r.contacted_at || r.last_replied_at || r.last_action_at || r.manual_completion || r.status === "replied"))) return reject("conflicting lifecycle: prior contact prevents first message");
    if (!first && (!truth.hasConfirmedSend || !previousOutbound)) return reject("outbound history incomplete");
    if (!first && (contact.followUpStatus !== "due" || row.stage === "connection")) return reject("follow-up not due or connection stage");
    if (!first && date(row.last_action_at) !== previousOutbound?.sentAt) return reject("conflicting lifecycle: cadence timestamp differs from confirmed send");
    if (!date(acceptance.created_at_platform || acceptance.inserted_at) || Date.parse(String(acceptance.created_at_platform || acceptance.inserted_at)) > now) return reject("acceptance timing unverified");
    if (!planManualCompletion(organisationId, input, table, row.id).allowed) return reject("manual governor refused");
    const connectedAt = date(acceptance?.created_at_platform || acceptance?.inserted_at);
    const fresh = !!connectedAt && Date.parse(connectedAt) <= now && now - Date.parse(connectedAt) <= FRESH_CONNECTION_MS;
    const mode = first ? fresh ? "fresh" : "catchup" : "followups";
    if (view !== "all" && view !== mode) return reject("different view");
    audit.push({ ...evidence, eligibility: "eligible" });
    const raw = object(acceptance?.raw), meta = { ...raw, ...object(raw.metadata) };
    const role = text(row.role_title) || text(meta.headline) || text(meta.role_title) || text(acceptance?.author_handle) || text(acceptance?.post_text);
    const highFit = /chief people|people director|hr director|head of (?:hr|people)|(?:workforce |workplace )?wellbeing|learning.*development|\bl&d\b|(?:director|chief|head).*(?:care|health)/i.test(role || "");
    const stage = first ? "connection" : String(row.stage);
    const reason = first ? `${fresh ? "Fresh accepted connection" : connectedAt ? "Older connection awaiting a first message" : "First message; acceptance timing is unknown"}${highFit ? "; recorded role matches people, wellbeing or health leadership" : ""}.` : `The existing ${stage.replaceAll("_", " ")} follow-up is due${contact.nextDueDate ? ` since ${new Date(contact.nextDueDate).toLocaleDateString("en-GB")}` : ""}.`;
    const context: ResponseContactContext = {
      interactionType: first ? "linkedin_connection_first_message" : "linkedin_followup", messageType: first ? "First LinkedIn message" : stage,
      name: contact.name, company: contact.company, role, sector: null, source: contact.source, whyRelevant: reason,
      relationship: contact.currentStage, latestEvent: text(acceptance?.text) || "Recorded LinkedIn outreach",
      whatWeKnow: [text(row.notes)].filter((v): v is string => !!v),
      history: [...(previousOutbound ? [(previousOutbound.contentKind === "conversation_history_pasted" ? "Exact pasted conversation audit trail (multiple messages/UI text; no individual dates inferred): " : "Actual previous outbound message: ") + previousOutbound.message, (previousOutbound.contentKind === "conversation_history_pasted" ? "Earliest user-verified outbound date only: " : "Confirmed sent at ") + previousOutbound.sentAt + " via " + previousOutbound.source + " (" + previousOutbound.table + ":" + previousOutbound.id + ")."] : []), connectedAt ? `Connection acceptance detected on ${connectedAt}.` : "Connection acceptance timing unknown."],
      lastAction: contact.lastAction ? JSON.stringify(contact.lastAction) : null, currentStage: stage,
      buyingSignal: "unknown", buyingSignalLabel: "No buying signal inferred.", objective: objectiveFor(first ? "linkedin_connection_first_message" : "linkedin_followup", false),
    };
    return [{ contactId: contact.contactId, table, id: row.id, name: contact.name || "Unnamed contact", company: contact.company, role, connectedAt,
      lifecycle: contact.currentStage, stage, mode, dueAt: contact.nextDueDate, lastAction: contact.lastAction, reason,
      destination: truth.destination, destinationKind: /\/messaging\//.test(truth.destination) ? "messaging" : "profile", previousOutbound: first ? null : previousOutbound, context,
      // Drafts are generated against this exact stage; old saved drafts may belong to another stage.
      priority: first ? highFit ? 1 : 2 : 0 }];
  });
  items.sort((a,b) => a.priority - b.priority || (a.dueAt || a.connectedAt || "9999").localeCompare(b.dueAt || b.connectedAt || "9999") || a.contactId.localeCompare(b.contactId));
  const reconciliationReasons = Object.fromEntries(["connection state unverified", "destination missing", "outbound history incomplete", "ambiguous identity"].map(reason => [reason, audit.filter(contact => (contact.defects as string[]).includes(reason)).length]));
  return { audit, reconciliationReasons, items: items.slice(0,limit), total: items.length, identityReviewNeeded: contacts.filter(c => c.channel === "linkedin" && c.currentStage === "outreach_ready" && !c.identity.startsWith("linkedin:")).length, unreconciledFollowups: contacts.filter(c => c.channel === "linkedin" && c.followUpStatus === "due" && c.actionRecord.table === "inbox_items" && !c.records.some(r => r.table === "growth_targets")).length, repliesNeedingAttention: contacts.filter(c => c.currentStage === "needs_reply" || c.nextAction === "reply").length };
}
export type LinkedInOutreachItem = ReturnType<typeof linkedInOutreachQueue>["items"][number];
