import { getOrganisationGenerationProfile } from "@/lib/organisationProfile.server";
import { manualReview, publicBusinessUrl, parseManualResearchReview, type ManualContactRoute, type ManualFact, type ManualInput, type ManualPersonCandidate, type ManualPhoneRoute, type ManualReview, type ManualSource } from "@/lib/manualAcquisition";

const FREE_MAIL=new Set(["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","aol.com","proton.me","protonmail.com"]);
const text=(v:unknown,max=2000)=>typeof v==="string"?v.trim().slice(0,max):"";
const list=(v:unknown,max=10)=>Array.isArray(v)?v.filter(x=>typeof x==="string").slice(0,max).map(x=>x.trim()).filter(Boolean):[];
const emailOk=(v:string)=>/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
function businessContext(input:ManualInput){
  if(input.company.trim()||input.website.trim()||input.linkedin.trim())return true;
  const domain=input.email.trim().split("@")[1]?.toLowerCase();return !!domain&&!FREE_MAIL.has(domain);
}
function websiteHost(input:ManualInput){
  try{return input.website.trim()?new URL(input.website.trim()).hostname.toLowerCase().replace(/^www\./,""):null;}catch{return null;}
}
function outputText(result:Record<string,unknown>){
  const direct=text(result.output_text,50000);if(direct)return direct;
  const output=Array.isArray(result.output)?result.output:[];
  for(const item of output)if(item&&typeof item==="object"){
    const content=Array.isArray((item as Record<string,unknown>).content)?(item as Record<string,unknown>).content as unknown[]:[];
    for(const part of content)if(part&&typeof part==="object"&&text((part as Record<string,unknown>).text,50000))return text((part as Record<string,unknown>).text,50000);
  }
  return "";
}
function parseJsonObject(raw:string):Record<string,unknown>|null{
  const trimmed=raw.trim();
  const candidates=[trimmed,trimmed.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"")];
  const first=trimmed.indexOf("{"),last=trimmed.lastIndexOf("}");
  if(first>=0&&last>first)candidates.push(trimmed.slice(first,last+1));
  for(const candidate of candidates){try{const parsed=JSON.parse(candidate);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed as Record<string,unknown>;}catch{}}
  return null;
}
function searchSources(value:unknown){
  const found=new Map<string,{url:string;title:string}>();
  function walk(v:unknown){
    if(!v||typeof v!=="object")return;
    if(Array.isArray(v)){v.forEach(walk);return;}
    const o=v as Record<string,unknown>,url=text(o.url,2048),title=text(o.title,500);
    if(url){try{publicBusinessUrl(url);found.set(url,{url,title:title||url});}catch{}}
    Object.values(o).forEach(walk);
  }
  walk(value);return found;
}
function companyDomainMatches(email:string,input:ManualInput){
  if(!emailOk(email))return false;
  const domain=email.split("@")[1].toLowerCase(),host=websiteHost(input);
  if(FREE_MAIL.has(domain))return false;
  return !host||host===domain||host.endsWith(`.${domain}`)||domain.endsWith(`.${host}`);
}
function normalizeNamePart(v:string){return v.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
export function inferWorkEmail(name:string,formatHint:string,input:ManualInput){
  const hint=formatHint.trim().toLowerCase();
  if(!hint)return null;
  if(!/^(?:firstname|first|f|firstinitial)[._-]?(?:lastname|last|l|lastinitial)@[^\s@]+\.[^\s@]+$/.test(hint) &&
     !/^(?:lastname|last|l|lastinitial)[._-]?(?:firstname|first|f|firstinitial)@[^\s@]+\.[^\s@]+$/.test(hint))return null;
  const [local,domain]=hint.split("@"),host=websiteHost(input);
  if(!domain||FREE_MAIL.has(domain)||(host&&!(host===domain||host.endsWith(`.${domain}`)||domain.endsWith(`.${host}`))))return null;
  const parts=name.trim().split(/\s+/).filter(Boolean);if(parts.length<2)return null;
  const first=normalizeNamePart(parts[0]),last=normalizeNamePart(parts[parts.length-1]);if(!first||!last)return null;
  let generated=local;
  generated=generated.replace(/firstinitial/g,first[0]).replace(/lastinitial/g,last[0]);
  generated=generated.replace(/firstname/g,first).replace(/lastname/g,last);
  generated=generated.replace(/(^|[._-])first(?=$|[._-])/g,`$1${first}`).replace(/(^|[._-])last(?=$|[._-])/g,`$1${last}`);
  generated=generated.replace(/(^|[._-])f(?=$|[._-])/g,`$1${first[0]}`).replace(/(^|[._-])l(?=$|[._-])/g,`$1${last[0]}`);
  const email=`${generated}@${domain}`;
  return emailOk(email)?email:null;
}
function sourceList(parsed:Record<string,unknown>,searched:Map<string,{url:string;title:string}>,max=16){
  return (Array.isArray(parsed.publicSources)?parsed.publicSources:[]).slice(0,max).flatMap(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return[];
    const o=v as Record<string,unknown>,url=text(o.url,2048);if(!url||!searched.has(url))return[];
    const sourceType=["official","reputable","other"].includes(String(o.sourceType))?String(o.sourceType) as ManualSource["sourceType"]:"other";
    return [{url,title:text(o.title,500)||searched.get(url)!.title,sourceType,publishedAt:text(o.publishedAt,64)||null}];
  });
}
function personScore(p:{geography:ManualPersonCandidate["geography"];functionalFit:ManualPersonCandidate["functionalFit"];buyingProximity:ManualPersonCandidate["buyingProximity"];seniority:ManualPersonCandidate["seniority"]}){
  const geo={target_market:30,global:12,other:5,unknown:0}[p.geography];
  const fit={direct:35,strong:25,adjacent:8,unknown:0}[p.functionalFit];
  const buy={owner:30,buyer:25,sponsor:15,adjacent:5,unknown:0}[p.buyingProximity];
  const senior={operational_buyer:5,senior_sponsor:4,adjacent:1,unknown:0}[p.seniority];
  return Math.min(100,geo+fit+buy+senior);
}
function boundedScore(v:unknown,max:number){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0;}
export function currentBuyingSignalScore(review:Pick<ManualReview,"verifiedFacts"|"currentSignal">){
  const groundedSignals=review.verifiedFacts.filter(f=>f.category==="signal");
  if(!groundedSignals.length)return 0;
  const signal=(review.currentSignal||"").toLowerCase();
  const evidence=groundedSignals.map(f=>f.claim.toLowerCase()).join(" ");
  const combined=`${signal} ${evidence}`;
  const explicitlyAbsent=/\bno qualifying\b|\bno current\b.*\bsignal\b|\bno\b[^.]{0,120}\bcurrent\b[^.]{0,80}\bbuying signal\b|\bno\b.*\bbuying signal\b|\bnot evidence of\b.*\bbuying\b|\bnot a buying signal\b|\bnot a public request\b|\bdo not establish a reason to approach now\b|\bdoes not establish a reason to approach now\b|\bdo not show an open buying process\b|\bno public, current statement of need\b|\bno public current statement of need\b/.test(combined);
  if(explicitlyAbsent)return 0;
  const explicitBuying=/\b(procurement|tender|rfp|rfq|request for proposal|request for quotation|vendor search|provider search|seeking (?:an? )?(?:external )?(?:provider|partner|vendor)|inviting (?:bids|proposals)|open call|pilot request|budget approved|budget allocated)\b/.test(combined);
  return explicitBuying?10:0;
}
function sourceConfidence(sources:ManualSource[]):NonNullable<ManualReview["evidenceConfidence"]>{
  const official=sources.filter(s=>s.sourceType==="official").length,reputable=sources.filter(s=>s.sourceType==="reputable").length;
  return official>=2&&sources.length>=4?"high":official>=1&&(sources.length>=2||reputable>=1)?"medium":"low";
}
function yearFrom(value:string|null){const m=value?.match(/\b(20\d{2})\b/);return m?Number(m[1]):null;}
async function repairResearchJson(key:string,raw:string){
  if(!raw.trim())return null;
  const repairPrompt=`Repair ONLY the JSON syntax in the text below.
Do not add, remove, reinterpret or improve any factual claim.
Do not invent sources, URLs, dates, people or programmes.
Preserve the existing wording and values as closely as possible.
Return one valid JSON object only, with no markdown fences or commentary.

TEXT TO REPAIR:
${raw.slice(0,30000)}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",max_output_tokens:5000,input:repairPrompt})});
  if(!response.ok)return null;
  const result=await response.json() as Record<string,unknown>;
  return parseJsonObject(outputText(result));
}
async function deepenOpportunityResearch(key:string,input:ManualInput,profile:unknown,base:ManualReview){
  const prompt=`You are the SECOND PASS of a Root Health commercial research process. The first pass has already established basic identity, fit, current signal and route.

Now answer the questions a human researcher would ask before deciding whether this is a genuinely strong opportunity. Use PUBLIC PROFESSIONAL/BUSINESS information only.

Do not turn absence of a current buying signal into absence of strategic fit.
Separate CURRENT BUYING SIGNAL from HISTORICAL/STRATEGIC ALIGNMENT.

Research:
1. Strategic alignment/history: does the organisation already believe in prevention, employee wellbeing measurement, longitudinal surveys, psychological safety, stress/resilience, or acting on employee feedback?
2. Continuity: if an older relevant source exists, trace whether the same philosophy/programme continued in later years through the present. Search later reports, surveys, official updates and sustainability/people material.
3. Operational gap: what appears to happen AFTER a problem is identified? Look for evidence of delegated wellbeing responsibility, sourcing of interventions, training/content/programmes, local action plans or manual implementation. Clearly label reasonable inference as inference, not verified fact.
4. Root fit: explain specifically what Root could add without duplicating what the organisation already has. Root can detect domain-level patterns across stress, sleep, recovery, energy, mood, focus and burnout; compartmentalise patterns; target interventions/programmes; preserve individual privacy while showing aggregate organisational patterns; and measure change longitudinally.
5. Organisational change: search for recent/active spin-offs, mergers, acquisitions, restructures, major business-unit separations or other structural changes that could alter workforce composition, programme ownership, budgets or procurement. Treat this as an ORGANISATIONAL-CHANGE SIGNAL, not a buying signal. Any commercial relevance must be explicitly labelled inference unless directly stated.
6. Research questions: identify any remaining questions that would materially change whether this is a good opportunity.
7. Outreach angle: state what NOT to sell them, what problem to discuss, and the most credible Root wedge.

Evidence rules:
- Prefer official/primary sources.
- Never claim a speaker said words that are not supported by a transcript/caption/source text.
- Never invent dates, programmes, people, claims or sources.
- Every verified fact must cite a URL found in this search.

Return JSON only:
{
 "strategicAlignment":string,
 "strategicAlignmentScore":number,
 "strategicContinuity":{"fromYear":number|null,"toYear":number|null,"summary":string,"sourceUrls":[string]},
 "organisationalChange":{"status":"active"|"recent"|"none_found"|"unknown","type":string,"summary":string,"relevance":string,"sourceUrls":[string]},
 "operationalGap":string,
 "rootFit":string,
 "researchQuestions":[string],
 "outreachAngle":string,
 "verifiedFacts":[{"claim":string,"category":"alignment"|"continuity"|"operational_gap"|"root_fit"|"organisational_change","sourceUrls":[string]}],
 "publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}]
}

Organisation/input: ${JSON.stringify(input)}
First-pass research: ${JSON.stringify(base).slice(0,18000)}
Root Health context: ${JSON.stringify(profile).slice(0,10000)}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:4,max_output_tokens:5200,
    include:["web_search_call.action.sources"],input:prompt})});
  if(!response.ok)return {...base,research:{...base.research,message:`${base.research.message} Strategic second-pass research could not complete (HTTP ${response.status}); first-pass evidence was preserved.`}};
  const result=await response.json() as Record<string,unknown>,searched=searchSources(result),rawStrategic=outputText(result);
  let parsed=parseJsonObject(rawStrategic);
  let repaired=false;
  if(!parsed){parsed=await repairResearchJson(key,rawStrategic);repaired=!!parsed;}
  if(!parsed)return {...base,research:{...base.research,message:`${base.research.message} Strategic second-pass research remained unreadable after one syntax-repair attempt; first-pass evidence was preserved.`}};
  const extraSources=sourceList(parsed,searched,16),publicSources=[...base.publicSources];
  for(const s of extraSources)if(!publicSources.some(x=>x.url===s.url))publicSources.push(s);
  const allowed=new Set(publicSources.map(s=>s.url));
  const extraFacts:ManualFact[]=(Array.isArray(parsed.verifiedFacts)?parsed.verifiedFacts:[]).slice(0,20).flatMap(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return[];const o=v as Record<string,unknown>,claim=text(o.claim,1200),category=String(o.category),sourceUrls=list(o.sourceUrls,8).filter(url=>allowed.has(url));
    return claim&&sourceUrls.length&&["alignment","continuity","operational_gap","root_fit","organisational_change"].includes(category)?[{claim,category:category as ManualFact["category"],sourceUrls}]:[];
  });
  const verifiedFacts=[...base.verifiedFacts];
  for(const f of extraFacts)if(!verifiedFacts.some(x=>x.category===f.category&&x.claim===f.claim))verifiedFacts.push(f);
  const continuityRaw=parsed.strategicContinuity&&typeof parsed.strategicContinuity==="object"&&!Array.isArray(parsed.strategicContinuity)?parsed.strategicContinuity as Record<string,unknown>:{};
  const continuityUrls=list(continuityRaw.sourceUrls,12).filter(url=>allowed.has(url));
  const sourceYears=publicSources.map(s=>yearFrom(s.publishedAt)).filter((v):v is number=>v!==null);
  const fromYear=Number.isFinite(Number(continuityRaw.fromYear))?Number(continuityRaw.fromYear):sourceYears.length?Math.min(...sourceYears):null;
  const toYear=Number.isFinite(Number(continuityRaw.toYear))?Number(continuityRaw.toYear):sourceYears.length?Math.max(...sourceYears):null;
  const modelAlignment=Math.max(0,Math.min(100,Number(parsed.strategicAlignmentScore)||0));
  const alignmentFacts=extraFacts.filter(f=>f.category==="alignment").length,continuityFacts=extraFacts.filter(f=>f.category==="continuity").length;
  const officialCount=publicSources.filter(s=>s.sourceType==="official").length,span=fromYear&&toYear?Math.max(0,toYear-fromYear):0,currentYear=new Date().getUTCFullYear();
  const newestYear=sourceYears.length?Math.max(...sourceYears):0;
  const groundedAlignment=Math.min(100,(alignmentFacts?45:0)+(alignmentFacts>=2?15:0)+(continuityFacts?10:0)+(span>=3?15:0)+(officialCount>=2?10:0)+(newestYear>=currentYear-1?5:0));
  const alignmentScore=Math.max(modelAlignment,groundedAlignment);
  const strategic=boundedScore(alignmentScore*0.30,30);
  const problem=base.fit||verifiedFacts.some(f=>f.category==="fit")?25:0;
  const operational=text(parsed.operationalGap,2200)?20:0;
  const signal=currentBuyingSignalScore(base);
  const scoreBreakdown={strategicAlignment:strategic,problemRelevance:problem,operationalOpportunity:operational,decisionMakerQuality:0,currentSignal:signal};
  const opportunityScore=Object.values(scoreBreakdown).reduce((a,b)=>a+b,0);
  const changeRaw=parsed.organisationalChange&&typeof parsed.organisationalChange==="object"&&!Array.isArray(parsed.organisationalChange)?parsed.organisationalChange as Record<string,unknown>:{};
  const changeStatus=["active","recent","none_found","unknown"].includes(String(changeRaw.status))?String(changeRaw.status) as NonNullable<ManualReview["organisationalChange"]>["status"]:"unknown";
  const changeUrls=list(changeRaw.sourceUrls,12).filter(url=>allowed.has(url));
  return {...base,publicSources:publicSources.slice(0,24),verifiedFacts:verifiedFacts.slice(0,36),
    strategicAlignment:text(parsed.strategicAlignment,2400),strategicAlignmentScore:alignmentScore,
    strategicContinuity:{fromYear,toYear,summary:text(continuityRaw.summary,1800),sourceUrls:continuityUrls},
    organisationalChange:{status:changeStatus,type:text(changeRaw.type,500),summary:text(changeRaw.summary,1800),relevance:text(changeRaw.relevance,1800),sourceUrls:changeUrls},
    operationalGap:text(parsed.operationalGap,2200),rootFit:text(parsed.rootFit,2200),researchQuestions:list(parsed.researchQuestions,10),
    outreachAngle:text(parsed.outreachAngle,1800),evidenceConfidence:sourceConfidence(publicSources),opportunityScore,scoreBreakdown,
    research:{...base.research,message:`${base.research.message} Strategic continuity and Root-fit research also completed.${repaired?" JSON syntax was repaired before validation.":""}`,searchCalls:Math.min(8,(base.research.searchCalls||2)+4)}};
}

export async function researchManualOpportunity(organisationId:string,input:ManualInput):Promise<ManualReview>{
  if(!businessContext(input))return {...manualReview(input,true),research:{status:"blocked",message:"Add a company, public website, LinkedIn profile or business-domain email before public research. Ops will not research a named person from consumer/private context alone."}};
  const key=process.env.OPENAI_API_KEY;if(!key)return {...manualReview(input,true),research:{status:"unavailable",message:"AI web research is not configured in Ops."}};
  let profile:unknown={};try{profile=await getOrganisationGenerationProfile(organisationId);}catch{}
  const prompt=`You are researching a manually added Root Health commercial opportunity using PUBLIC PROFESSIONAL/BUSINESS information only.
Do not research private health, medical, family, political or other sensitive personal information.
Do not turn consumers into prospect lists. If the input appears consumer/private rather than professional/business, return HOLD and explain why.

Goal: produce enough evidence for a human to decide whether a professional approach is justified.
Research standards:
1. Establish identity/canonical organisation.
2. Establish Root Health fit.
3. Find a current "why now" signal. Prefer <=90 days; accept <=12 months only if clearly still current.
4. Establish a legitimate public route: named professional/role/team/contact page.
5. Normally use >=2 independent public sources, with >=1 official/primary source.
6. Search for contrary evidence or reasons NOT to approach.
7. Never invent a person, role, date, source or claim.
8. A verifiedFact must cite at least one source URL actually found in web search.
READY only when identity + fit + current signal + route are evidenced, there are >=2 sources including an official source, and no unresolved contradiction.

Return JSON only:
{
 "summary":string,"fit":string,"currentSignal":string,"recommendedRoute":string,
 "decision":"ready"|"needs_verification"|"hold",
 "suggestedType":"b2b_lead"|"partner_opportunity"|"personal_opportunity"|"social_opportunity"|null,
 "verifiedFacts":[{"claim":string,"category":"identity"|"fit"|"signal"|"route"|"role"|"counterevidence","sourceUrls":[string]}],
 "publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}],
 "aiSuggestions":[string],"contraryEvidence":[string],"missingEvidence":[string]
}
User-provided input: ${JSON.stringify(input)}
Root Health context: ${JSON.stringify(profile).slice(0,12000)}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:2,max_output_tokens:4000,
    include:["web_search_call.action.sources"],input:prompt})});
  if(!response.ok)return {...manualReview(input,true),research:{status:"unavailable",message:`Public research could not be completed (HTTP ${response.status}). Nothing has been marked verified.`}};
  const result=await response.json() as Record<string,unknown>,searched=searchSources(result),rawFirstPass=outputText(result);
  let parsed=parseJsonObject(rawFirstPass);
  let firstPassRepaired=false;
  if(!parsed){parsed=await repairResearchJson(key,rawFirstPass);firstPassRepaired=!!parsed;}
  if(!parsed)return {...manualReview(input,true),research:{status:"unavailable",message:"Public research remained unreadable after one syntax-repair attempt. Nothing has been marked verified."}};
  const publicSources=sourceList(parsed,searched,12),allowed=new Set(publicSources.map(s=>s.url));
  const facts:ManualFact[]=(Array.isArray(parsed.verifiedFacts)?parsed.verifiedFacts:[]).slice(0,20).flatMap(v=>{
    if(!v||typeof v!=="object")return[];const o=v as Record<string,unknown>,claim=text(o.claim,1200),category=String(o.category),sourceUrls=list(o.sourceUrls,6).filter(u=>allowed.has(u));
    return claim&&sourceUrls.length&&["identity","fit","signal","route","role","counterevidence"].includes(category)?[{claim,category:category as ManualFact["category"],sourceUrls}]:[];
  });
  const categories=new Set(facts.map(f=>f.category)),official=publicSources.some(s=>s.sourceType==="official"),contrary=list(parsed.contraryEvidence,8),missing=list(parsed.missingEvidence,8);
  const required:ManualFact["category"][]=["identity","fit","signal","route"];
  const deterministicReady=publicSources.length>=2&&official&&required.every(c=>categories.has(c))&&!missing.length&&!contrary.some(v=>/do not approach|unsafe|conflict|wrong fit/i.test(v));
  const decision:ManualReview["decision"]=String(parsed.decision)==="hold"?"hold":deterministicReady?"ready":"needs_verification";
  const suggested=["b2b_lead","partner_opportunity","personal_opportunity","social_opportunity"].includes(String(parsed.suggestedType))?String(parsed.suggestedType):null;
  const firstPass:ManualReview={userProvided:input,verifiedFacts:facts,publicSources,aiSuggestions:list(parsed.aiSuggestions,8),suggestedType:suggested,summary:text(parsed.summary,2400),fit:text(parsed.fit,1600),
    currentSignal:text(parsed.currentSignal,1600),recommendedRoute:text(parsed.recommendedRoute,1600),contraryEvidence:contrary,missingEvidence:missing,decision,
    research:{status:"completed",message:(decision==="ready"?"Research gate passed. Review the evidence before creating the opportunity.":decision==="hold"?"Research suggests holding this opportunity. Review the evidence before deciding.":"Research found a possible opportunity, but one or more decision-grade evidence checks are still missing.")+(firstPassRepaired?" First-pass JSON syntax was repaired before validation.":""),searchedAt:new Date().toISOString(),searchCalls:2}};
  if(decision==="hold")return firstPass;
  return deepenOpportunityResearch(key,input,profile,firstPass);
}

export async function researchDecisionMakers(organisationId:string,input:ManualInput,currentReview:unknown):Promise<ManualReview>{
  const base=parseManualResearchReview(currentReview,input);
  if(!businessContext(input))return {...base,research:{...base.research,message:"Decision-maker research requires a company, public website, LinkedIn profile or business-domain email."}};
  const key=process.env.OPENAI_API_KEY;if(!key)return {...base,research:{...base.research,message:"AI web research is not configured in Ops."}};
  let profile:unknown={};try{profile=await getOrganisationGenerationProfile(organisationId);}catch{}
  const prompt=`Find PUBLIC PROFESSIONAL decision-maker candidates for a Root Health workplace wellbeing opportunity.
Research professional/business information only. Never invent a person or role. Do not seek private/sensitive information or infer contact details.

Organisation: ${JSON.stringify(input)}
Existing research: ${JSON.stringify(base).slice(0,16000)}
Root Health context: ${JSON.stringify(profile).slice(0,8000)}

Find up to 8 CURRENT candidates. Prefer local/target-market operational owners over global executives when a credible local owner exists.
Rank using:
1. Geography: same country/region as the opportunity beats global.
2. Functional ownership: wellbeing/OH/People/HR/Benefits/Reward/Employee Experience/L&D/OD direct responsibility beats generic leadership.
3. Buying proximity: owner/buyer beats sponsor; sponsor beats adjacent.
4. Seniority is useful but must not outweigh functional and geographic relevance.

Return JSON only:
{"people":[{"name":string,"role":string,"relevance":string,"seniority":"operational_buyer"|"senior_sponsor"|"adjacent"|"unknown","geography":"target_market"|"global"|"other"|"unknown","functionalFit":"direct"|"strong"|"adjacent"|"unknown","buyingProximity":"owner"|"buyer"|"sponsor"|"adjacent"|"unknown","sourceUrls":[string],"publicProfileUrl":string|null}],"publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}]}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:2,max_output_tokens:2600,
    include:["web_search_call.action.sources"],input:prompt})});
  if(!response.ok)return {...base,research:{...base.research,message:"Opportunity research is saved, but decision-maker search could not be completed."}};
  const result=await response.json() as Record<string,unknown>,searched=searchSources(result);let parsed:Record<string,unknown>;
  try{parsed=JSON.parse(outputText(result));}catch{return {...base,research:{...base.research,message:"Opportunity research is saved, but decision-maker search returned an unreadable result."}};}
  const extraSources=sourceList(parsed,searched,16),mergedSources=[...base.publicSources];
  for(const s of extraSources)if(!mergedSources.some(x=>x.url===s.url))mergedSources.push(s);
  const allowed=new Set(mergedSources.map(s=>s.url));
  const people:ManualPersonCandidate[]=(Array.isArray(parsed.people)?parsed.people:[]).slice(0,8).flatMap(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return[];const o=v as Record<string,unknown>,name=text(o.name,300),role=text(o.role,500),relevance=text(o.relevance,1200);
    const sourceUrls=list(o.sourceUrls,6).filter(url=>allowed.has(url));
    const seniority=["operational_buyer","senior_sponsor","adjacent","unknown"].includes(String(o.seniority))?String(o.seniority) as ManualPersonCandidate["seniority"]:"unknown";
    const geography=["target_market","global","other","unknown"].includes(String(o.geography))?String(o.geography) as ManualPersonCandidate["geography"]:"unknown";
    const functionalFit=["direct","strong","adjacent","unknown"].includes(String(o.functionalFit))?String(o.functionalFit) as ManualPersonCandidate["functionalFit"]:"unknown";
    const buyingProximity=["owner","buyer","sponsor","adjacent","unknown"].includes(String(o.buyingProximity))?String(o.buyingProximity) as ManualPersonCandidate["buyingProximity"]:"unknown";
    const profile=text(o.publicProfileUrl,2048);let publicProfileUrl:string|null=null;if(profile&&allowed.has(profile)){try{publicBusinessUrl(profile,true);publicProfileUrl=profile;}catch{}}
    if(!name||!role||!sourceUrls.length)return[];
    const basePerson={name,role,relevance,seniority,geography,functionalFit,buyingProximity};
    return [{...basePerson,score:personScore(basePerson),sourceUrls,publicProfileUrl,contact:null}];
  }).sort((a,b)=>b.score-a.score);
  const missing=(base.missingEvidence||[]).filter(item=>!/named professional|decision-maker|responsible for .*wellbeing|wellbeing purchasing/i.test(item));
  if(!people.length)missing.push("No sufficiently verified named professional decision-maker was found in public sources.");
  const verifiedFacts=[...base.verifiedFacts];for(const p of people){const claim=`${p.name} — ${p.role}`;if(!verifiedFacts.some(f=>f.category==="role"&&f.claim===claim))verifiedFacts.push({claim,category:"role",sourceUrls:p.sourceUrls});}
  const top=people[0]?.score||0,scoreBreakdown=base.scoreBreakdown?{...base.scoreBreakdown,decisionMakerQuality:Math.round((top/100)*15)}:undefined;
  const opportunityScore=scoreBreakdown?Object.values(scoreBreakdown).reduce((a,b)=>a+b,0):base.opportunityScore;
  return {...base,verifiedFacts,publicSources:mergedSources.slice(0,24),people,missingEvidence:missing,scoreBreakdown,opportunityScore,
    research:{...base.research,message:people.length?`Found ${people.length} verified public professional candidate${people.length===1?"":"s"}, ranked by geography, functional ownership and buying proximity.`:"No sufficiently verified named decision-maker was found. The opportunity research remains unchanged.",searchCalls:Math.min(8,(base.research.searchCalls||2)+2)}};
}

export async function researchPersonContact(organisationId:string,input:ManualInput,currentReview:unknown,personName:string,personRole:string,emailFormatHint:string):Promise<ManualReview>{
  const base=parseManualResearchReview(currentReview,input),target=base.people?.find(p=>p.name===personName&&p.role===personRole);
  if(!target)return {...base,research:{...base.research,message:"That decision-maker is no longer present in the current review. Search again first."}};
  const key=process.env.OPENAI_API_KEY;if(!key)return {...base,research:{...base.research,message:"AI web research is not configured in Ops."}};
  let profile:unknown={};try{profile=await getOrganisationGenerationProfile(organisationId);}catch{}
  const prompt=`Research PUBLIC PROFESSIONAL contact routes for this already-verified decision-maker.
Do not seek private/personal contact information. Do not guess email addresses or phone numbers. A direct work email or public business phone may be returned only when a public professional source actually shows it.
If no direct email is public, return null. Do not infer an email; the server handles a user-supplied company format separately.
Determine the person's publicly evidenced WORK LOCATION where possible.
For every phone number, classify the route: direct_person, local_office, regional_office, global_hq or unknown.
Prefer a verified direct person line; otherwise prefer an office/switchboard matching the person's work location over a regional or global-HQ number.
A global HQ switchboard is not a person-specific route merely because it can theoretically transfer calls.
Only mark forwardingStatus "verified" when a public source explicitly says the number forwards/routes to the person or office. Otherwise use "not_verified" or "not_applicable". Never infer forwarding from country-code mismatch.
Prefer official company sources, current professional profiles, conference bios, filings and reputable business sources.

Organisation: ${JSON.stringify(input)}
Person: ${JSON.stringify({name:target.name,role:target.role,relevance:target.relevance})}
Existing sources: ${JSON.stringify(base.publicSources).slice(0,10000)}
Root Health context: ${JSON.stringify(profile).slice(0,5000)}

Return JSON only:
{"directEmail":string|null,"personLocation":string|null,"phoneRoutes":[{"number":string,"routeType":"direct_person"|"local_office"|"regional_office"|"global_hq"|"unknown","location":string|null,"forwardingStatus":"verified"|"not_verified"|"not_applicable","note":string|null,"sourceUrls":[string]}],"officialContactUrl":string|null,"linkedinUrl":string|null,"note":string,"sourceUrls":[string],"publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}]}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:2,max_output_tokens:1800,
    include:["web_search_call.action.sources"],input:prompt})});
  if(!response.ok)return {...base,research:{...base.research,message:"Decision-maker is saved, but contact-route research could not be completed."}};
  const result=await response.json() as Record<string,unknown>,searched=searchSources(result);let parsed:Record<string,unknown>;
  try{parsed=JSON.parse(outputText(result));}catch{return {...base,research:{...base.research,message:"Contact-route research returned an unreadable result."}};}
  const extraSources=sourceList(parsed,searched,12),mergedSources=[...base.publicSources];for(const s of extraSources)if(!mergedSources.some(x=>x.url===s.url))mergedSources.push(s);
  const allowed=new Set(mergedSources.map(s=>s.url)),sourceUrls=list(parsed.sourceUrls,8).filter(url=>allowed.has(url));
  const directCandidate=text(parsed.directEmail,500),directEmail=directCandidate&&companyDomainMatches(directCandidate,input)&&sourceUrls.length?directCandidate:null;
  let linkedinUrl:string|null=null,officialContactUrl:string|null=null;
  const li=text(parsed.linkedinUrl,2048);if(li&&allowed.has(li)){try{linkedinUrl=publicBusinessUrl(li,true);}catch{}}
  const contact=text(parsed.officialContactUrl,2048);if(contact&&allowed.has(contact)){try{officialContactUrl=publicBusinessUrl(contact);}catch{}}
  const personLocation=text(parsed.personLocation,500)||null;
  const routeRank={direct_person:100,local_office:80,regional_office:60,global_hq:30,unknown:10} as const;
  const phoneRoutes:ManualPhoneRoute[]=(Array.isArray(parsed.phoneRoutes)?parsed.phoneRoutes:[]).slice(0,8).flatMap(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return[];
    const o=v as Record<string,unknown>,number=text(o.number,200),routeTypeRaw=String(o.routeType),forwardingRaw=String(o.forwardingStatus);
    const phoneSourceUrls=list(o.sourceUrls,6).filter(url=>allowed.has(url));if(!number||!phoneSourceUrls.length)return[];
    const routeType=["direct_person","local_office","regional_office","global_hq","unknown"].includes(routeTypeRaw)?routeTypeRaw as NonNullable<ManualContactRoute["phoneRoutes"]>[number]["routeType"]:"unknown";
    const location=text(o.location,500)||null;
    const samePlace=!!(personLocation&&location)&&location.toLowerCase().split(/[,\s]+/).some(part=>part.length>3&&personLocation.toLowerCase().includes(part));
    const geographyMatch:NonNullable<ManualContactRoute["phoneRoutes"]>[number]["geographyMatch"]=personLocation&&location?(samePlace?"matched":"mismatch"):"unknown";
    const forwardingStatus=["verified","not_verified","not_applicable"].includes(forwardingRaw)?forwardingRaw as NonNullable<ManualContactRoute["phoneRoutes"]>[number]["forwardingStatus"]:"not_verified";
    return [{number,routeType,location,geographyMatch,forwardingStatus,note:text(o.note,800)||null,sourceUrls:phoneSourceUrls}];
  }).sort((a,b)=>(routeRank[b.routeType]+(b.geographyMatch==="matched"?20:b.geographyMatch==="mismatch"?-20:0))-(routeRank[a.routeType]+(a.geographyMatch==="matched"?20:a.geographyMatch==="mismatch"?-20:0)));
  const phone=phoneRoutes[0]?.number||null;
  const inferred=!directEmail?inferWorkEmail(target.name,emailFormatHint,input):null;
  const route:ManualContactRoute={directEmail,emailStatus:directEmail?"verified":inferred?"inferred_pattern":"not_found",inferredEmail:inferred,
    emailConfidence:directEmail?"high":inferred?"high":null,personLocation,publicPhone:phone,phoneRoutes,officialContactUrl,linkedinUrl,note:text(parsed.note,1200)||null,sourceUrls};
  const people=(base.people||[]).map(p=>p.name===target.name&&p.role===target.role?{...p,contact:route}:p);
  const message=directEmail?`Verified a public work email for ${target.name}.`:inferred?`No public direct email was verified. A likely work email was generated from the company format you supplied and is clearly marked unverified.`:`No public direct email was verified for ${target.name}. The best public route found is shown below.`;
  return {...base,publicSources:mergedSources.slice(0,24),people,research:{...base.research,message,searchCalls:Math.min(8,(base.research.searchCalls||4)+2)}};
}
