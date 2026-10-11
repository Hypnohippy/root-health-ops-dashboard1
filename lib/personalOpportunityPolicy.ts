import type { PersonalSignalItem } from "@/lib/personalSignal";

const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" && !!v.trim();
/** Historical records are retained. This policy governs only active Personal use. */
export function personalRedditSource(item: Pick<PersonalSignalItem, "source_engine" | "source_url" | "metadata"> & { engine_state?: { channel?: string | null } | null }) {
  if (item.source_engine !== "root_health_personal") return false;
  const m = item.metadata || {};
  for (const value of [item.source_url, m.source_url, m.original_source_url]) {
    try { const host = new URL(String(value)).hostname.toLowerCase(); if (host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it") return true; } catch { /* no invented source */ }
  }
  return [m.platform, m.source_platform, m.channel, item.engine_state?.channel].some(v => typeof v === "string" && /^reddit$/i.test(v.trim()));
}

/** Explicit tenant-scoped interaction evidence, never inferred from a public post,
 * account connection, wellbeing language, or anonymous aggregate activity. */
export function personalProspect(item: PersonalSignalItem & { organisation_id?: string }) {
  if (item.source_engine !== "root_health_personal" || personalRedditSource(item) || item.metadata?.test === true) return null;
  const i = obj(item.metadata?.first_party_interaction), next = obj(i.authorised_next_step);
  if (!item.organisation_id || i.organisation_id !== item.organisation_id || i.verified !== true || !text(i.evidence) || !text(i.source_record_id) || !text(i.verified_source_url)) return null;
  if (!["inbound_enquiry", "inbound_dm", "owned_asset_engagement", "consented_contact", "verified_referral", "identified_first_party_engagement"].includes(String(i.kind))) return null;
  if (i.kind === "owned_asset_engagement" && (i.asset_organisation_id !== item.organisation_id || i.asset_ownership_verified !== true || !text(i.asset_id))) return null;
  if (i.identified !== true || next.verified !== true || !text(next.evidence) || !["public_reply", "reply_to_inbound", "consented_contact", "referral_contact"].includes(String(next.kind))) return null;
  try { const url = new URL(String(i.verified_source_url)); if (url.protocol !== "https:" || url.username || url.password || url.port) return null; } catch { return null; }
  return { interaction: String(i.kind), nextStep: String(next.kind), evidence: String(i.evidence) };
}

export function personalAudience(item: PersonalSignalItem & { organisation_id?: string }) {
  return item.source_engine === "root_health_personal" && item.record_type !== "partner_opportunity" && !personalProspect(item);
}

export function personalActionPermitted(item: PersonalSignalItem & { organisation_id?: string }, action: string) {
  if (item.source_engine !== "root_health_personal") return true;
  if (personalRedditSource(item) || item.metadata?.test === true) return false;
  if (!personalAudience(item)) return true;
  return ["start_review", "accept", "nurture", "dismiss", "create_content_draft", "route_publishing"].includes(action);
}
