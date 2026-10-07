import { IngestionError, parseIngestion, recordTypes, uuid } from "@/lib/growthIngestion.server";

const fields = ["person", "company", "linkedin", "website", "email", "note"] as const;
export type ManualInput = Record<typeof fields[number], string>;
export type ManualSource = { url:string; title:string; sourceType:"official"|"reputable"|"other"; publishedAt:string|null };
export type ManualFact = { claim:string; category:"identity"|"fit"|"signal"|"route"|"role"|"counterevidence"|"alignment"|"continuity"|"operational_gap"|"root_fit"|"organisational_change"; sourceUrls:string[] };
export type ManualPhoneRoute = {
  number:string;
  routeType:"direct_person"|"local_office"|"regional_office"|"global_hq"|"unknown";
  location?:string|null;
  geographyMatch:"matched"|"mismatch"|"unknown";
  forwardingStatus:"verified"|"not_verified"|"not_applicable";
  note?:string|null;
  sourceUrls:string[];
};
export type ManualContactRoute = {
  directEmail?: string|null;
  emailStatus:"verified"|"inferred_pattern"|"not_found";
  inferredEmail?: string|null;
  emailConfidence?:"high"|"medium"|"low"|null;
  personLocation?:string|null;
  publicPhone?: string|null;
  phoneRoutes?:ManualPhoneRoute[];
  officialContactUrl?: string|null;
  linkedinUrl?: string|null;
  note?: string|null;
  sourceUrls:string[];
};
export type ManualPersonCandidate = {
  name:string;
  role:string;
  relevance:string;
  seniority:"operational_buyer"|"senior_sponsor"|"adjacent"|"unknown";
  geography:"target_market"|"global"|"other"|"unknown";
  functionalFit:"direct"|"strong"|"adjacent"|"unknown";
  buyingProximity:"owner"|"buyer"|"sponsor"|"adjacent"|"unknown";
  score:number;
  sourceUrls:string[];
  publicProfileUrl?:string|null;
  contact?:ManualContactRoute|null;
};
export type ManualReview = {
  userProvided: ManualInput;
  verifiedFacts: ManualFact[];
  publicSources: ManualSource[];
  aiSuggestions: string[];
  suggestedType: string|null;
  summary?: string;
  fit?: string;
  currentSignal?: string;
  strategicAlignment?: string;
  strategicAlignmentScore?: number;
  strategicContinuity?: { fromYear:number|null; toYear:number|null; summary:string; sourceUrls:string[] };
  organisationalChange?: { status:"active"|"recent"|"none_found"|"unknown"; type:string; summary:string; relevance:string; sourceUrls:string[] };
  operationalGap?: string;
  rootFit?: string;
  researchQuestions?: string[];
  evidenceConfidence?: "high"|"medium"|"low";
  opportunityScore?: number;
  scoreBreakdown?: { strategicAlignment:number; problemRelevance:number; operationalOpportunity:number; decisionMakerQuality:number; currentSignal:number };
  outreachAngle?: string;
  recommendedRoute?: string;
  contraryEvidence?: string[];
  missingEvidence?: string[];
  people?: ManualPersonCandidate[];
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
function contactRoute(value:unknown,allowedUrls:Set<string>):ManualContactRoute|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const c=value as Record<string,unknown>,status=String(c.emailStatus);
  const emailStatus=["verified","inferred_pattern","not_found"].includes(status)?status as ManualContactRoute["emailStatus"]:"not_found";
  const sourceUrls=stringList(c.sourceUrls,8,2048).filter(url=>allowedUrls.has(url));
  const confidence=["high","medium","low"].includes(String(c.emailConfidence))?String(c.emailConfidence) as ManualContactRoute["emailConfidence"]:null;
  const phoneRoutes=Array.isArray(c.phoneRoutes)?c.phoneRoutes.slice(0,8).flatMap(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return[];
    const p=v as Record<string,unknown>,number=short(p.number,200),routeType=String(p.routeType),geographyMatch=String(p.geographyMatch),forwardingStatus=String(p.forwardingStatus);
    const phoneSourceUrls=stringList(p.sourceUrls,6,2048).filter(url=>allowedUrls.has(url));
    if(!number||!phoneSourceUrls.length)return[];
    return [{number,
      routeType:["direct_person","local_office","regional_office","global_hq","unknown"].includes(routeType)?routeType as ManualPhoneRoute["routeType"]:"unknown",
      location:short(p.location,500)||null,
      geographyMatch:["matched","mismatch","unknown"].includes(geographyMatch)?geographyMatch as ManualPhoneRoute["geographyMatch"]:"unknown",
      forwardingStatus:["verified","not_verified","not_applicable"].includes(forwardingStatus)?forwardingStatus as ManualPhoneRoute["forwardingStatus"]:"not_verified",
      note:short(p.note,800)||null,sourceUrls:phoneSourceUrls}];
  }):[];
  return {
    directEmail:short(c.directEmail,500)||null,emailStatus,inferredEmail:short(c.inferredEmail,500)||null,emailConfidence:confidence,
    personLocation:short(c.personLocation,500)||null,publicPhone:short(c.publicPhone,200)||phoneRoutes[0]?.number||null,phoneRoutes,
    officialContactUrl:short(c.officialContactUrl,2048)||null,
    linkedinUrl:short(c.linkedinUrl,2048)||null,note:short(c.note,1200)||null,sourceUrls
  };
}
export function parseManualResearchReview(value: unknown, input: ManualInput): ManualReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return manualReview(input, true);
  const raw=value as Record<string,unknown>, research=raw.research && typeof raw.research==="object" ? raw.research as Record<string,unknown> : {};
  if (research.status !== "completed") return manualReview(input, true);
  const sources = Array.isArray(raw.publicSources) ? raw.publicSources.slice(0,24).flatMap(source=>{
    if (!source || typeof source!=="object" || Array.isArray(source)) return [];
    const s=source as Record<string,unknown>, url=short(s.url,2048); if(!url)return [];
    try { publicBusinessUrl(url); } catch { return []; }
    const sourceType=["official","reputable","other"].includes(String(s.sourceType)) ? s.sourceType as ManualSource["sourceType"] : "other";
    return [{url,title:short(s.title,500)||url,sourceType,publishedAt:short(s.publishedAt,64)||null}];
  }) : [];
  const allowedUrls=new Set(sources.map(s=>s.url));
  const verifiedFacts = Array.isArray(raw.verifiedFacts) ? raw.verifiedFacts.slice(0,36).flatMap(fact=>{
    if(!fact || typeof fact!=="object" || Array.isArray(fact))return [];
    const f=fact as Record<string,unknown>, claim=short(f.claim,1200), category=String(f.category);
    if(!claim || !["identity","fit","signal","route","role","counterevidence","alignment","continuity","operational_gap","root_fit","organisational_change"].includes(category))return [];
    const sourceUrls=stringList(f.sourceUrls,6,2048).filter(url=>allowedUrls.has(url));
    return sourceUrls.length ? [{claim,category:category as ManualFact["category"],sourceUrls}] : [];
  }) : [];
  const people = Array.isArray(raw.people) ? raw.people.slice(0,10).flatMap(candidate=>{
    if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return [];
    const c=candidate as Record<string,unknown>, name=short(c.name,300), role=short(c.role,500), relevance=short(c.relevance,1200);
    const sourceUrls=stringList(c.sourceUrls,6,2048).filter(url=>allowedUrls.has(url));
    const seniority=["operational_buyer","senior_sponsor","adjacent","unknown"].includes(String(c.seniority))?String(c.seniority) as ManualPersonCandidate["seniority"]:"unknown";
    const geography=["target_market","global","other","unknown"].includes(String(c.geography))?String(c.geography) as ManualPersonCandidate["geography"]:"unknown";
    const functionalFit=["direct","strong","adjacent","unknown"].includes(String(c.functionalFit))?String(c.functionalFit) as ManualPersonCandidate["functionalFit"]:"unknown";
    const buyingProximity=["owner","buyer","sponsor","adjacent","unknown"].includes(String(c.buyingProximity))?String(c.buyingProximity) as ManualPersonCandidate["buyingProximity"]:"unknown";
    const score=Number.isFinite(Number(c.score))?Math.max(0,Math.min(100,Number(c.score))):0;
    const profile=short(c.publicProfileUrl,2048); let publicProfileUrl:string|null=null;
    if(profile&&allowedUrls.has(profile)){try{publicBusinessUrl(profile,true);publicProfileUrl=profile;}catch{}}
    return name&&role&&sourceUrls.length?[{name,role,relevance,seniority,geography,functionalFit,buyingProximity,score,sourceUrls,publicProfileUrl,contact:contactRoute(c.contact,allowedUrls)}]:[];
  }).sort((a,b)=>b.score-a.score) : [];
  const decision=["ready","needs_verification","hold"].includes(String(raw.decision)) ? raw.decision as ManualReview["decision"] : "needs_verification";
  const suggestedType=recordTypes.includes(raw.suggestedType as typeof recordTypes[number]) ? String(raw.suggestedType) : null;
  return {
    userProvided: input, verifiedFacts, publicSources:sources, aiSuggestions:stringList(raw.aiSuggestions,8,800), suggestedType,
    summary:short(raw.summary,2400), fit:short(raw.fit,1600), currentSignal:short(raw.currentSignal,1600),
    strategicAlignment:short(raw.strategicAlignment,2400),
    strategicAlignmentScore:Number.isFinite(Number(raw.strategicAlignmentScore))?Math.max(0,Math.min(100,Number(raw.strategicAlignmentScore))):undefined,
    strategicContinuity:raw.strategicContinuity&&typeof raw.strategicContinuity==="object"&&!Array.isArray(raw.strategicContinuity)?(()=>{const v=raw.strategicContinuity as Record<string,unknown>,sourceUrls=stringList(v.sourceUrls,12,2048).filter(url=>allowedUrls.has(url));return {fromYear:Number.isFinite(Number(v.fromYear))?Number(v.fromYear):null,toYear:Number.isFinite(Number(v.toYear))?Number(v.toYear):null,summary:short(v.summary,1800),sourceUrls};})():undefined,
    organisationalChange:raw.organisationalChange&&typeof raw.organisationalChange==="object"&&!Array.isArray(raw.organisationalChange)?(()=>{const v=raw.organisationalChange as Record<string,unknown>,status=String(v.status),sourceUrls=stringList(v.sourceUrls,12,2048).filter(url=>allowedUrls.has(url));return {status:["active","recent","none_found","unknown"].includes(status)?status as NonNullable<ManualReview["organisationalChange"]>["status"]:"unknown",type:short(v.type,500),summary:short(v.summary,1800),relevance:short(v.relevance,1800),sourceUrls};})():undefined,
    operationalGap:short(raw.operationalGap,2200), rootFit:short(raw.rootFit,2200), researchQuestions:stringList(raw.researchQuestions,10,500),
    evidenceConfidence:["high","medium","low"].includes(String(raw.evidenceConfidence))?String(raw.evidenceConfidence) as ManualReview["evidenceConfidence"]:undefined,
    opportunityScore:Number.isFinite(Number(raw.opportunityScore))?Math.max(0,Math.min(100,Number(raw.opportunityScore))):undefined,
    scoreBreakdown:raw.scoreBreakdown&&typeof raw.scoreBreakdown==="object"&&!Array.isArray(raw.scoreBreakdown)?(()=>{const v=raw.scoreBreakdown as Record<string,unknown>;return {strategicAlignment:Math.max(0,Math.min(30,Number(v.strategicAlignment)||0)),problemRelevance:Math.max(0,Math.min(25,Number(v.problemRelevance)||0)),operationalOpportunity:Math.max(0,Math.min(20,Number(v.operationalOpportunity)||0)),decisionMakerQuality:Math.max(0,Math.min(15,Number(v.decisionMakerQuality)||0)),currentSignal:Math.max(0,Math.min(10,Number(v.currentSignal)||0))};})():undefined,
    outreachAngle:short(raw.outreachAngle,1800),
    recommendedRoute:short(raw.recommendedRoute,1600), contraryEvidence:stringList(raw.contraryEvidence,8,1000),
    missingEvidence:stringList(raw.missingEvidence,8,1000), people, decision,
    research:{status:"completed",message:short(research.message,1200)||"Public research completed. Review the evidence before creating the opportunity.",searchedAt:short(research.searchedAt,64)||undefined,searchCalls:Number.isFinite(Number(research.searchCalls))?Math.min(8,Math.max(0,Number(research.searchCalls))):undefined},
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
