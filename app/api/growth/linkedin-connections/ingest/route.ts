import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeIngestion, IngestionError, readIngestionBody, uuid } from "@/lib/growthIngestion.server";
import { normaliseProfile, toGenerationProfile } from "@/lib/brandGrowthProfile";
import { acceptedConnectionDraft, buildLinkedInCandidateRecord, canonicalLinkedInAcceptanceProfile, linkedinAcceptanceSourceRecordId, parseLinkedInAcceptanceEmail, qualifiesForBuyerTargeting, uniqueLinkedInSuggestions } from "@/lib/linkedinConnectionDiscovery";
import { canonicalLinkedInProfile } from "@/lib/growthOutreach";

export const runtime = "nodejs";
const clean = (value: unknown, max: number, required = false) => {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new IngestionError("Invalid LinkedIn acceptance field.");
  return value.trim();
};

export async function POST(req: Request) {
  try {
    const body = await readIngestionBody(req) as Record<string, unknown>;
    const organisationId = clean(body.organisation_id, 36, true).toLowerCase();
    const sourceEngine = clean(body.source_engine, 100, true);
    if (!uuid.test(organisationId)) throw new IngestionError("Explicit organisation_id is required.");
    authorizeIngestion(req.headers.get("authorization"), organisationId, [sourceEngine]);
    const parsed = parseLinkedInAcceptanceEmail({
      subject: clean(body.subject, 1000, true), sender: clean(body.sender, 500, true),
      html: clean(body.html, 200000, true), gmailMessageId: clean(body.gmail_message_id, 500, true),
      discoveredAt: clean(body.discovered_at, 100) || undefined,
    });
    if (!parsed) throw new IngestionError("This is not a recognised LinkedIn acceptance notification.");

    const [{ data: storedProfile, error: profileError }, { data: existingAcquisition, error: acquisitionError }, { data: targets, error: targetError }, { data: existingResponses, error: responseReadError }] = await Promise.all([
      supabaseAdmin.from("organisation_profiles").select("profile").eq("organisation_id", organisationId).maybeSingle(),
      supabaseAdmin.from("acquisition_items").select("source_record_id,source_url,source_engine").eq("organisation_id", organisationId),
      supabaseAdmin.from("growth_targets").select("linkedin_url,linkedin_identity").eq("organisation_id", organisationId),
      supabaseAdmin.from("inbox_items").select("permalink,linkedin_identity").eq("organisation_id", organisationId).eq("platform", "linkedin").eq("kind", "connection_accepted"),
    ]);
    if (profileError || acquisitionError || targetError || responseReadError) throw profileError || acquisitionError || targetError || responseReadError;
    const profile = toGenerationProfile(normaliseProfile(storedProfile?.profile));
    const knownProfiles = new Set<string>([
      ...(existingAcquisition || []).map(item => canonicalLinkedInProfile(item.source_url || "")),
      ...(targets || []).flatMap(item => [item.linkedin_identity || "", canonicalLinkedInProfile(item.linkedin_url || "")]),
      ...((Array.isArray(body.known_profile_urls) ? body.known_profile_urls : []).filter(value => typeof value === "string") as string[]).map(canonicalLinkedInProfile),
    ].filter(Boolean));
    const existingIds = new Set((existingAcquisition || []).filter(item => item.source_engine === "linkedin_connection_network").map(item => item.source_record_id));
    const suggestions = uniqueLinkedInSuggestions(parsed, existingIds, knownProfiles)
      .filter(candidate => qualifiesForBuyerTargeting(candidate, { audience: profile.customers.audience, priorityServices: profile.offer.priorityServices, customerProblems: profile.customers.problems, geography: profile.business.geography }).relevant)
      .map(candidate => ({ ...buildLinkedInCandidateRecord(parsed, candidate), organisation_id: organisationId, status: "new" }));

    const existingResponseIdentities = new Set((existingResponses || []).flatMap(item => [item.linkedin_identity || "", canonicalLinkedInAcceptanceProfile(item.permalink || "")]).filter(Boolean));
    const acceptedRows = parsed.acceptedConnections.filter(contact => !existingResponseIdentities.has(canonicalLinkedInAcceptanceProfile(contact.profileUrl))).map(contact => {
      const identity = canonicalLinkedInAcceptanceProfile(contact.profileUrl);
      const sourceRecordId = linkedinAcceptanceSourceRecordId(contact.profileUrl);
      return {
        id: randomUUID(), organisation_id: organisationId, platform: "linkedin", kind: "connection_accepted", status: "needs_reply",
        text: `LinkedIn connection accepted by ${contact.name}.`, author_name: contact.name,
        author_handle: contact.headline || null, permalink: contact.profileUrl, external_id: sourceRecordId,
        linkedin_identity: identity, linkedin_message_url: contact.messageUrl,
        created_at_platform: parsed.discoveredAt, inserted_at: new Date().toISOString(), post_text: contact.headline || null,
        post_id: null, raw: { source_engine: sourceEngine, source_type: "linkedin_connection_accepted", source_format: parsed.sourceFormat, source_gmail_message_id: parsed.gmailMessageId, digest_date: parsed.discoveredAt, profile_url: contact.profileUrl, canonical_profile_url: identity, message_url: contact.messageUrl, headline: contact.headline, company: contact.company || null },
        proposed_response: acceptedConnectionDraft(contact), response_state: "needs_reply", email_message_id: `${parsed.gmailMessageId}:${sourceRecordId}`, source_engine: sourceEngine,
      };
    });
    const { data: responses, error: responseError } = acceptedRows.length ? await supabaseAdmin.from("inbox_items").upsert(acceptedRows, { onConflict: "organisation_id,linkedin_identity", ignoreDuplicates: true }).select("id") : { data: [], error: null };
    if (responseError) throw responseError;
    const { data: inserted, error: insertError } = suggestions.length ? await supabaseAdmin.from("acquisition_items").upsert(suggestions, { onConflict: "organisation_id,source_engine,source_record_id", ignoreDuplicates: true }).select("id") : { data: [], error: null };
    if (insertError) throw insertError;
    return NextResponse.json({ success: true, sourceFormat: parsed.sourceFormat, acceptedConnectionsDetected: parsed.acceptedConnections.length, acceptedConnectionsRecorded: responses?.length || 0, acceptedConnectionsDuplicate: parsed.acceptedConnections.length - (responses?.length || 0), candidatesInserted: inserted?.length || 0, candidatesFilteredOrDuplicate: parsed.suggestions.length - (inserted?.length || 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof IngestionError ? error.message : "Unable to import LinkedIn acceptance." }, { status: error instanceof IngestionError ? error.status : 503 });
  }
}
