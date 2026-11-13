import { linkedInFirstMessageAngle, linkedInFirstMessageFamily } from "@/lib/linkedinDayZero";
import { lifecycleLinkedInIdentity, type LifecycleInput, type LifecycleRow, type LifecycleTable } from "@/lib/contactLifecycle";
import { linkedInRecipientContext, linkedInRecipientIdentity } from "@/lib/linkedinRecipientContext";
import type { LinkedInOutreachItem } from "@/lib/linkedinOutreach";
import type { LinkedInOutreachDisplayTrace } from "@/lib/linkedinOutreachDisplay";

/** TEMPORARY: remove this module and its route/UI hooks after the forensic review. */
export const LINKEDIN_CONTEXT_TRACE_ORGANISATION = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1";
export const LINKEDIN_CONTEXT_TRACE_INBOX_IDS = [
  "9a14f3db-5dd7-4c43-94f9-7388cbf41bb2",
  "2048e384-5466-4782-b104-6e303372b762",
  "58af563b-5722-4210-8bfe-ec6a0561e9a6",
  "0f7b10bb-4f5c-4707-bd58-c0eb5afc482c",
] as const;

export type LinkedInProfessionalContextTrace = ReturnType<typeof buildLinkedInProfessionalContextTrace>;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const tables: LifecycleTable[] = ["inbox_items", "growth_targets", "acquisition_items"];
const identityValues = (row: LifecycleRow) => {
  const raw = object(row.raw), nested = object(raw.metadata), meta = object(row.metadata), engine = object(row.engine_state);
  return [row.linkedin_identity, row.linkedin_url, engine.linkedin_identity, row.source_url,
    row.platform === "linkedin" ? row.permalink : null, raw.profile_url, raw.canonical_profile_url, raw.linkedin_url,
    nested.profile_url, nested.linkedin_url, meta.profile_url, meta.canonical_profile_url, meta.linkedin_url]
    .map(value => typeof value === "string" ? value.trim() : "").filter(Boolean);
};
const factCandidates = (row: LifecycleRow) => {
  const raw = object(row.raw), nested = object(raw.metadata), meta = object(row.metadata);
  return {
    role: [["role_title", row.role_title], ["raw.role_title", raw.role_title], ["raw.headline", raw.headline], ["raw.metadata.role_title", nested.role_title], ["raw.metadata.headline", nested.headline], ["metadata.role_title", meta.role_title], ["metadata.headline", meta.headline]]
      .flatMap(([field, value]) => text(value) ? [{ field, value: text(value) }] : []),
    company: [["company", row.company], ["raw.company", raw.company], ["raw.metadata.company", nested.company], ["metadata.company", meta.company]]
      .flatMap(([field, value]) => text(value) ? [{ field, value: text(value) }] : []),
    recipientCategory: [["recipient_category", row.recipient_category], ["raw.recipient_category", raw.recipient_category], ["raw.metadata.recipient_category", nested.recipient_category], ["metadata.recipient_category", meta.recipient_category]]
      .flatMap(([field, value]) => text(value) ? [{ field, value: text(value) }] : []),
  };
};

export function linkedInProfessionalContextTraceEnabled(organisationId: string, env?: NodeJS.ProcessEnv) {
  const flag = env?.LINKEDIN_PROFESSIONAL_CONTEXT_TRACE_ENABLED ?? (typeof process === "undefined" ? undefined : process.env.LINKEDIN_PROFESSIONAL_CONTEXT_TRACE_ENABLED);
  return flag === "true" && organisationId === LINKEDIN_CONTEXT_TRACE_ORGANISATION;
}

export function buildLinkedInProfessionalContextTrace(input: LifecycleInput, organisationId: string, queueItems: LinkedInOutreachItem[], displayedItems: LinkedInOutreachItem[], displayTraces: LinkedInOutreachDisplayTrace[], generated?: { contactId: string; message: string }) {
  const displayById = new Map(displayedItems.map(item => [item.contactId, item]));
  const displayTraceById = new Map(displayTraces.map(trace => [trace.contactId, trace]));
  const rows = LINKEDIN_CONTEXT_TRACE_INBOX_IDS.map(id => {
    const accepted = input.inbox_items.find(row => row.id === id && row.organisation_id === organisationId) || null;
    if (!accepted) return { inboxId: id, source: null, identity: { canonical: null, exact: false, reason: "allowlisted accepted inbox record is absent from this tenant snapshot" }, matchingEvidence: [], queue: null, display: null, finalApi: null, generation: null };
    const canonical = linkedInRecipientIdentity(accepted);
    const recipient = linkedInRecipientContext(organisationId, input, canonical ? `linkedin:${canonical}` : null);
    const matched = canonical ? tables.flatMap(table => input[table].filter(row => row.organisation_id === organisationId && linkedInRecipientIdentity(row) === canonical)
      .map(row => ({ table, id: row.id, isAcceptedInbox: table === "inbox_items" && row.id === accepted.id, identityExact: true, facts: factCandidates(row) }))) : [];
    const queueItem = canonical ? queueItems.find(item => item.contactId === JSON.stringify([organisationId, `linkedin:${canonical}`])) || null : null;
    const displayItem = queueItem ? displayById.get(queueItem.contactId) || null : null;
    const generation = generated && queueItem?.contactId === generated.contactId ? {
      availableProfessionalContext: displayItem ? { role: displayItem.context.role ?? null, company: displayItem.context.company ?? null, recipientCategory: displayItem.context.recipientCategory ?? null } : null,
      family: displayItem ? linkedInFirstMessageFamily(displayItem.context) : null,
      angle: displayItem ? linkedInFirstMessageAngle(linkedInFirstMessageFamily(displayItem.context)) : null,
      message: generated.message,
    } : null;
    const raw = object(accepted.raw), rawMeta = object(raw.metadata), metadata = object(accepted.metadata);
    return {
      inboxId: id,
      source: {
        id: accepted.id,
        identityValues: identityValues(accepted),
        headline: text(raw.headline) || text(rawMeta.headline) || text(metadata.headline),
        roleTitle: text(accepted.role_title) || text(raw.role_title) || text(rawMeta.role_title) || text(metadata.role_title),
        company: text(accepted.company) || text(raw.company) || text(rawMeta.company) || text(metadata.company),
        recipientCategory: text(accepted.recipient_category) || text(raw.recipient_category) || text(rawMeta.recipient_category) || text(metadata.recipient_category),
        evidence: factCandidates(accepted),
      },
      identity: {
        canonical,
        normalisedIdentity: canonical ? lifecycleLinkedInIdentity(canonical) : null,
        exact: !!canonical && identityValues(accepted).some(value => lifecycleLinkedInIdentity(value) === canonical),
        reason: canonical ? "one unambiguous canonical identity on accepted source row" : "missing or multiple canonical identities on accepted source row",
      },
      matchingEvidence: matched,
      recipientContext: { role: recipient.role, company: recipient.company, recipientCategory: recipient.recipientCategory },
      queue: queueItem ? {
        contactId: queueItem.contactId,
        actionRecord: { table: queueItem.table, id: queueItem.id, isAcceptedInbox: queueItem.table === "inbox_items" && queueItem.id === accepted.id },
        role: queueItem.role,
        company: queueItem.company,
        context: { role: queueItem.context.role ?? null, company: queueItem.context.company ?? null, recipientCategory: queueItem.context.recipientCategory ?? null },
        mode: queueItem.mode,
        stage: queueItem.stage,
      } : null,
      display: queueItem ? displayTraceById.get(queueItem.contactId) || null : null,
      finalApi: displayItem ? {
        contactId: displayItem.contactId,
        table: displayItem.table,
        id: displayItem.id,
        role: displayItem.role,
        company: displayItem.company,
        context: { role: displayItem.context.role ?? null, company: displayItem.context.company ?? null, recipientCategory: displayItem.context.recipientCategory ?? null },
        mode: displayItem.mode,
        stage: displayItem.stage,
        family: linkedInFirstMessageFamily(displayItem.context),
        angle: linkedInFirstMessageAngle(linkedInFirstMessageFamily(displayItem.context)),
      } : null,
      generation,
    };
  });
  return { version: "temporary-linkedin-professional-context-trace-v1" as const, organisationId, allowedInboxIds: [...LINKEDIN_CONTEXT_TRACE_INBOX_IDS], records: rows };
}
