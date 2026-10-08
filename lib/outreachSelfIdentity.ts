import { lifecycleLinkedInIdentity, type LifecycleRow } from "@/lib/contactLifecycle";

export type OutreachSelfIdentity = { names: string[]; emails: string[]; linkedinProfiles: string[]; linkedinAccountIds: string[] };
export const emptyOutreachSelfIdentity = (): OutreachSelfIdentity => ({ names: [], emails: [], linkedinProfiles: [], linkedinAccountIds: [] });
const normal = (v: unknown) => typeof v === "string" ? v.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() : "";
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const accountId = (v: unknown) => normal(v).replace(/^urn:li:(?:person|organization):/, "");
/** Identity matches only: sharing a company or an email domain is not proof of self. */
export function isOutreachSelfContact(rows: LifecycleRow[], self: OutreachSelfIdentity) {
  const names = new Set(self.names.map(normal).filter(Boolean));
  const emails = new Set(self.emails.map(normal).filter(Boolean));
  const profiles = new Set(self.linkedinProfiles.map(lifecycleLinkedInIdentity).filter(Boolean));
  const ids = new Set(self.linkedinAccountIds.map(accountId).filter(Boolean));
  return rows.some(row => {
    const raw = object(row.raw), meta = { ...raw, ...object(raw.metadata), ...object(row.metadata) };
    const nameMatch = [row.target_name, row.author_name, row.person].some(v => {
      const value = normal(v); return value.length > 3 && names.has(value);
    });
    const emailMatch = [row.email, row.sender_email, row.platform === "email" ? row.author_handle : null, meta.email].some(v => emails.has(normal(v)));
    const profileMatch = [row.linkedin_identity, row.linkedin_url, meta.linkedin_url, meta.profile_url, row.kind === "connection_accepted" ? row.permalink : null].some(v => { const key = lifecycleLinkedInIdentity(v); return !!key && profiles.has(key); });
    const idMatch = [row.linkedin_member_id, row.linkedin_account_id, row.author_id, meta.linkedin_member_id, meta.linkedin_account_id].some(v => { const key = accountId(v); return !!key && ids.has(key); });
    return nameMatch || emailMatch || profileMatch || idMatch;
  });
}
