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
export function linkedInDestination(rows: LifecycleRow[]) {
  for (const row of rows) {
    try {
      const url = new URL(String(row.linkedin_message_url || ""));
      if (url.protocol === "https:" && /^(www\.)?linkedin\.com$/i.test(url.hostname) && !url.username && !url.password && !url.port && /^\/(?:messaging(?:\/|$)|comm\/messaging(?:\/|$))/.test(url.pathname)) return url.href;
    } catch { /* Try recorded profile evidence next. */ }
  }
  for (const row of rows) {
    const raw = object(row.raw), meta = { ...raw, ...object(raw.metadata), ...object(row.metadata) };
    for (const value of [row.linkedin_identity, row.linkedin_url, meta.profile_url, meta.linkedin_url, row.kind === "connection_accepted" ? row.permalink : null]) {
      const identity = lifecycleLinkedInIdentity(value);
      if (identity) return `https://${identity}`;
    }
  }
  return null;
}
export function linkedInOutreachQueue(organisationId: string, input: LifecycleInput, now = Date.now(), view: OutreachView = "all", excluded: string[] = [], limit = 10, self: OutreachSelfIdentity = emptyOutreachSelfIdentity()) {
  const contacts = buildContactLifecycle(organisationId, input, now);
  const index = new Map(Object.entries(input).flatMap(([table, rows]) => rows.filter(r => r.organisation_id === organisationId).map(r => [`${table}:${r.id}`, r] as const)));
  const items = contacts.flatMap(contact => {
    if (excluded.includes(contact.contactId) || contact.channel !== "linkedin" || !["outreach_ready", "follow_up"].includes(contact.currentStage)) return [];
    const refs = contact.records, rows = refs.map(ref => index.get(`${ref.table}:${ref.id}`)!);
    if (isOutreachSelfContact(rows, self)) return [];
    const row = index.get(`${contact.actionRecord.table}:${contact.actionRecord.id}`)!;
    const first = contact.currentStage === "outreach_ready";
    // A weaker historical record must never authorise outreach over a reply or closure.
    if (refs.some(ref => ["needs_reply", "engaged", "meeting", "converted", "lost", "dismissed", "no_reply_needed", "nurture", "waiting"].includes(ref.stage))) return [];
    if (rows.some(r => r.replied_at || (r.reply_status && r.reply_status !== "no_reply") || r.status === "archived" || (r.platform === "linkedin" && r.kind === "dm" && text(r.text)))) return [];
    if (contact.engineEvidence.length || rows.some(r => r.engine_state || ["root_health_b2b", "google_b2b_lead_engine", "root_health_personal"].includes(String(r.source_engine || r.source_type)) || ["root_health_b2b", "google_b2b_lead_engine"].includes(String(object(r.metadata).source)))) return [];
    if (!first && (contact.followUpStatus !== "due" || row.stage === "connection")) return [];
    const table = contact.actionRecord.table;
    if (table !== "inbox_items" && table !== "growth_targets") return [];
    if (table === "inbox_items" && (!first || row.kind !== "connection_accepted")) return [];
    if (table === "growth_targets" && (!outreachStages.includes(String(row.stage) as typeof outreachStages[number]) || row.next_step || (row.lead_quality && !["valid", "unreviewed"].includes(String(row.lead_quality))))) return [];
    const acceptance = rows.filter(r => r.platform === "linkedin" && r.kind === "connection_accepted").sort((a,b) => String(a.id).localeCompare(String(b.id)))[0];
    // A growth prospect without recorded acceptance is not a first-message opportunity.
    if (first && (!acceptance || !contact.identity.startsWith("linkedin:"))) return [];
    if (!planManualCompletion(organisationId, input, table, row.id).allowed) return [];
    const connectedAt = date(acceptance?.created_at_platform || acceptance?.inserted_at);
    const fresh = !!connectedAt && Date.parse(connectedAt) <= now && now - Date.parse(connectedAt) <= FRESH_CONNECTION_MS;
    const mode = first ? fresh ? "fresh" : "catchup" : "followups";
    if (view !== "all" && view !== mode) return [];
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
      history: [connectedAt ? `Connection acceptance detected on ${connectedAt}.` : "Connection acceptance timing unknown.", ...rows.map(r => text(r.last_reply_text)).filter((v): v is string => !!v)],
      lastAction: contact.lastAction ? JSON.stringify(contact.lastAction) : null, currentStage: stage,
      buyingSignal: "unknown", buyingSignalLabel: "No buying signal inferred.", objective: objectiveFor(first ? "linkedin_connection_first_message" : "linkedin_followup", false),
    };
    return [{ contactId: contact.contactId, table, id: row.id, name: contact.name || "Unnamed contact", company: contact.company, role, connectedAt,
      lifecycle: contact.currentStage, stage, mode, dueAt: contact.nextDueDate, lastAction: contact.lastAction, reason,
      destination: linkedInDestination([row, ...rows.filter(r => r !== row)]), context,
      // Drafts are generated against this exact stage; old saved drafts may belong to another stage.
      priority: first ? highFit ? 1 : 2 : 0 }];
  });
  items.sort((a,b) => a.priority - b.priority || (a.dueAt || a.connectedAt || "9999").localeCompare(b.dueAt || b.connectedAt || "9999") || a.contactId.localeCompare(b.contactId));
  return { items: items.slice(0,limit), total: items.length, identityReviewNeeded: contacts.filter(c => c.channel === "linkedin" && c.currentStage === "outreach_ready" && !c.identity.startsWith("linkedin:")).length, unreconciledFollowups: contacts.filter(c => c.channel === "linkedin" && c.followUpStatus === "due" && c.actionRecord.table === "inbox_items" && !c.records.some(r => r.table === "growth_targets")).length, repliesNeedingAttention: contacts.filter(c => c.currentStage === "needs_reply" || c.nextAction === "reply").length };
}
export type LinkedInOutreachItem = ReturnType<typeof linkedInOutreachQueue>["items"][number];
