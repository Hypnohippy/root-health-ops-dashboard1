import { getOrganisationGenerationProfile } from "@/lib/organisationProfile.server";
import { manualReview, publicBusinessUrl, parseManualResearchReview, type ManualContactRoute, type ManualFact, type ManualInput, type ManualPersonCandidate, type ManualReview, type ManualSource } from "@/lib/manualAcquisition";

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
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:2,max_output_tokens:2600,
    include:["web_search_call.action.sources"],input:prompt})});
  if(!response.ok)return {...manualReview(input,true),research:{status:"unavailable",message:"Public research could not be completed. Nothing has been marked verified."}};
  const result=await response.json() as Record<string,unknown>,searched=searchSources(result);let parsed:Record<string,unknown>;
  try{parsed=JSON.parse(outputText(result));}catch{return {...manualReview(input,true),research:{status:"unavailable",message:"Public research returned an unreadable result. Nothing has been marked verified."}};}
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
  return {userProvided:input,verifiedFacts:facts,publicSources,aiSuggestions:list(parsed.aiSuggestions,8),suggestedType:suggested,summary:text(parsed.summary,2400),fit:text(parsed.fit,1600),
    currentSignal:text(parsed.currentSignal,1600),recommendedRoute:text(parsed.recommendedRoute,1600),contraryEvidence:contrary,missingEvidence:missing,decision,
    research:{status:"completed",message:decision==="ready"?"Research gate passed. Review the evidence before creating the opportunity.":decision==="hold"?"Research suggests holding this opportunity. Review the evidence before deciding.":"Research found a possible opportunity, but one or more decision-grade evidence checks are still missing.",searchedAt:new Date().toISOString(),searchCalls:2}};
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
  return {...base,verifiedFacts,publicSources:mergedSources.slice(0,24),people,missingEvidence:missing,
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
Prefer official company sources, current professional profiles, conference bios, filings and reputable business sources.

Organisation: ${JSON.stringify(input)}
Person: ${JSON.stringify({name:target.name,role:target.role,relevance:target.relevance})}
Existing sources: ${JSON.stringify(base.publicSources).slice(0,10000)}
Root Health context: ${JSON.stringify(profile).slice(0,5000)}

Return JSON only:
{"directEmail":string|null,"publicPhone":string|null,"officialContactUrl":string|null,"linkedinUrl":string|null,"note":string,"sourceUrls":[string],"publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}]}`;
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
  const phone=text(parsed.publicPhone,200)||null;
  const inferred=!directEmail?inferWorkEmail(target.name,emailFormatHint,input):null;
  const route:ManualContactRoute={directEmail,emailStatus:directEmail?"verified":inferred?"inferred_pattern":"not_found",inferredEmail:inferred,
    emailConfidence:directEmail?"high":inferred?"high":null,publicPhone:phone,officialContactUrl,linkedinUrl,note:text(parsed.note,1200)||null,sourceUrls};
  const people=(base.people||[]).map(p=>p.name===target.name&&p.role===target.role?{...p,contact:route}:p);
  const message=directEmail?`Verified a public work email for ${target.name}.`:inferred?`No public direct email was verified. A likely work email was generated from the company format you supplied and is clearly marked unverified.`:`No public direct email was verified for ${target.name}. The best public route found is shown below.`;
  return {...base,publicSources:mergedSources.slice(0,24),people,research:{...base.research,message,searchCalls:Math.min(8,(base.research.searchCalls||4)+2)}};
}
