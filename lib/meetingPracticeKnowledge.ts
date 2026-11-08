export type PracticeKnowledgeCategory='product_service_summary'|'target_customer'|'features'|'benefits'|'employer_experience'|'employee_experience'|'how_it_works'|'onboarding'|'signup_process'|'pricing'|'commitment'|'reporting_data'|'integrations'|'evidence_proof'|'limitations'|'faqs'|'next_steps';
export type PracticeKnowledgeItem={knowledgeId:string;category:PracticeKnowledgeCategory;statement:string;sourceId:string;sourceSection:string;sourceExcerpt:string;approvalStatus:'practice_source_material';limitation?:string};
export type PracticeKnowledgeSource={sourceId:string;sourceType:'user_provided_local_file';url:string;title:string;fetchedAt:null;contentHash:string;extractionStatus:'prepared'|'empty';approvalStatus:'practice_source_material';provenance:{adapter:'user_provided_local_file';fileName:string;preparedAt:string;urlFetched:false};sourceText:string;items:PracticeKnowledgeItem[];sections:string[]};
export type PracticeKnowledgePack={snapshotVersion:string;sourceIds:string[];items:PracticeKnowledgeItem[];sources:PracticeKnowledgeSource[]};

const DEFAULT_ROOT_MEMBERSHIP_URL='https://www.roothealth.app/organisations/membership';
export const MAX_PRACTICE_KNOWLEDGE_SOURCE_BYTES=250_000;
const KNOWN_HEADINGS=new Set(['root health','root workplace membership','workplace membership','everything included','root intelligence','employee wellbeing platform','organisation insights','organization insights','ask root','executive reviews','evidence-led recommendations','launch materials','outcome measurement','membership pricing','clear commercial principles','how membership starts','tell us about your organisation','confirm membership','set up root','invite employees','evidence develops','root keeps learning','evidence before assumption','participation matters','root workplace organisations support','extend your impact','wellbeing workshops','manager development','leadership programmes','specialist briefings','bespoke consultancy','research and evaluation','a note from the founder','ready to begin','one complete platform']);

export function normalizePracticeSourceText(input:string){return input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\u0000/g,'').split('\n').map(line=>line.replace(/[\t ]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();}
export function hashPracticeKnowledgeText(input:string){let first=2166136261,second=0x9e3779b9;for(const character of normalizePracticeSourceText(input)){const code=character.charCodeAt(0);first=Math.imul(first^code,16777619);second=Math.imul(second^code,2246822519);}return `pair32-${(first>>>0).toString(16).padStart(8,'0')}${(second>>>0).toString(16).padStart(8,'0')}`;}

function isHeading(line:string){const value=line.trim().replace(/^#+\s*/,'').toLowerCase();return /^#{1,6}\s+/.test(line.trim())||KNOWN_HEADINGS.has(value)||/^(?:up to \d+[\d,]*|\d+[\d,–-]+|more than \d+[\d,]*)\s+employees$/i.test(value)||/^[A-Z][A-Z0-9 '&—–-]{4,}$/.test(line.trim())||/^\d{2}$/.test(line.trim());}
export function normalizePracticeSourceSections(input:string){
 const lines=normalizePracticeSourceText(input).split('\n'),sections:{title:string;paragraphs:string[]}[]=[];let current={title:'Source overview',paragraphs:[] as string[]};sections.push(current);let numberPending=false,paragraphBreak=true;
 const flushHeading=(title:string)=>{const cleaned=title.replace(/^#+\s*/,'').trim();if(!cleaned)return;if(/^\d{2}$/.test(cleaned)){numberPending=true;paragraphBreak=true;return;}if(numberPending){current={title:cleaned,paragraphs:[]};sections.push(current);numberPending=false;paragraphBreak=true;return;}current={title:cleaned,paragraphs:[]};sections.push(current);paragraphBreak=true;};
 const navigationLabels=new Set(['sign in','begin membership','membership','how it starts',"founder's note",'view membership pricing','privacy','safety','terms','pricing principle','scale, not features','complete root workplace membership','growing organisations','evidence-led organisational wellbeing','organisations']);
 for(const line of lines){if(!line){paragraphBreak=true;continue;}if(isHeading(line)){flushHeading(line);continue;}if(/^→$/.test(line)||/^✓$/.test(line)||/^—$/.test(line)||navigationLabels.has(line.toLowerCase())){paragraphBreak=true;continue;}if(current.paragraphs.length&&!paragraphBreak)current.paragraphs[current.paragraphs.length-1]+=` ${line}`;else current.paragraphs.push(line);paragraphBreak=false;}
 return sections.filter(section=>section.paragraphs.length).map(section=>{const paragraphs:string[]=[];let pending='';for(const raw of section.paragraphs){const value=raw.trim();if(!value)continue;const combined=pending?`${pending} ${value}`:value;if(combined.length<24){pending=combined;continue;}paragraphs.push(combined);pending='';}if(pending){if(paragraphs.length)paragraphs[paragraphs.length-1]+=` ${pending}`;else paragraphs.push(pending);}return {title:section.title,paragraphs};}).filter(section=>section.paragraphs.length);
}

function categoryFor(section:string,text:string):PracticeKnowledgeCategory|null{
 const value=`${section} ${text}`.toLowerCase();
 if(/employee wellbeing platform/.test(section.toLowerCase())||/every employee receives|employees join privately|personal root experience/.test(value))return 'employee_experience';
 if(/human-delivered support remains optional|priced separately|commissioned only with the organisation's approval/.test(value))return 'limitations';
 if(/root intelligence|employee wellbeing platform|ask root|evidence-led recommendations|launch materials|outcome measurement/.test(section.toLowerCase()))return 'features';
 if(/executive reviews|organisation insights|organization insights/.test(section.toLowerCase()))return 'reporting_data';
 if(/12-month|membership is normally agreed|commitment|cancellation/.test(value))return 'commitment';
 if(/pricing|£\s?\d|per month|excluding vat|billed monthly/.test(value))return 'pricing';
 if(/how membership starts|application|confirm membership|set up root|invite employees|secure invitation/.test(value))return 'onboarding';
 if(/begin membership|membership application|complete the direct membership application/.test(value))return 'signup_process';
 if(/executive reviews|organisation insights|reporting|board-ready|anonymous participation|evidence depth|workforce direction|confidence signals/.test(value))return 'reporting_data';
 if(/evidence before assumption|participation matters|anonymous wellbeing evidence|evidence supports|uncertain|measured facts/.test(value))return 'evidence_proof';
 if(/employee wellbeing platform|personal root experience|employees join privately|employee communications/.test(value))return 'employee_experience';
 if(/employer|organisation establishes|authorised administrator|hr receives|leadership can|organisation supports/.test(value))return 'employer_experience';
 if(/root intelligence|ask root|evidence-led recommendations|launch materials|outcome measurement|organisation insights|executive reviews/.test(section.toLowerCase()))return 'features';
 if(/benefit|useful day to day|clearer view|clearer picture|support.*leadership|organisational learning/.test(value))return 'benefits';
 if(/how it starts|from application to|complete platform|one platform|membership combines|root combines/.test(value))return 'product_service_summary';
 if(/works|develops over time|continuous|continuously|before and after|repeated reviews/.test(value))return 'how_it_works';
 if(/not seeing individual|without seeing individual|does not recommend|will not recommend|not a sales opportunity|optional|priced separately/.test(value))return 'limitations';
 if(/organisation|organization|workforce|hr|people leaders/.test(value))return 'target_customer';
 return null;
}
function stableId(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,56)||'item';}
export function extractPracticeKnowledgeItems(sourceId:string,sections:ReturnType<typeof normalizePracticeSourceSections>):PracticeKnowledgeItem[]{
 const items:PracticeKnowledgeItem[]=[];let index=0;
 for(const section of sections)for(const paragraph of section.paragraphs){
  // A list heading or navigation label is not a fact by itself.
  const statement=paragraph.trim();if(statement.length<24||/^(begin|view|sign in|root health|everything included)$/i.test(statement))continue;
  const category=categoryFor(section.title,statement);if(!category)continue;
  index++;items.push({knowledgeId:`${sourceId}:item-${String(index).padStart(3,'0')}-${stableId(section.title)}`,category,statement,sourceId,sourceSection:section.title,sourceExcerpt:statement,approvalStatus:'practice_source_material'});
 }
 return items;
}
export function preparePracticeKnowledgeSource(input:{text:string;fileName:string;title?:string;sourceId?:string;url?:string;preparedAt?:string}):PracticeKnowledgeSource{
 const sourceText=normalizePracticeSourceText(input.text),sourceId=input.sourceId||`root-local-${hashPracticeKnowledgeText(sourceText)}`,sections=normalizePracticeSourceSections(sourceText),items=extractPracticeKnowledgeItems(sourceId,sections);
 return {sourceId,sourceType:'user_provided_local_file',url:input.url||DEFAULT_ROOT_MEMBERSHIP_URL,title:input.title||'Root Health Workplace Membership',fetchedAt:null,contentHash:hashPracticeKnowledgeText(sourceText),extractionStatus:items.length?'prepared':'empty',approvalStatus:'practice_source_material',provenance:{adapter:'user_provided_local_file',fileName:input.fileName,preparedAt:input.preparedAt||new Date().toISOString(),urlFetched:false},sourceText,items,sections:sections.map(section=>section.title)};
}
export function validatePracticeKnowledgePayloadSize(size:number){return Number.isFinite(size)&&size>=0&&size<=MAX_PRACTICE_KNOWLEDGE_SOURCE_BYTES?{ok:true as const}:{ok:false as const,reason:'payload_too_large_or_invalid'};}
export function pinPracticeKnowledgePack(sources:PracticeKnowledgeSource[]):PracticeKnowledgePack|null{
 const eligible=sources.filter(source=>source.extractionStatus==='prepared'&&source.approvalStatus==='practice_source_material');if(!eligible.length)return null;
 const contentHash=eligible.map(source=>source.contentHash).join('.');return {snapshotVersion:`practice-knowledge-v1-${hashPracticeKnowledgeText(contentHash)}`,sourceIds:eligible.map(source=>source.sourceId),items:eligible.flatMap(source=>source.items.map(item=>({...item}))),sources:eligible.map(source=>({...source,provenance:{...source.provenance},items:source.items.map(item=>({...item})),sections:[...source.sections]}))};
}

/** Future fetch adapter contract: reject unsafe origins/redirect targets before any network request. V1 never fetches this URL. The eventual fetcher must resolve and verify each connected IP and repeat this check on every redirect to prevent DNS rebinding. */
export function validatePracticeWebpageUrl(value:string):{ok:true;url:string}|{ok:false;reason:string}{
 let url:URL;try{url=new URL(value);}catch{return {ok:false,reason:'invalid_url'};}
 if(url.protocol!=='https:'&&url.protocol!=='http:')return {ok:false,reason:'unsupported_scheme'};
 if(url.username||url.password)return {ok:false,reason:'embedded_credentials'};
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 if(!host||['localhost','metadata.google.internal','instance-data.ec2.internal'].includes(host)||['.localhost','.local','.internal','.lan','.home'].some(suffix=>host.endsWith(suffix)))return {ok:false,reason:'private_or_local_host'};
 if(host.includes(':'))return {ok:false,reason:/^(::1|::|fc|fd|fe80:)/.test(host)?'private_or_local_host':'ip_literal_requires_connection_time_validation'};
 if(/^\d+(?:\.\d+){3}$/.test(host)){const [a,b,c]=host.split('.').map(Number);if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0&&c===0||a===192&&b===0&&c===2||a===198&&b===51&&c===100||a===203&&b===0&&c===113)return {ok:false,reason:'private_or_local_host'};}
 return {ok:true,url:url.toString()};
}
export function validatePracticeWebpageRedirect(target:string,redirectCount:number,maxRedirects=3){if(redirectCount>=maxRedirects)return {ok:false as const,reason:'too_many_redirects'};const checked=validatePracticeWebpageUrl(target);return checked.ok?checked:{ok:false as const,reason:`unsafe_redirect:${checked.reason}`};}

export function savePracticeKnowledgeSource(storage:Pick<Storage,'setItem'>,organisationId:string,source:PracticeKnowledgeSource){storage.setItem(`root.practice.knowledge.v1:${organisationId}`,JSON.stringify(source));}
export function loadPracticeKnowledgeSource(storage:Pick<Storage,'getItem'>,organisationId:string):PracticeKnowledgeSource|null{
 const raw=storage.getItem(`root.practice.knowledge.v1:${organisationId}`);if(!raw)return null;try{const value=JSON.parse(raw) as PracticeKnowledgeSource;if(value.sourceType!=='user_provided_local_file'||value.provenance?.adapter!=='user_provided_local_file'||typeof value.sourceText!=='string')return null;const rebuilt=preparePracticeKnowledgeSource({text:value.sourceText,fileName:value.provenance.fileName,title:value.title,sourceId:value.sourceId,url:value.url,preparedAt:value.provenance.preparedAt});return rebuilt.contentHash===value.contentHash?rebuilt:null;}catch{return null;}
}
export function removePracticeKnowledgeSource(storage:Pick<Storage,'removeItem'>,organisationId:string){storage.removeItem(`root.practice.knowledge.v1:${organisationId}`);}
