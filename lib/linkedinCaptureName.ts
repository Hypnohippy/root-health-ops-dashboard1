import { verifiedLinkedInProfile } from "@/lib/linkedinCaptureProfile";

// An editable suggestion, never verified identity. Ambiguity fails closed.
export function linkedInSlugName(value: string): string | null {
  const profile = verifiedLinkedInProfile(value);
  if (!profile) return null;
  const parts = new URL(profile).pathname.split("/").pop()!.split("-");
  if (/\d/.test(parts.at(-1) || "")) parts.pop();
  const credential = parts.findIndex(p => ["chartered", "fcipd", "cipd", "mcipd", "assoc", "phd", "mba"].includes(p));
  if (credential >= 0) parts.splice(credential);
  if (parts.length !== 2 || parts.some(p => !/^[a-z]{2,25}$/.test(p) || ["coach", "consultant", "director", "founder", "recruitment", "hr", "user", "member", "linkedin", "profile", "health", "wellbeing", "company", "official", "team", "services", "group"].includes(p))) return null;
  return parts.map(p => p[0].toUpperCase() + p.slice(1)).join(" ");
}

type NamedProfile = { linkedin_identity?: string | null; permalink?: string | null; linkedin_url?: string | null; source_url?: string | null; author_name?: string | null; target_name?: string | null; person?: string | null };
export function resolveLinkedInName(profile: string, records: NamedProfile[]) {
  const canonical = verifiedLinkedInProfile(profile);
  if (!canonical) return { name: "", source: "manual" as const };
  const names = new Set(records.filter(row => [row.linkedin_identity && `https://${row.linkedin_identity}`, row.permalink, row.linkedin_url, row.source_url].some(url => !!url && verifiedLinkedInProfile(url) === canonical))
    .map(row => (row.author_name || row.target_name || row.person || "").trim()).filter(Boolean));
  if (names.size === 1) return { name: [...names][0], source: "stored" as const };
  if (names.size > 1) return { name: "", source: "manual" as const };
  const candidate = linkedInSlugName(profile);
  return { name: candidate || "", source: candidate ? "slug" as const : "manual" as const };
}
