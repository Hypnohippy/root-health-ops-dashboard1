import { lifecycleLinkedInIdentity, type LifecycleInput, type LifecycleRow } from "@/lib/contactLifecycle";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
function identities(row: LifecycleRow) {
  const raw = object(row.raw), metadata = object(row.metadata), nested = object(raw.metadata), engine = object(row.engine_state);
  return [...new Set([row.linkedin_identity, row.linkedin_url, engine.linkedin_identity, row.source_url, row.platform === "linkedin" ? row.permalink : null,
    raw.profile_url, raw.canonical_profile_url, raw.linkedin_url, nested.profile_url, nested.linkedin_url, metadata.profile_url, metadata.canonical_profile_url, metadata.linkedin_url]
    .map(lifecycleLinkedInIdentity).filter((value): value is string => !!value))];
}
/** Enrichment only: never authorises outreach or changes lifecycle/source ownership. */
export function linkedInRecipientContext(organisationId: string, input: LifecycleInput, identity: string | null) {
  const canonical = lifecycleLinkedInIdentity(identity?.replace(/^linkedin:/, ""));
  const matching = canonical ? Object.values(input).flat().filter(row => row.organisation_id === organisationId && identities(row).length === 1 && identities(row)[0] === canonical) : [];
  const unique = (values: unknown[]) => { const valid = [...new Set(values.map(text).filter((value): value is string => !!value))]; return valid.length === 1 ? valid[0] : null; };
  const evidence = matching.map(row => ({ row, meta: { ...object(row.raw), ...object(object(row.raw).metadata), ...object(row.metadata) } }));
  return {
    recipientCategory: unique(evidence.map(({ meta }) => meta.recipient_category)),
    role: unique(evidence.map(({ row, meta }) => text(row.role_title) || text(meta.role_title) || text(meta.headline))),
    company: unique(evidence.map(({ row, meta }) => text(row.company) || text(meta.company))),
  };
}
