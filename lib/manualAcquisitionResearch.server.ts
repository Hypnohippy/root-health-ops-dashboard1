import { getOrganisationGenerationProfile } from "@/lib/organisationProfile.server";
import { manualReview, publicBusinessUrl, parseManualResearchReview, type ManualFact, type ManualInput, type ManualPersonCandidate, type ManualReview, type ManualSource } from "@/lib/manualAcquisition";

const FREE_MAIL=new Set(["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","aol.com","proton.me","protonmail.com"]);
const text=(v:unknown,max=2000)=>typeof v==="string"?v.trim().slice(0,max):"";
const list=(v:unknown,max=10)=>Array.isArray(v)?v.filter(x=>typeof x==="string").slice(0,max).map(x=>x.trim()).filter(Boolean):[];
function businessContext(input:ManualInput){
  if(input.company.trim()||input.website.trim()||input.linkedin.trim())return true;
  const domain=input.email.trim().split("@")[1]?.toLowerCase();return !!domain&&!FREE_MAIL.has(domain);
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
export async function researchManualOpportunity(organisationId:string,input:ManualInput):Promise<ManualReview>{
  if(!businessContext(input))return {...manualReview(input,true),research:{status:"blocked",message:"Add a company, public website, LinkedIn profile or business-domain email before public research. Ops will not research a named person from consumer/private context alone."}};
  const key=process.env.OPENAI_API_KEY;if(!key)return {...manualReview(input,true),research:{status:"unavailable",message:"AI web research is not configured in Ops."}};
  let profile:unknown={};
  try{profile=await getOrganisationGenerationProfile(organisationId);}catch{}
  const prompt=`You are researching a manually added Root Health commercial opportunity using PUBLIC PROFESSIONAL/BUSINESS information only.
Do not research private health, medical, family, political or other sensitive personal information.
Do not turn consumers into prospect lists. If the input appears consumer/private rather than professional/business, return HOLD and explain why.

Goal: produce enough evidence for a human to decide whether a professional approach is justified.

Research standards:
1. Establish identity/canonical organisation.
2. Establish Root Health fit.
3. Find a current "why now" signal. Prefer <=90 days; accept <=12 months only if clearly still current. An evergreen contact/partnership page is route evidence, not a buying signal.
4. Establish a legitimate public route: named professional/role/team/contact page.
5. Normally use >=2 independent public sources, with >=1 official/primary source.
6. Search for contrary evidence or reasons NOT to approach.
7. Never invent a person, role, date, source or claim.
8. A verifiedFact must cite at least one source URL actually found in web search.

Decision gate:
READY only when identity + fit + current signal + route are evidenced, there are >=2 sources including an official source, and no unresolved contradiction.
NEEDS_VERIFICATION when promising but one or more gate elements is missing.
HOLD when fit is poor, identity is conflicting/unverifiable, context is unsafe/private, or evidence argues against approach.

Return JSON only with:
{
 "summary": string,
 "fit": string,
 "currentSignal": string,
 "recommendedRoute": string,
 "decision": "ready"|"needs_verification"|"hold",
 "suggestedType": "b2b_lead"|"partner_opportunity"|"personal_opportunity"|"social_opportunity"|null,
 "verifiedFacts":[{"claim":string,"category":"identity"|"fit"|"signal"|"route"|"role"|"counterevidence","sourceUrls":[string]}],
 "publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}],
 "aiSuggestions":[string],
 "contraryEvidence":[string],
 "missingEvidence":[string]
}

User-provided input:
${JSON.stringify(input)}

Root Health organisation/growth context:
${JSON.stringify(profile).slice(0,12000)}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",
    tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:2,max_output_tokens:2600,
    include:["web_search_call.action.sources"],input:prompt
  })});
  if(!response.ok)return {...manualReview(input,true),research:{status:"unavailable",message:"Public research could not be completed. Nothing has been marked verified."}};
  const result=await response.json() as Record<string,unknown>, searched=searchSources(result);
  let parsed:Record<string,unknown>;
  try{parsed=JSON.parse(outputText(result));}catch{return {...manualReview(input,true),research:{status:"unavailable",message:"Public research returned an unreadable result. Nothing has been marked verified."}};}
  const rawSources=Array.isArray(parsed.publicSources)?parsed.publicSources:[];
  const publicSources:ManualSource[]=rawSources.slice(0,12).flatMap(v=>{
    if(!v||typeof v!=="object")return[];const o=v as Record<string,unknown>,url=text(o.url,2048);if(!searched.has(url))return[];
    const sourceType=["official","reputable","other"].includes(String(o.sourceType))?String(o.sourceType) as ManualSource["sourceType"]:"other";
    return [{url,title:text(o.title,500)||searched.get(url)!.title,sourceType,publishedAt:text(o.publishedAt,64)||null}];
  });
  const allowed=new Set(publicSources.map(s=>s.url));
  const facts:ManualFact[]=(Array.isArray(parsed.verifiedFacts)?parsed.verifiedFacts:[]).slice(0,20).flatMap(v=>{
    if(!v||typeof v!=="object")return[];const o=v as Record<string,unknown>,claim=text(o.claim,1200),category=String(o.category);
    const sourceUrls=list(o.sourceUrls,6).filter(u=>allowed.has(u));if(!claim||!sourceUrls.length||!["identity","fit","signal","route","role","counterevidence"].includes(category))return[];
    return [{claim,category:category as ManualFact["category"],sourceUrls}];
  });
  const categories=new Set(facts.map(f=>f.category)), official=publicSources.some(s=>s.sourceType==="official");
  const contrary=list(parsed.contraryEvidence,8), missing=list(parsed.missingEvidence,8);
  const requiredCategories: ManualFact["category"][]=["identity","fit","signal","route"];
  const deterministicReady=publicSources.length>=2&&official&&requiredCategories.every(c=>categories.has(c))&&!missing.length&&!contrary.some(v=>/do not approach|unsafe|conflict|wrong fit/i.test(v));
  const requestedDecision=String(parsed.decision);
  const decision:ManualReview["decision"]=requestedDecision==="hold"?"hold":deterministicReady?"ready":"needs_verification";
  const suggested=["b2b_lead","partner_opportunity","personal_opportunity","social_opportunity"].includes(String(parsed.suggestedType))?String(parsed.suggestedType):null;
  return {userProvided:input,verifiedFacts:facts,publicSources,aiSuggestions:list(parsed.aiSuggestions,8),suggestedType:suggested,
    summary:text(parsed.summary,2400),fit:text(parsed.fit,1600),currentSignal:text(parsed.currentSignal,1600),recommendedRoute:text(parsed.recommendedRoute,1600),
    contraryEvidence:contrary,missingEvidence:missing,decision,
    research:{status:"completed",message:decision==="ready"?"Research gate passed. Review the evidence before creating the opportunity.":decision==="hold"?"Research suggests holding this opportunity. Review the evidence before deciding.":"Research found a possible opportunity, but one or more decision-grade evidence checks are still missing.",searchedAt:new Date().toISOString(),searchCalls:2}};
}

export async function researchDecisionMakers(organisationId:string,input:ManualInput,currentReview:unknown):Promise<ManualReview>{
  const base=parseManualResearchReview(currentReview,input);
  if(!businessContext(input))return {...base,research:{...base.research,message:"Decision-maker research requires a company, public website, LinkedIn profile or business-domain email."}};
  const key=process.env.OPENAI_API_KEY;if(!key)return {...base,research:{...base.research,message:"AI web research is not configured in Ops."}};
  let profile:unknown={};
  try{profile=await getOrganisationGenerationProfile(organisationId);}catch{}
  const prompt=`Find PUBLIC PROFESSIONAL decision-maker candidates for a Root Health workplace wellbeing opportunity.

Research only professional/business information. Do not seek private, health, family, political or other sensitive personal information. Do not infer personal email addresses or phone numbers.

Organisation input:
${JSON.stringify(input)}

Existing opportunity research:
${JSON.stringify(base).slice(0,16000)}

Root Health context:
${JSON.stringify(profile).slice(0,8000)}

Find up to 8 CURRENT people whose public roles plausibly relate to buying, sponsoring, referring or owning workplace wellbeing in this organisation. It is useful to return several plausible roles rather than forcing a single winner.

Prioritise:
- Head/Director/VP of People or HR
- Employee Wellbeing / Health & Wellbeing
- Occupational Health
- Benefits / Reward
- People Experience / Employee Experience
- Learning & Development / Organisational Development
- senior HR business leadership
- for partner organisations, Partnerships / Membership / Business Development where appropriate

Classify each candidate:
- operational_buyer: likely day-to-day owner/buyer
- senior_sponsor: senior executive sponsor
- adjacent: relevant but indirect
- unknown

Evidence rules:
1. Never invent a person or role.
2. Prefer current official organisation pages. LinkedIn/company/profile pages, conference bios and reputable professional sources may corroborate current roles.
3. Each candidate must have at least one source URL from the web search.
4. If a role may be stale, say so in relevance and do not overstate it.
5. Do not guess contact details.
6. If nobody is sufficiently verified, return an empty people array.

Return JSON only:
{
  "people":[
    {
      "name":string,
      "role":string,
      "relevance":string,
      "seniority":"operational_buyer"|"senior_sponsor"|"adjacent"|"unknown",
      "sourceUrls":[string],
      "publicProfileUrl":string|null
    }
  ],
  "publicSources":[
    {"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}
  ]
}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({
    model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",
    tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:2,max_output_tokens:2400,
    include:["web_search_call.action.sources"],input:prompt
  })});
  if(!response.ok)return {...base,research:{...base.research,message:"Opportunity research is saved, but decision-maker search could not be completed."}};
  const result=await response.json() as Record<string,unknown>,searched=searchSources(result);
  let parsed:Record<string,unknown>;
  try{parsed=JSON.parse(outputText(result));}catch{return {...base,research:{...base.research,message:"Opportunity research is saved, but decision-maker search returned an unreadable result."}};}
  const extraSources:ManualSource[]=(Array.isArray(parsed.publicSources)?parsed.publicSources:[]).slice(0,16).flatMap(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return[];
    const o=v as Record<string,unknown>,url=text(o.url,2048);if(!url||!searched.has(url))return[];
    const sourceType=["official","reputable","other"].includes(String(o.sourceType))?String(o.sourceType) as ManualSource["sourceType"]:"other";
    return [{url,title:text(o.title,500)||searched.get(url)!.title,sourceType,publishedAt:text(o.publishedAt,64)||null}];
  });
  const mergedSources=[...base.publicSources];
  for(const source of extraSources)if(!mergedSources.some(existing=>existing.url===source.url))mergedSources.push(source);
  const allowed=new Set(mergedSources.map(s=>s.url));
  const people:ManualPersonCandidate[]=(Array.isArray(parsed.people)?parsed.people:[]).slice(0,8).flatMap(v=>{
    if(!v||typeof v!=="object"||Array.isArray(v))return[];
    const o=v as Record<string,unknown>,name=text(o.name,300),role=text(o.role,500),relevance=text(o.relevance,1200);
    const sourceUrls=list(o.sourceUrls,6).filter(url=>allowed.has(url));
    const seniority=["operational_buyer","senior_sponsor","adjacent","unknown"].includes(String(o.seniority))?String(o.seniority) as ManualPersonCandidate["seniority"]:"unknown";
    const profile=text(o.publicProfileUrl,2048);let publicProfileUrl:string|null=null;
    if(profile&&allowed.has(profile)){try{publicBusinessUrl(profile,true);publicProfileUrl=profile;}catch{}}
    return name&&role&&sourceUrls.length?[{name,role,relevance,seniority,sourceUrls,publicProfileUrl}]:[];
  });
  const missing=(base.missingEvidence||[]).filter(item=>!/named professional|decision-maker|responsible for .*wellbeing|wellbeing purchasing/i.test(item));
  if(!people.length)missing.push("No sufficiently verified named professional decision-maker was found in public sources.");
  const verifiedFacts=[...base.verifiedFacts];
  for(const person of people){
    const claim=`${person.name} — ${person.role}`;
    if(!verifiedFacts.some(f=>f.category==="role"&&f.claim===claim))verifiedFacts.push({claim,category:"role",sourceUrls:person.sourceUrls});
  }
  return {...base,verifiedFacts,publicSources:mergedSources.slice(0,20),people,missingEvidence:missing,
    research:{...base.research,message:people.length?`Found ${people.length} public professional candidate${people.length===1?"":"s"}. Review roles and sources before choosing an approach.`:"No sufficiently verified named decision-maker was found. The opportunity research remains unchanged.",searchCalls:Math.min(4,(base.research.searchCalls||2)+2)}};
}
