import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeIngestion, IngestionError, readIngestionBody, uuid } from "@/lib/growthIngestion.server";
import { normaliseProfile, toGenerationProfile } from "@/lib/brandGrowthProfile";
import { acceptedConnectionDraft, buildLinkedInCandidateRecord, parseLinkedInAcceptanceEmail, qualifiesForBuyerTargeting, uniqueLinkedInSuggestions } from "@/lib/linkedinConnectionDiscovery";
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

    const [{ data: storedProfile, error: profileError }, { data: existingAcquisition, error: acquisitionError }, { data: targets, error: targetError }] = await Promise.all([
      supabaseAdmin.from("organisation_profiles").select("profile").eq("organisation_id", organisationId).maybeSingle(),
      supabaseAdmin.from("acquisition_items").select("source_record_id,source_url").eq("organisation_id", organisationId).eq("source_engine", "linkedin_connection_network"),
      supabaseAdmin.from("growth_targets").select("linkedin_url").eq("organisation_id", organisationId),
    ]);
    if (profileError || acquisitionError || targetError) throw profileError || acquisitionError || targetError;
    const profile = toGenerationProfile(normaliseProfile(storedProfile?.profile));
    const knownProfiles = new Set<string>([
      ...(existingAcquisition || []).map(item => canonicalLinkedInProfile(item.source_url || "")),
      ...(targets || []).map(item => canonicalLinkedInProfile(item.linkedin_url || "")),
      ...((Array.isArray(body.known_profile_urls) ? body.known_profile_urls : []).filter(value => typeof value === "string") as string[]).map(canonicalLinkedInProfile),
    ].filter(Boolean));
    const existingIds = new Set((existingAcquisition || []).map(item => item.source_record_id));
    const suggestions = uniqueLinkedInSuggestions(parsed, existingIds, knownProfiles)
      .filter(candidate => qualifiesForBuyerTargeting(candidate, { audience: profile.customers.audience, priorityServices: profile.offer.priorityServices, customerProblems: profile.customers.problems, geography: profile.business.geography }).relevant)
      .map(candidate => ({ ...buildLinkedInCandidateRecord(parsed, candidate), organisation_id: organisationId, status: "new" }));

    const responseRow = {
      id: randomUUID(), organisation_id: organisationId, platform: "linkedin", kind: "connection_accepted", status: "needs_reply",
      text: `LinkedIn connection accepted by ${parsed.accepted.name}.`, author_name: parsed.accepted.name,
      author_handle: parsed.accepted.headline || null, permalink: parsed.accepted.profileUrl, external_id: parsed.gmailMessageId,
      created_at_platform: parsed.discoveredAt, inserted_at: new Date().toISOString(), post_text: parsed.accepted.headline || null,
      post_id: null, raw: { source_engine: sourceEngine, gmail_message_id: parsed.gmailMessageId, profile_url: parsed.accepted.profileUrl, message_url: parsed.accepted.messageUrl },
      proposed_response: acceptedConnectionDraft(parsed.accepted), response_state: "needs_reply", email_message_id: parsed.gmailMessageId, source_engine: sourceEngine,
    };
    const { data: response, error: responseError } = await supabaseAdmin.from("inbox_items").upsert(responseRow, { onConflict: "organisation_id,email_message_id", ignoreDuplicates: true }).select("id");
    if (responseError) throw responseError;
    const { data: inserted, error: insertError } = suggestions.length ? await supabaseAdmin.from("acquisition_items").upsert(suggestions, { onConflict: "organisation_id,source_engine,source_record_id", ignoreDuplicates: true }).select("id") : { data: [], error: null };
    if (insertError) throw insertError;
    return NextResponse.json({ success: true, acceptedConnectionRecorded: Boolean(response?.length), candidatesInserted: inserted?.length || 0, candidatesFilteredOrDuplicate: parsed.suggestions.length - (inserted?.length || 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof IngestionError ? error.message : "Unable to import LinkedIn acceptance." }, { status: error instanceof IngestionError ? error.status : 503 });
  }
}
