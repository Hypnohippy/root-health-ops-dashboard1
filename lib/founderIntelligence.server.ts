import { founderLaneLabel,type FounderContact,type FounderDeepResearch,type FounderOrganisationRoute,type FounderDiscoveryItem,type FounderIntelligenceLane,type FounderSource } from "@/lib/founderIntelligence";
const text=(v:unknown,max=3000)=>typeof v==="string"?v.trim().slice(0,max):"";
const list=(v:unknown,max=12,maxLength=1800)=>Array.isArray(v)?v.filter(x=>typeof x==="string").slice(0,max).map(x=>x.trim().slice(0,maxLength)).filter(Boolean):[];
const CONTEXT={rootHealth:{description:"Preventative wellbeing platform for individuals and organisations, helping people understand patterns across stress, sleep, recovery, energy, mood, focus and burnout; supports appropriate interventions and privacy-preserving aggregate/longitudinal organisational insight."},ops:{description:"Automated marketing, creation and growth studio sold to therapists and wellbeing practitioners. Helps them create and market therapy services, wellbeing workshops, webinars and seminars; find direct corporate clients and introducers/referrers; manage outreach, replies, follow-up, campaigns, publishing and conversion. Therapists do not resell Ops."}};
function outputText(r:Record<string,unknown>){const d=text(r.output_text,60000);if(d)return d;for(const i of Array.isArray(r.output)?r.output:[])if(i&&typeof i==="object")for(const p of Array.isArray((i as any).content)?(i as any).content:[])if(p&&typeof p==="object"&&text((p as any).text,60000))return text((p as any).text,60000);return "";}
function parse(raw:string){const t=raw.trim(),c=[t,t.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"")],a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)c.push(t.slice(a,b+1));for(const s of c)try{const p=JSON.parse(s);if(p&&typeof p==="object"&&!Array.isArray(p))return p as Record<string,unknown>;}catch{}return null;}
function validUrl(v:string){try{const u=new URL(v);return ["http:","https:"].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}}
function searchedSources(v:unknown){const m=new Map<string,{url:string;title:string}>();const walk=(x:unknown)=>{if(!x||typeof x!=="object")return;if(Array.isArray(x)){x.forEach(walk);return;}const o=x as Record<string,unknown>,url=text(o.url,2048),title=text(o.title,500);if(url&&validUrl(url))m.set(url,{url,title:title||url});Object.values(o).forEach(walk);};walk(v);return m;}
function sources(parsed:Record<string,unknown>,searched:Map<string,{url:string;title:string}>,max=30):FounderSource[]{return (Array.isArray(parsed.publicSources)?parsed.publicSources:[]).slice(0,max).flatMap(v=>{if(!v||typeof v!=="object"||Array.isArray(v))return[];const o=v as any,url=text(o.url,2048);if(!url||!searched.has(url))return[];const st=["official","reputable","other"].includes(String(o.sourceType))?String(o.sourceType) as FounderSource["sourceType"]:"other";return [{url,title:text(o.title,500)||searched.get(url)!.title,sourceType:st,publishedAt:text(o.publishedAt,64)||null}];});}
function emailOk(v:string){return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);}
function namedPerson(v:string){const s=v.trim();if(!s||s.split(/\s+/).length<2)return false;return !/\b(not publicly identified|not identified|unknown|unnamed|registrar|registration|administrator|administration|team|office|department|contact|membership services?)\b/i.test(s);}
function directPersonEmail(v:string){if(!emailOk(v))return false;const local=v.split("@")[0].toLowerCase();return !/^(admin|info|enquiries|enquiry|hello|contact|office|support|members?|membership|registrar|reception|team)$/.test(local);}
function score100(value:unknown){const n=Number(value);if(!Number.isFinite(n)||n<=0)return 0;const normalised=n<=10?n*10:n;return Math.max(0,Math.min(100,Math.round(normalised)));}
async function research(prompt:string,maxCalls:number,maxOutput:number){const key=String(process.env.OPENAI_API_KEY||"").trim();if(!key)throw Error("AI web research is not configured in Ops.");const call=async(input:string,tools=true)=>fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",...(tools?{tools:[{type:"web_search"}],tool_choice:"auto",max_tool_calls:maxCalls,include:["web_search_call.action.sources"]}:{}),max_output_tokens:maxOutput,input})});const response=await call(prompt);if(!response.ok)throw Error(`Founder research could not complete (HTTP ${response.status}).`);const result=await response.json() as Record<string,unknown>,raw=outputText(result);let parsed=parse(raw);if(!parsed){const repair=await call(`Repair ONLY JSON syntax. Do not add/remove/reinterpret facts or invent sources. Return one JSON object only.\n\n${raw.slice(0,32000)}`,false);if(repair.ok)parsed=parse(outputText(await repair.json() as Record<string,unknown>));}if(!parsed)throw Error("Founder research remained unreadable after one syntax-repair attempt.");return{parsed,searched:searchedSources(result)};}
function laneInstruction(lane:FounderIntelligenceLane){if(lane==="ops_distribution")return"Find organisations that could distribute or refer Root Health Ops to therapists/wellbeing practitioners. Prioritise professional associations, registers, accrediting bodies, training schools, CPD providers, directories and member networks. Do NOT assess them as internal workplace-wellbeing buyers. Assess member/audience overlap, member-benefit or preferred-supplier behaviour, commercial openness and why they would introduce Ops.";if(lane==="health_referral")return"Find organisations that could refer, distribute or collaborate around Root Health or the Capacity Check. Assess mission/audience fit, referral/member/client resource potential, pilot/campaign alignment and real distribution value. Do not infer endorsement.";if(lane==="ops_user_channel")return"Find scalable channels containing likely Ops users: therapists, hypnotherapists, counsellors, coaches and wellbeing practitioners. Prefer associations, registers, training providers, directories and networks over one-by-one prospects.";return"Research organisations matching the founder's request without forcing a buyer-only model. Classify plausible relationship as direct buyer, referral partner, distribution partner, introducer, collaboration partner, user channel or not suitable.";}
export async function discoverFounderOrganisations(lane:FounderIntelligenceLane,query:string,excludeNames:string[]=[]){const excluded=excludeNames.map(v=>text(v,300)).filter(Boolean).slice(0,60);const prompt=`You are the PRIVATE Founder Intelligence researcher inside Root Health Ops. This is NOT the customer-facing therapist acquisition engine.\nFounder context:${JSON.stringify(CONTEXT)}\nLane:${founderLaneLabel(lane)}\n${laneInstruction(lane)}\nFounder request:${query}\nAlready shown on earlier pages - DO NOT RETURN THESE AGAIN:${JSON.stringify(excluded)}\nSearch PUBLIC BUSINESS/PROFESSIONAL information only. No private/sensitive personal data and no named consumer-health prospects. Prefer organisations. Return up to 6 NEW candidates for this page. This is broad discovery, not full due diligence. Every candidate needs a source actually found. Score fit for THIS lane on a 0-100 scale where 90 means excellent fit, 80 strong fit, 60 worth exploring, and below 40 weak fit. Do not use a 0-10 scale.\nReturn JSON only:{"items":[{"name":string,"website":string|null,"country":string|null,"fitScore":number,"why":string,"audience":string,"partnershipMechanism":string,"evidenceSummary":string,"sourceUrls":[string]}],"publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}]}`;const {parsed,searched}=await research(prompt,6,6000),pub=sources(parsed,searched),allowed=new Set(pub.map(s=>s.url)),excludedLower=new Set(excluded.map(v=>v.toLowerCase()));const items:FounderDiscoveryItem[]=(Array.isArray(parsed.items)?parsed.items:[]).slice(0,6).flatMap(v=>{if(!v||typeof v!=="object"||Array.isArray(v))return[];const o=v as any,name=text(o.name,300),urls=list(o.sourceUrls,8,2048).filter(u=>allowed.has(u));if(!name||!urls.length||excludedLower.has(name.toLowerCase()))return[];const w=text(o.website,2048);return[{name,website:w&&validUrl(w)?w:null,country:text(o.country,300)||null,fitScore:score100(o.fitScore),why:text(o.why,1800),audience:text(o.audience,1400),partnershipMechanism:text(o.partnershipMechanism,1400),evidenceSummary:text(o.evidenceSummary,1600),sourceUrls:urls}];}).sort((a,b)=>b.fitScore-a.fitScore);return{lane,query,items,publicSources:pub};}
export async function deepenFounderOrganisation(lane:FounderIntelligenceLane,organisation:{name:string;website?:string|null;discoveryContext?:string|null}){const name=text(organisation.name,300);if(!name)throw Error("Choose an organisation to research.");const website=text(organisation.website,2048);if(website&&!validUrl(website))throw Error("Use a public organisation website.");const prompt=`You are conducting DEEP FOUNDER-LEVEL COMMERCIAL INTELLIGENCE for Root Health. This is NOT the therapist-facing acquisition engine; do not assume the target is an employer buying wellbeing.
Founder context:${JSON.stringify(CONTEXT)}
Lane:${founderLaneLabel(lane)}
${laneInstruction(lane)}
TARGET ORGANISATION:${JSON.stringify({name,website:website||null,discoveryContext:text(organisation.discoveryContext,3000)||null})}

ENTITY DISCIPLINE:
- Keep the named target organisation as the target.
- Do NOT merge it with a standards council, parent, subsidiary, former body, trade name, legacy domain or related organisation unless current authoritative evidence explicitly establishes they are the same current operating entity.
- Put related organisations in entityNotes and explain the verified relationship separately.
- A legacy or hijacked domain belonging to a related body is not negative evidence about the target unless reliable evidence ties it directly to the target's current operations.

RESEARCH LIMITATION DISCIPLINE:
- If the web tool cannot access or verify the supplied website, state that the research tool could not independently verify/access it.
- Do NOT convert tool-access failure into a website-integrity or operational-status concern without independent evidence.

Investigate strategic fit, audience overlap, current channel readiness, existing partnership/member-benefit/referral/distribution behaviour, what THEY could give us, what WE could give them, plausible money-flow models (no invented %), success measures, activation difficulty/risks, current signals, best initial approach, relevant contact FUNCTIONS/ROLES, and questions before committing resources.
Score STRATEGIC FIT, CHANNEL READINESS and MEMBER / GRADUATE SUCCESS DEPENDENCY separately, all 0-100.
Strategic fit = audience overlap + proposition relevance + strategic compatibility.
Channel readiness = evidence they can actually distribute, promote, refer, introduce, sponsor, sell a member benefit or activate a route now.
Member / graduate success dependency = how strongly the organisation benefits when its members, registrants, students or graduates build viable practices, win clients, create offers, retain confidence in their qualification or membership, and achieve visible professional outcomes.
For registers, professional bodies, colleges, training schools, CPD providers and practitioner networks, explicitly assess whether Ops could improve member or graduate outcomes through practice launch, client generation, workshops and seminars, corporate outreach, referral development and ongoing marketing.
Do not assume this dependency exists. Support it with public evidence from the organisation's positioning, member benefits, graduate support, alumni support, business or practice resources, retention model, testimonials or training outcomes.
Do not let lack of proven channel erase strong strategic fit or member-success value.
Separate fact from inference. Never invent reach, pricing, endorsement, procurement or intent.
SOURCE RELEVANCE: sourceUrls must directly evidence the target organisation, its current or historical channel/member mechanisms, its governance/identity, or the specific commercial-fit claim being made. Do not include a source merely because it mentions the organisation in an unrelated clinical, charity, consumer or generic context. Prefer official target-organisation material, authoritative registers/filings, current professional profiles and directly relevant partner/member pages.

Return JSON only:{"name":string,"website":string|null,"strategicFitScore":number,"channelReadinessScore":number,"memberSuccessDependencyScore":number,"evidenceConfidence":"high"|"medium"|"low","strategicFit":string,"audienceFit":string,"channelReadiness":string,"memberSuccessValue":string,"entityNotes":[string],"valueExchange":{"theyGive":[string],"weGive":[string],"moneyFlow":[string],"successMeasures":[string]},"economicModels":[string],"currentSignals":[string],"risks":[string],"recommendedApproach":string,"contactRoles":[string],"questions":[string],"sourceUrls":[string],"publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}]}`;const {parsed,searched}=await research(prompt,8,7500),pub=sources(parsed,searched),allowed=new Set(pub.map(s=>s.url)),vx=parsed.valueExchange&&typeof parsed.valueExchange==="object"&&!Array.isArray(parsed.valueExchange)?parsed.valueExchange as any:{};const w=text(parsed.website,2048)||website;const strategicFitScore=score100(parsed.strategicFitScore),channelReadinessScore=score100(parsed.channelReadinessScore),memberSuccessDependencyScore=score100(parsed.memberSuccessDependencyScore),score=Math.round(strategicFitScore*0.5+channelReadinessScore*0.3+memberSuccessDependencyScore*0.2);const result:FounderDeepResearch={name:text(parsed.name,300)||name,website:w&&validUrl(w)?w:null,lane,score,strategicFitScore,channelReadinessScore,memberSuccessDependencyScore,evidenceConfidence:["high","medium","low"].includes(String(parsed.evidenceConfidence))?String(parsed.evidenceConfidence) as any:"low",strategicFit:text(parsed.strategicFit,3000),audienceFit:text(parsed.audienceFit,2400),channelReadiness:text(parsed.channelReadiness,2400),memberSuccessValue:text(parsed.memberSuccessValue,2400),entityNotes:list(parsed.entityNotes,10,1200),valueExchange:{theyGive:list(vx.theyGive,10,1200),weGive:list(vx.weGive,10,1200),moneyFlow:list(vx.moneyFlow,10,1200),successMeasures:list(vx.successMeasures,10,1200)},economicModels:list(parsed.economicModels,10,1200),currentSignals:list(parsed.currentSignals,10,1200),risks:list(parsed.risks,10,1200),recommendedApproach:text(parsed.recommendedApproach,2600),contactRoles:list(parsed.contactRoles,10,800),contacts:[],organisationRoute:null,questions:list(parsed.questions,12,1000),sourceUrls:list(parsed.sourceUrls,16,2048).filter(u=>allowed.has(u)),publicSources:pub};return result;}

export async function researchFounderContacts(lane:FounderIntelligenceLane,current:FounderDeepResearch){
  const base=`Find a PUBLIC PROFESSIONAL CONTACT LADDER for this Founder Intelligence opportunity.
Target organisation: ${JSON.stringify({name:current.name,website:current.website,lane:founderLaneLabel(lane)})}
Commercial reasoning: ${JSON.stringify({strategicFit:current.strategicFit,channelReadiness:current.channelReadiness,memberSuccessValue:current.memberSuccessValue,recommendedApproach:current.recommendedApproach,contactRoles:current.contactRoles}).slice(0,14000)}

This is a partnership/distribution/referral research task, NOT a workplace-HR buyer task.

Build a ladder, not a single point of failure. When public evidence permits, return:
1. PRIMARY operational owner - the NAMED person most likely to handle or route this proposal now.
2. SECONDARY senior/sponsor - a NAMED current senior person who could approve, sponsor or redirect it.
3. SPECIALIST route - a NAMED partnerships/commercial, membership/member services, marketing/comms, CPD/training or practitioner-support person if a real current role exists.

CRITICAL NAMED-PERSON RULE:
- A contact card must represent a publicly identified real person.
- NEVER return a role placeholder such as "GHR Registrar", "Membership Team", "Administrator", "Head office", "name not publicly identified", or similar as a person.
- If the role is known but the holder is not, leave it to the organisation-level route / existing contactRoles. Do not create a contact.
- Small organisations may legitimately have only one named person.

Also find the best CURRENT ORGANISATION-LEVEL route independently of named people:
- official general/business email if publicly displayed;
- official business phone/switchboard if publicly displayed;
- official contact page/form.
Generic addresses such as admin@, info@, enquiries@, membership@ or office@ belong ONLY in organisationRoute and must NEVER be attached to a named person as their direct email.

ROLE PRIORITY where appropriate:
partnerships/commercial/business development;
membership/member services/practitioner support;
marketing/communications/content/community;
CPD/training/education;
registrar/chief executive/chair/senior operational sponsor.

RULES:
- Public professional/business information only.
- Never invent a person, role, email, phone, LinkedIn URL or authority.
- A direct work email may be returned ONLY if a public professional/business source visibly ties that address to that named person.
- Never infer an email pattern.
- If no verified direct person email is public, return null and emailStatus "not_found".
- General organisation email/phone must be publicly evidenced; never infer them.
- Keep related entities separate.
- Prefer sources that DIRECTLY evidence the person's current role or the target organisation's official contact route.
- Exclude peripheral sources that merely mention the organisation in unrelated clinical, charity, consumer or generic material.
- Rank contacts by actual route relevance, not seniority alone.

Return JSON only:
{"contacts":[{"name":string,"role":string,"why":string,"confidence":"high"|"medium"|"low","rank":number,"contactType":"primary"|"secondary"|"sponsor"|"specialist","directEmail":string|null,"emailStatus":"verified"|"not_found","linkedinUrl":string|null,"officialContactUrl":string|null,"publicPhone":string|null,"location":string|null,"sourceUrls":[string]}],"organisationRoute":{"generalEmail":string|null,"publicPhone":string|null,"officialContactUrl":string|null,"note":string|null,"sourceUrls":[string]},"publicSources":[{"url":string,"title":string,"sourceType":"official"|"reputable"|"other","publishedAt":string|null}]}`;

  const readPass=async(prompt:string,maxCalls:number)=>{const {parsed,searched}=await research(prompt,maxCalls,6500),extra=sources(parsed,searched,28);return{parsed,extra};};
  let first=await readPass(base,7),merged=[...current.publicSources];
  for(const x of first.extra)if(!merged.some(y=>y.url===x.url))merged.push(x);

  const parseContacts=(parsed:Record<string,unknown>,allowed:Set<string>):FounderContact[] =>(Array.isArray(parsed.contacts)?parsed.contacts:[]).slice(0,6).flatMap(v=>{if(!v||typeof v!=="object"||Array.isArray(v))return[];const o=v as any,name=text(o.name,300),role=text(o.role,500),why=text(o.why,1600),sourceUrls=list(o.sourceUrls,8,2048).filter(u=>allowed.has(u));if(!namedPerson(name)||!role||!sourceUrls.length)return[];const raw=text(o.directEmail,500),directEmail=raw&&directPersonEmail(raw)?raw:null,li=text(o.linkedinUrl,2048),oc=text(o.officialContactUrl,2048),rank=Math.max(1,Math.min(20,Math.round(Number(o.rank)||20))),contactType=["primary","secondary","sponsor","specialist"].includes(String(o.contactType))?String(o.contactType) as FounderContact["contactType"]:"specialist";return[{name,role,why,confidence:["high","medium","low"].includes(String(o.confidence))?String(o.confidence) as FounderContact["confidence"]:"low",rank,contactType,directEmail,emailStatus:(directEmail?"verified":"not_found") as FounderContact["emailStatus"],linkedinUrl:li&&validUrl(li)?li:null,officialContactUrl:oc&&validUrl(oc)?oc:null,publicPhone:text(o.publicPhone,200)||null,location:text(o.location,500)||null,sourceUrls}];}).sort((a,b)=>a.rank-b.rank);

  const parseRoute=(parsed:Record<string,unknown>,allowed:Set<string>):FounderOrganisationRoute|null=>{if(!parsed.organisationRoute||typeof parsed.organisationRoute!=="object"||Array.isArray(parsed.organisationRoute))return null;const o=parsed.organisationRoute as any,sourceUrls=list(o.sourceUrls,8,2048).filter(u=>allowed.has(u)),rawEmail=text(o.generalEmail,500),generalEmail=rawEmail&&emailOk(rawEmail)?rawEmail:null,oc=text(o.officialContactUrl,2048),phone=text(o.publicPhone,200)||null;if(!sourceUrls.length||(!generalEmail&&!phone&&!(oc&&validUrl(oc))))return null;return{generalEmail,publicPhone:phone,officialContactUrl:oc&&validUrl(oc)?oc:null,note:text(o.note,1000)||null,sourceUrls};};

  let allowed=new Set(merged.map(x=>x.url)),contacts=parseContacts(first.parsed,allowed),organisationRoute=parseRoute(first.parsed,allowed);

  if(!contacts.length){
    const secondPrompt=`Targeted SECOND PASS: find a genuinely NAMED current professional person for ${current.name}.
The first pass found no valid named individual.
Search specifically for current professional profiles, organisation bulletins/newsletters, event speaker pages, authoritative register/accreditation pages, Companies House officer pages where relevant, and official staff/about/contact pages.
Prioritise the operational/member-facing person who could receive or route a partnership/member-benefit proposal, then a senior sponsor.
DO NOT return role placeholders, unnamed registrars, teams or generic inboxes as people.
A generic organisation email belongs only in organisationRoute.
Use the same public-only, no-inference rules.
Return JSON only in the SAME schema as the first pass.`;
    const second=await readPass(secondPrompt,6);for(const x of second.extra)if(!merged.some(y=>y.url===x.url))merged.push(x);allowed=new Set(merged.map(x=>x.url));contacts=parseContacts(second.parsed,allowed);organisationRoute=organisationRoute||parseRoute(second.parsed,allowed);
  }
  return{...current,contacts,organisationRoute,publicSources:merged.slice(0,40)};
}

export async function draftFounderFirstApproach(lane:FounderIntelligenceLane,current:FounderDeepResearch){
  const key=String(process.env.OPENAI_API_KEY||"").trim();if(!key)throw Error("AI drafting is not configured in Ops.");
  const primary=current.contacts.slice().sort((a,b)=>a.rank-b.rank)[0]||null,targetRoute=primary?.directEmail||current.organisationRoute?.generalEmail||null;
  const prompt=`Draft the FIRST outreach email for this Founder Intelligence opportunity.
Organisation: ${current.name}
Lane: ${founderLaneLabel(lane)}
Best named contact: ${primary?JSON.stringify({name:primary.name,role:primary.role,why:primary.why}):"No verified named contact"}
Available route: ${targetRoute||"No email route verified"}
Strategic fit: ${current.strategicFit}
Channel readiness: ${current.channelReadiness}
Member/graduate success value: ${current.memberSuccessValue}
What they could give us: ${current.valueExchange.theyGive.join("; ")}
What we could give them: ${current.valueExchange.weGive.join("; ")}
Recommended first approach: ${current.recommendedApproach}
Risks/constraints: ${current.risks.join("; ")}

Write a concise, human UK-business email from David at Root Health / Root Health Ops.
PURPOSE: open a conversation, not close a deal.
Use ONLY the supplied research. Do not invent facts, member numbers, endorsements, partnerships, savings, results or personal familiarity.
If there is a named contact, address them by first name. If there is not, use a neutral greeting.
Make the relevance to THEIR organisation clear, especially member/practitioner/graduate success where supported.
Do not lead with commission or revenue share. Do not over-explain the technology.
Aim for 120-180 words. One clear low-friction question/CTA.
No hype, no fake urgency.
Return JSON only: {"subject":string,"body":string}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.OPENAI_DRAFT_MODEL||process.env.OPENAI_RESEARCH_MODEL||"gpt-6-luna",max_output_tokens:1800,input:prompt})});
  if(!response.ok)throw Error(`Founder email draft could not complete (HTTP ${response.status}).`);const parsed=parse(outputText(await response.json() as Record<string,unknown>));if(!parsed)throw Error("Founder email draft was unreadable.");const subject=text(parsed.subject,300),body=text(parsed.body,5000);if(!subject||!body)throw Error("Founder email draft was incomplete.");return{subject,body};
}

export function founderContextForAcquisition(r:FounderDeepResearch){return[`Founder Intelligence lane: ${founderLaneLabel(r.lane)}`,`Overall opportunity: ${r.score}/100`,`Strategic fit: ${r.strategicFitScore}/100 — ${r.strategicFit}`,`Channel readiness: ${r.channelReadinessScore}/100 — ${r.channelReadiness}`,`Member/graduate success dependency: ${r.memberSuccessDependencyScore}/100 — ${r.memberSuccessValue}`,`Audience fit: ${r.audienceFit}`,r.entityNotes.length?`Entity notes: ${r.entityNotes.join("; ")}`:"",r.valueExchange.theyGive.length?`What they could give us: ${r.valueExchange.theyGive.join("; ")}`:"",r.valueExchange.weGive.length?`What we could give them: ${r.valueExchange.weGive.join("; ")}`:"",r.economicModels.length?`Possible commercial models: ${r.economicModels.join("; ")}`:"",r.currentSignals.length?`Current signals: ${r.currentSignals.join("; ")}`:"",r.risks.length?`Risks/constraints: ${r.risks.join("; ")}`:"",r.contacts.length?`Public professional contacts: ${r.contacts.map(c=>`${c.name} — ${c.role}${c.directEmail?` — ${c.directEmail}`:""}`).join("; ")}`:"",r.organisationRoute?`Organisation contact route: ${[r.organisationRoute.generalEmail,r.organisationRoute.publicPhone,r.organisationRoute.officialContactUrl].filter(Boolean).join(" | ")}`:"",`Recommended approach: ${r.recommendedApproach}`].filter(Boolean).join("\n");}
