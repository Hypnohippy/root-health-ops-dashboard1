import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canonicalLinkedInAcceptanceProfile, linkedinAcceptanceSourceRecordId } from "@/lib/linkedinConnectionDiscovery";
import { verifiedLinkedInProfile } from "@/lib/linkedinCaptureProfile";

export async function recordManualLinkedInAcceptance(organisationId: string, actor: string, input: { profileUrl: string; capturedAt: string; name: string }) {
  const identity = canonicalLinkedInAcceptanceProfile(input.profileUrl);
  const { data: existing, error } = await supabaseAdmin.from("inbox_items").select("id,kind")
    .eq("organisation_id", organisationId).eq("linkedin_identity", identity).maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.kind !== "connection_accepted") throw Error("This profile already has another conversation record. Review it in Responses before reconciling acceptance.");
    return { id: existing.id, duplicate: true };
  }
  const sourceId = linkedinAcceptanceSourceRecordId(input.profileUrl);
  const row = { id: randomUUID(), organisation_id: organisationId, platform: "linkedin", kind: "connection_accepted", status: "needs_reply", response_state: "needs_reply",
    author_name: input.name || null, author_handle: null, text: "LinkedIn connection acceptance manually confirmed.", permalink: input.profileUrl,
    linkedin_identity: identity, external_id: sourceId, created_at_platform: input.capturedAt, inserted_at: new Date().toISOString(), source_engine: "linkedin_manual_capture",
    raw: { source_type: "linkedin_connection_accepted", source_engine: "linkedin_manual_capture", source_format: "manual_iphone_share", profile_url: input.profileUrl,
      captured_at: input.capturedAt, confirmed_at: new Date().toISOString(), actor, acceptance_confirmed: true, evidence: "User confirmed accepted connection from LinkedIn notification/profile" } };
  const { data: saved, error: writeError } = await supabaseAdmin.from("inbox_items").upsert([row], { onConflict: "organisation_id,linkedin_identity", ignoreDuplicates: true }).select("id");
  if (writeError) throw writeError;
  if (saved?.length) return { id: saved[0].id, duplicate: false };
  // A concurrent Gmail/manual capture wins the same existing unique index.
  const { data: winner, error: rereadError } = await supabaseAdmin.from("inbox_items").select("id,kind").eq("organisation_id", organisationId).eq("linkedin_identity", identity).single();
  if (rereadError || winner?.kind !== "connection_accepted") throw Error("The existing profile needs review in Responses.");
  return { id: winner.id, duplicate: true };
}

// Read-only transition: keep the recommendation and Gmail provenance intact.
export async function linkedInRecommendationStates(organisationId: string, items: { id: string; source_engine: string; source_url: string | null }[]) {
  const candidates = items.filter(item => item.source_engine === "linkedin_connection_recommendation");
  if (!candidates.length) return {} as Record<string, { acceptedConnectionId: string | null; alreadyKnown: boolean }>;
  const [{ data: inbox, error: inboxError }, { data: targets, error: targetError }] = await Promise.all([
    supabaseAdmin.from("inbox_items").select("id,kind,linkedin_identity,permalink").eq("organisation_id", organisationId).eq("platform", "linkedin"),
    supabaseAdmin.from("growth_targets").select("linkedin_url,linkedin_identity").eq("organisation_id", organisationId),
  ]);
  if (inboxError || targetError) throw inboxError || targetError;
  return Object.fromEntries(candidates.map(item => {
    const profile = verifiedLinkedInProfile(item.source_url || "");
    const identity = profile ? canonicalLinkedInAcceptanceProfile(profile) : "";
    const records = (inbox || []).filter(row => identity && (row.linkedin_identity === identity || canonicalLinkedInAcceptanceProfile(row.permalink || "") === identity));
    return [item.id, { acceptedConnectionId: records.find(row => row.kind === "connection_accepted")?.id || null,
      alreadyKnown: records.length > 0 || (targets || []).some(row => identity && (row.linkedin_identity === identity || canonicalLinkedInAcceptanceProfile(row.linkedin_url || "") === identity)) }];
  }));
}
