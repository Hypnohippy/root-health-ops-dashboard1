import type { ManualInput, ManualReview } from "@/lib/manualAcquisition";
import { object, words, type Row } from "@/lib/relationshipWorkspace";
import { lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";

export type PublicResearchSource={url:string;title:string;publishedAt:string|null;retrievedAt:string};
export function relationshipResearchQuestion(question:string) {
 return /research|public|external|new signals|anything.*changed|opportunit|re.engage|before (?:calling|meeting)|current.*(?:initiatives|developments)/i.test(question);
}
/** Discovery selector only; the existing candidate resolver still owns identity. */
export function relationshipResearchSubject(question:string):string|null {
 const patterns=[/\bknow about\s+([\p{L}][\p{L} ’'-]*?)(?=\s+(?:with|using|and|to|for)\b|[/?.,!]|$)/iu,/\bresearch\s+([\p{L}][\p{L} ’'-]*?)(?=\s+(?:and|using|with|to|for)\b|[/?.,!]|$)/iu,/\bopportunities.*?\bwith\s+([\p{L}][\p{L} ’'-]*?)(?=[/?.,!]|$)/iu];
 const value=patterns.map(pattern=>question.match(pattern)?.[1]).find(v=>v&&!/^(?:this|our|the|current|recent|public|external|their|anything|and)\b/i.test(v));
 return value?.trim()||null;
}
/** Public selectors only. Private notes, correspondence, email and the question
 * never enter the external search prompt. Company context is not person identity. */
export function relationshipPublicInput(relationship:{kind:string;name:string;company:string|null},sources:{fields:Row}[]):ManualInput {
 const field=(key:string)=>[...new Set(sources.map(s=>words(s.fields[key])).filter(Boolean))];
 const profiles=[...new Set([...field("linkedin_identity"),...field("linkedin_url")].map(v=>v.replace(/^https?:\/\/(?:www\.)?/,"").replace(/\/$/,"")))];
 const sites=field("website");
 return {person:relationship.kind==="person"?relationship.name:"",company:relationship.kind==="company"?relationship.name:relationship.company||"",linkedin:profiles.length===1?`https://${profiles[0]}`:"",website:sites.length===1?sites[0]:"",email:"",note:"Research current public professional context, official initiatives and dated developments. Attribute every claim. Do not infer recipient intent, identity equivalence or send permission. Separate company context from person evidence."};
}
export function publicResearchSources(review:ManualReview):PublicResearchSource[] {
 const retrievedAt=review.research.status==="completed"?review.research.searchedAt:null;
 if(!retrievedAt||!Number.isFinite(Date.parse(retrievedAt)))return [];
 return review.publicSources.slice(0,8).flatMap(s=>{
  try {const u=new URL(s.url);if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return [];return [{url:u.href,title:s.title.slice(0,200),publishedAt:s.publishedAt,retrievedAt}];}catch{return [];}
 });
}
export function publicResearchFacts(review:ManualReview,sources:PublicResearchSource[]) {
 const allowed=new Set(sources.map(s=>s.url));
 return review.verifiedFacts.slice(0,8).flatMap(f=>{const urls=f.sourceUrls.filter(u=>allowed.has(u));return urls.length?[{claim:f.claim.slice(0,300),sourceUrls:urls}]:[];});
}
/** Research attribution only, never an internal identity decision. Namesake
 * findings cannot enrich the selected person unless
 * the search actually returned their exact supplied public profile. */
export function publicResearchScopeNotice(input:ManualInput,review:ManualReview):string|null {
 const profile=lifecycleLinkedInIdentity(input.linkedin);
 if(!input.person||review.research.status!=="completed"||!review.publicSources.length)return null;
 const profiles=review.publicSources.map(s=>lifecycleLinkedInIdentity(s.url)).filter(Boolean);
 return profile&&profiles.includes(profile)&&profiles.every(p=>p===profile)?null:"Unverified candidate sources only. Search did not establish an unambiguous match to the supplied public profile. Findings are withheld from this person's research and opportunity reasoning; verify the exact public context before using them.";
}
export function storedResearchContext(rows:Row[]) {
 return rows.slice(0,3).map(r=>({id:r.id,company:r.company,person:r.person_name,savedAt:(r.linked_relationship_workspace_id?r.created_at:r.updated_at)||null,freshness:r.linked_relationship_workspace_id&&object(r.research_snapshot).phase2d ? "Approved historical public evidence. Publication, retrieval and approval dates remain separate; not current internal truth." : "Saved timestamp is not a research retrieval time; current accuracy is unverified.", approvedEvidence:r.linked_relationship_workspace_id?object(object(r.research_snapshot).phase2d):{},sources:(Array.isArray(r.sources)?r.sources:[]).slice(0,4),summary:words(object(r.research_snapshot).recommendedApproach).slice(0,350)}));
}
