import { resolveLinkedInName } from "@/lib/linkedinCaptureName";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canonicalLinkedInAcceptanceProfile, linkedinAcceptanceSourceRecordId } from "@/lib/linkedinConnectionDiscovery";
import { verifiedLinkedInProfile } from "@/lib/linkedinCaptureProfile";

export async function recordManualLinkedInAcceptance(organisationId: string, actor: string, input: { profileUrl: string; capturedAt: string; name: string }) {
  const identity = canonicalLinkedInAcceptanceProfile(input.profileUrl);
  const { data: existing, error } = await supabaseAdmin.from("inbox_items").select("id,kind,author_name")
    .eq("organisation_id", organisationId).eq("linkedin_identity", identity).maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.kind !== "connection_accepted") throw Error("This profile already has another conversation record. Review it in Responses before reconciling acceptance.");
    // Explicit user capture may fill a blank name; never overwrite a concurrent/non-blank name.
    let nameUpdated = false;
    if (!existing.author_name?.trim() && input.name.trim()) {
      let repair = supabaseAdmin.from("inbox_items").update({ author_name: input.name.trim() })
        .eq("organisation_id", organisationId).eq("id", existing.id).eq("kind", "connection_accepted");
      repair = existing.author_name == null ? repair.is("author_name", null) : repair.eq("author_name", existing.author_name);
      const { data: repaired, error: repairError } = await repair.select("id");
      if (repairError) throw repairError;
      nameUpdated = !!repaired?.length;
    }
    return { id: existing.id, duplicate: true, nameUpdated };
  }
  if (!input.name.trim()) throw Error("Enter the person’s name before saving.");
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
  const [inbox, targets] = await Promise.all([
    readAll(offset => supabaseAdmin.from("inbox_items").select("id,kind,linkedin_identity,permalink").eq("organisation_id", organisationId).eq("platform", "linkedin").order("id").range(offset, offset + 499)),
    readAll(offset => supabaseAdmin.from("growth_targets").select("linkedin_url,linkedin_identity").eq("organisation_id", organisationId).order("id").range(offset, offset + 499)),
  ]);
  return Object.fromEntries(candidates.map(item => {
    const profile = verifiedLinkedInProfile(item.source_url || "");
    const identity = profile ? canonicalLinkedInAcceptanceProfile(profile) : "";
    const records = (inbox || []).filter(row => identity && (row.linkedin_identity === identity || canonicalLinkedInAcceptanceProfile(row.permalink || "") === identity));
    return [item.id, { acceptedConnectionId: records.find(row => row.kind === "connection_accepted")?.id || null,
      alreadyKnown: records.length > 0 || (targets || []).some(row => identity && (row.linkedin_identity === identity || canonicalLinkedInAcceptanceProfile(row.linkedin_url || "") === identity)) }];
  }));
}

async function readAll<T>(request: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await request(offset);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
}
export async function readLinkedInNameEvidence(organisationId: string) {
  const results = await Promise.all([
    readAll(offset => supabaseAdmin.from("inbox_items").select("author_name,linkedin_identity,permalink").eq("organisation_id", organisationId).eq("platform", "linkedin").order("id").range(offset, offset + 499)),
    readAll(offset => supabaseAdmin.from("growth_targets").select("target_name,linkedin_identity,linkedin_url").eq("organisation_id", organisationId).order("id").range(offset, offset + 499)),
    readAll(offset => supabaseAdmin.from("acquisition_items").select("person,source_url").eq("organisation_id", organisationId).eq("source_engine", "linkedin_connection_recommendation").order("id").range(offset, offset + 499)),
  ]);
  return [...results[0], ...results[1], ...results[2]];
}
export async function resolveCaptureName(organisationId: string, profile: string) {
  return resolveLinkedInName(profile, await readLinkedInNameEvidence(organisationId));
}

// Presentation references only: no duplicate Acquisition or relationship writes.
export async function acceptedLinkedInOpportunities(organisationId: string) {
  const data = await readAll(offset => supabaseAdmin.from("inbox_items").select("id,author_name,permalink,linkedin_identity,source_engine,inserted_at,status")
    .eq("organisation_id", organisationId).eq("platform", "linkedin").eq("kind", "connection_accepted").order("id").range(offset, offset + 499));
  return (data || []).filter(row => row.status !== "archived").map(row => ({
    id: `accepted:${row.id}`, record_type: "personal_opportunity", source_engine: "linkedin_accepted_reference", source_record_id: row.id,
    source_url: verifiedLinkedInProfile(row.permalink || `https://${row.linkedin_identity}`), person: row.author_name,
    signal: "Connected / Connection accepted", status: "connected", metadata: { acceptance_source: row.source_engine }, created_at: row.inserted_at,
    linkedinConnectionState: { acceptedConnectionId: row.id, alreadyKnown: true },
  }));
}
