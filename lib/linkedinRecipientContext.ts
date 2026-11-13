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
  const evidence = matching.map(row => ({ row, raw: object(row.raw), rawMeta: object(object(row.raw).metadata), meta: object(row.metadata) }));
  const values = (items: unknown[]) => items.map(text).filter((value): value is string => !!value);
  return {
    recipientCategory: unique(values(evidence.flatMap(({ row, raw, rawMeta, meta }) => [row.recipient_category, raw.recipient_category, rawMeta.recipient_category, meta.recipient_category]))),
    // Consider every exact-identity field candidate. A role_title must not silently
    // mask a contradictory imported headline on the same source row.
    role: unique(values(evidence.flatMap(({ row, raw, rawMeta, meta }) => [row.role_title, raw.role_title, raw.headline, rawMeta.role_title, rawMeta.headline, meta.role_title, meta.headline]))),
    company: unique(values(evidence.flatMap(({ row, raw, rawMeta, meta }) => [row.company, raw.company, rawMeta.company, meta.company]))),
  };
}
