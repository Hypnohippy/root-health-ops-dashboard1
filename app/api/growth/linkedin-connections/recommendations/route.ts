import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeIngestion, readIngestionBody, IngestionError, uuid } from "@/lib/growthIngestion.server";
import { canonicalLinkedInAcceptanceProfile, qualifiesForBuyerTargeting } from "@/lib/linkedinConnectionDiscovery";
import { parseLinkedInRecommendations, verifiedLinkedInProfile, linkedinRecommendationId } from "@/lib/linkedinCapture";
import { normaliseProfile, toGenerationProfile } from "@/lib/brandGrowthProfile";

export async function POST(req: Request) {
  try {
    const body = await readIngestionBody(req) as Record<string, unknown>;
    const org = typeof body.organisation_id === "string" ? body.organisation_id.toLowerCase() : "";
    if (!uuid.test(org) || body.source_engine !== "root_health_b2b") throw new IngestionError("Supply the scoped organisation and existing B2B Gmail source.");
    authorizeIngestion(req.headers.get("authorization"), org, ["root_health_b2b"]);
    for (const [key, limit] of [["subject", 1000], ["sender", 500], ["html", 200000], ["gmail_message_id", 500], ["discovered_at", 100]] as const) {
      if (typeof body[key] !== "string" || !body[key] || (body[key] as string).length > limit) throw new IngestionError(`Invalid ${key}.`);
    }
    if (!Number.isFinite(Date.parse(body.discovered_at as string))) throw new IngestionError("Invalid discovered_at.");
    const people = parseLinkedInRecommendations({ subject: body.subject as string, sender: body.sender as string, html: body.html as string, gmailMessageId: body.gmail_message_id as string, discoveredAt: body.discovered_at as string });
    if (!people.length) return NextResponse.json({ success: true, detected: 0, inserted: 0, skipped: 0 });
    const results = await Promise.all([
      supabaseAdmin.from("organisation_profiles").select("profile").eq("organisation_id", org).maybeSingle(),
      supabaseAdmin.from("acquisition_items").select("source_url,metadata").eq("organisation_id", org),
      supabaseAdmin.from("growth_targets").select("linkedin_url,linkedin_identity").eq("organisation_id", org),
      supabaseAdmin.from("inbox_items").select("permalink,linkedin_identity").eq("organisation_id", org).eq("platform", "linkedin"),
    ]);
    if (results.some(result => result.error)) throw Error("Dedupe lookup failed.");
    const profile = toGenerationProfile(normaliseProfile(results[0].data?.profile));
    const known = new Set<string>([
      ...(results[1].data || []).flatMap(row => [row.source_url, row.metadata?.profile_url, row.metadata?.linkedin_url].filter(value => typeof value === "string").map(value => canonicalLinkedInAcceptanceProfile(value))),
      ...(results[2].data || []).flatMap(row => [row.linkedin_identity || "", canonicalLinkedInAcceptanceProfile(row.linkedin_url || "")]),
      ...(results[3].data || []).flatMap(row => [row.linkedin_identity || "", canonicalLinkedInAcceptanceProfile(row.permalink || "")]),
    ].filter(Boolean));
    const decisions = people.map(person => ({ person, duplicate: known.has(canonicalLinkedInAcceptanceProfile(person.profileUrl)),
      qualification: qualifiesForBuyerTargeting(person, { audience: profile.customers.audience, priorityServices: profile.offer.priorityServices, customerProblems: profile.customers.problems, geography: profile.business.geography }) }));
    const records = decisions.filter(item => !item.duplicate && item.qualification.relevant).map(({ person }) => ({
      organisation_id: org, source_engine: "linkedin_connection_recommendation", source_record_id: linkedinRecommendationId(person.profileUrl), source_url: verifiedLinkedInProfile(person.profileUrl),
      record_type: "personal_opportunity", status: "new", person: person.name, entity: person.name, company: person.company || null,
      signal: person.headline, reason: "LinkedIn recommended this public professional profile; role/context matches this organisation's existing targeting rules.",
      suggested_action: "Review the profile and draft a connection note. Send an invitation yourself only if appropriate.",
      metadata: { source_type: "linkedin_connection_recommendation", headline: person.headline, company: person.company || null, profile_url: person.profileUrl,
        source_gmail_message_id: body.gmail_message_id, discovered_at: body.discovered_at, acceptance_verified: false },
    }));
    const { data, error } = records.length ? await supabaseAdmin.from("acquisition_items").upsert(records, { onConflict: "organisation_id,source_engine,source_record_id", ignoreDuplicates: true }).select("id") : { data: [], error: null };
    if (error) throw error;
    return NextResponse.json({ success: true, detected: people.length, inserted: data?.length || 0, skipped: people.length - (data?.length || 0),
      decisions: decisions.map(({ person, duplicate, qualification }) => ({ name: person.name, profile: person.profileUrl, reason: duplicate ? "Existing contact/opportunity" : !qualification.relevant ? "Target role/context not qualified" : "Qualified recommendation" })) });
  } catch (error) { return NextResponse.json({ error: error instanceof IngestionError ? error.message : "Recommendation import failed; no acceptance was inferred." }, { status: error instanceof IngestionError ? error.status : 503 }); }
}
