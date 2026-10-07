import { IngestionError, parseIngestion, recordTypes, uuid } from "@/lib/growthIngestion.server";

const fields = ["person", "company", "linkedin", "website", "email", "note"] as const;
export type ManualInput = Record<typeof fields[number], string>;
export type ManualSource = { url:string; title:string; sourceType:"official"|"reputable"|"other"; publishedAt:string|null };
export type ManualFact = { claim:string; category:"identity"|"fit"|"signal"|"route"|"role"|"counterevidence"; sourceUrls:string[] };
export type ManualReview = {
  userProvided: ManualInput;
  verifiedFacts: ManualFact[];
  publicSources: ManualSource[];
  aiSuggestions: string[];
  suggestedType: string|null;
  summary?: string;
  fit?: string;
  currentSignal?: string;
  recommendedRoute?: string;
  contraryEvidence?: string[];
  missingEvidence?: string[];
  decision?: "ready"|"needs_verification"|"hold";
  research: { status:string; message:string; searchedAt?:string; searchCalls?:number };
};

export function publicBusinessUrl(value: string, linkedin = false) {
  if (!value.trim()) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new IngestionError("Enter a complete public HTTP(S) URL."); }
  const host = url.hostname.toLowerCase();
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || !host.includes(".") ||
    /^(?:\d|\[)/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) throw new IngestionError("Use a public business URL without credentials, local addresses or custom ports.");
  if (linkedin && (!/^(?:www\.)?linkedin\.com$/.test(host) || !/^\/(?:in|company)\/[^/]+\/?$/.test(url.pathname))) throw new IngestionError("Use a LinkedIn person or company profile URL.");
  return url.href;
}
export function parseManualInput(value: unknown): ManualInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IngestionError("Enter opportunity details.");
  const data = value as Record<string,unknown>;
  const result = Object.fromEntries(fields.map(key => {
    const v = data[key] ?? "";
    const max = key === "note" ? 6000 : ["linkedin", "website"].includes(key) ? 2048 : 500;
    if (typeof v !== "string" || v.length > max) throw new IngestionError(`Invalid ${key}.`);
    return [key, v];
  })) as ManualInput;
  if (!fields.some(key => result[key].trim())) throw new IngestionError("Enter at least one detail.");
  publicBusinessUrl(result.website); publicBusinessUrl(result.linkedin, true);
  if (result.email.trim() && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(result.email.trim())) throw new IngestionError("Enter one valid email address.");
  return result;
}
export function manualReview(input: ManualInput, requestedResearch: boolean): ManualReview {
  return { userProvided: input, verifiedFacts: [], publicSources: [], aiSuggestions: [], suggestedType: null,
    research: { status: requestedResearch ? "unavailable" : "not_performed", message: requestedResearch ? "Public research is unavailable. Nothing has been independently verified." : "Research not performed. All details are user-provided and unverified." } };
}
function short(value: unknown, max:number) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
function stringList(value: unknown, maxItems=12, maxLength=1000) {
  return Array.isArray(value) ? value.filter(v=>typeof v==="string").slice(0,maxItems).map(v=>v.trim().slice(0,maxLength)).filter(Boolean) : [];
}
export function parseManualResearchReview(value: unknown, input: ManualInput): ManualReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return manualReview(input, true);
  const raw=value as Record<string,unknown>, research=raw.research && typeof raw.research==="object" ? raw.research as Record<string,unknown> : {};
  if (research.status !== "completed") return manualReview(input, true);
  const sources = Array.isArray(raw.publicSources) ? raw.publicSources.slice(0,12).flatMap(source=>{
    if (!source || typeof source!=="object" || Array.isArray(source)) return [];
    const s=source as Record<string,unknown>, url=short(s.url,2048); if(!url)return [];
    try { publicBusinessUrl(url); } catch { return []; }
    const sourceType=["official","reputable","other"].includes(String(s.sourceType)) ? s.sourceType as ManualSource["sourceType"] : "other";
    return [{url,title:short(s.title,500)||url,sourceType,publishedAt:short(s.publishedAt,64)||null}];
  }) : [];
  const allowedUrls=new Set(sources.map(s=>s.url));
  const verifiedFacts = Array.isArray(raw.verifiedFacts) ? raw.verifiedFacts.slice(0,20).flatMap(fact=>{
    if(!fact || typeof fact!=="object" || Array.isArray(fact))return [];
    const f=fact as Record<string,unknown>, claim=short(f.claim,1200), category=String(f.category);
    if(!claim || !["identity","fit","signal","route","role","counterevidence"].includes(category))return [];
    const sourceUrls=stringList(f.sourceUrls,6,2048).filter(url=>allowedUrls.has(url));
    return sourceUrls.length ? [{claim,category:category as ManualFact["category"],sourceUrls}] : [];
  }) : [];
  const decision=["ready","needs_verification","hold"].includes(String(raw.decision)) ? raw.decision as ManualReview["decision"] : "needs_verification";
  const suggestedType=recordTypes.includes(raw.suggestedType as typeof recordTypes[number]) ? String(raw.suggestedType) : null;
  return {
    userProvided: input, verifiedFacts, publicSources:sources, aiSuggestions:stringList(raw.aiSuggestions,8,800), suggestedType,
    summary:short(raw.summary,2400), fit:short(raw.fit,1600), currentSignal:short(raw.currentSignal,1600),
    recommendedRoute:short(raw.recommendedRoute,1600), contraryEvidence:stringList(raw.contraryEvidence,8,1000),
    missingEvidence:stringList(raw.missingEvidence,8,1000), decision,
    research:{status:"completed",message:short(research.message,1200)||"Public research completed. Review the evidence before creating the opportunity.",searchedAt:short(research.searchedAt,64)||undefined,searchCalls:Number.isFinite(Number(research.searchCalls))?Math.min(2,Math.max(0,Number(research.searchCalls))):undefined},
  };
}
export function manualRecord(organisationId: string, actor: string, body: Record<string,unknown>) {
  const input = parseManualInput(body.input);
  if (!uuid.test(String(body.submissionId || ""))) throw new IngestionError("Invalid submission ID.");
  if (body.confirmed !== true || !recordTypes.includes(body.recordType as typeof recordTypes[number])) throw new IngestionError("Choose and confirm the opportunity type.");
  if (body.publicContextConfirmed !== true) throw new IngestionError("Confirm public business/professional or non-personal demand context.");
  if (["personal_opportunity", "social_opportunity"].includes(String(body.recordType)) && (input.person.trim() || input.email.trim() || input.linkedin.trim())) throw new IngestionError("Personal/Social opportunities must describe public demand or content, not named consumer prospects. Remove person, email and LinkedIn fields.");
  const review = body.requestedResearch === true ? parseManualResearchReview(body.review,input) : manualReview(input,false);
  const evidenceParts:string[]=[];
  if(input.note.trim())evidenceParts.push(`User-provided information (not independently verified):\n${input.note}`);
  if(review.verifiedFacts.length)evidenceParts.push(`Public research evidence:\n${review.verifiedFacts.map(f=>`- ${f.claim}`).join("\n")}`);
  const { records } = parseIngestion({ organisation_id: organisationId, records: [{
    source_engine: "manual_ops", source_record_id: `manual:${body.submissionId}`, record_type: body.recordType, status: "new",
    entity: input.company.trim() || input.person.trim() || input.note.trim().slice(0,160) || input.website.trim() || input.linkedin.trim() || input.email.trim(),
    person: input.person || null, company: input.company || null,
    source_url: publicBusinessUrl(input.linkedin, true) || publicBusinessUrl(input.website) || review.publicSources.find(s=>s.sourceType==="official")?.url || null,
    evidence: evidenceParts.join("\n\n") || "User-provided opportunity. No independent verification performed.",
    suggested_action: review.recommendedRoute || "Review the supplied context and verify identity/evidence before outreach.",
    reason: review.summary || null, signal: review.currentSignal || null,
    metadata: { user_provided: input, manual_review: review, created_by: actor, public_context_confirmed: true,
      ...(input.email.trim() ? { email: input.email.trim() } : {}), ...(input.linkedin.trim() ? { linkedin_url: publicBusinessUrl(input.linkedin,true) } : {}) },
  }] });
  return records[0];
}
