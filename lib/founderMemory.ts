import { parseFounderLane,parseFounderGeography } from "@/lib/founderIntelligence";
import { lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";
export const founderActivities=["emailed","linkedin_contacted","called","note_added","promoted_to_acquisition","linked_gmail_evidence"] as const;
export type FounderRecord=Record<string,unknown>&{id:string;organisation_id:string;company:string|null;person_name:string|null;research_snapshot:Record<string,unknown>;linked_acquisition_item_id:string|null};
const text=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():null;
export function verifiedEmails(record: Record<string,unknown>) {
 const contacts=Array.isArray(record.contacts)?record.contacts as Record<string,unknown>[]:[];
 return [...new Set([record.email_verified ? text(record.email) : null,...contacts.filter(c=>c.emailStatus==="verified" && (record.entity_kind!=="person" || c.name===record.person_name)).map(c=>text(c.directEmail))].filter((v):v is string=>!!v).map(v=>v.toLowerCase()))];
}
export function founderDomain(value:unknown) {try {const url=new URL(String(value));return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.hostname.toLowerCase().replace(/^www\./,""):null;}catch{return null;}}
export function founderRecordInput(body:Record<string,unknown>) {
 const research=body.research && typeof body.research==="object" && !Array.isArray(body.research) ? body.research as Record<string,unknown> : null;
 if(!research || !text(research.name))throw Error("A named research snapshot is required.");
 if(JSON.stringify(research).length>100000)throw Error("Research snapshot is too large.");
 const contacts=Array.isArray(research.contacts)?research.contacts as Record<string,unknown>[]:[];
 const requested=body.contact && typeof body.contact==="object" ? body.contact as Record<string,unknown>:null;
 const selected=requested ? contacts.find(c=>c.name===requested.name && c.linkedinUrl===requested.linkedinUrl && c.directEmail===requested.directEmail)||null:null;
 if(requested&&!selected)throw Error("Choose a contact from the stored research.");
 const person=selected?text(selected.name):null,domain=founderDomain(research.website);
 const urls=Array.isArray(research.sourceUrls)?research.sourceUrls:[];
 const verifiedDomain=!!domain && urls.some(url=>founderDomain(url)===domain);
 const organisationRoute=research.organisationRoute && typeof research.organisationRoute==="object" ? research.organisationRoute as Record<string,unknown>:null;
 const orgEmail=organisationRoute && Array.isArray(organisationRoute.sourceUrls) && organisationRoute.sourceUrls.some(url=>urls.includes(url)) ? text(organisationRoute.generalEmail)?.toLowerCase()||null:null;
 const email=selected ? selected.emailStatus==="verified"?text(selected.directEmail)?.toLowerCase()||null:null : orgEmail;
 const linkedin=selected?.linkedinUrl && Array.isArray(selected?.sourceUrls) && (selected.sourceUrls as unknown[]).some(url=>lifecycleLinkedInIdentity(url)===lifecycleLinkedInIdentity(selected.linkedinUrl)) ? lifecycleLinkedInIdentity(selected.linkedinUrl):null;
 const identity=person ? linkedin ? `person:linkedin:${linkedin}` : email ? `person:email:${email}:${domain||String(research.name).toLowerCase()}:${person.normalize("NFKC").toLowerCase()}` : null : verifiedDomain ? `company:${domain}`:null;
 return {entity_kind:person?"person":"company",person_name:person,company:String(research.name),website:text(research.website),domain,email,email_verified:!!email,linkedin_url:linkedin?`https://${linkedin}`:null,linkedin_identity:linkedin,domain_verified:verifiedDomain,identity_key:identity,lane:parseFounderLane(research.lane||"open_intelligence"),geography:parseFounderGeography(research.geography),discovery_context:text(body.discoveryContext),research_snapshot:research,sources:research.publicSources||urls,contacts:contacts,scores_rationale:{score:research.score,why:research.why,recommendedApproach:research.recommendedApproach}};
}
export function activityInput(body:Record<string,unknown>,now=Date.now()) {
 if(body.confirmed!==true)throw Error("Explicit human confirmation is required.");
 if(!["emailed","linkedin_contacted","called","note_added"].includes(String(body.activityType)))throw Error("Choose a manual activity.");
 const nowChoice=body.timeChoice==="now";
 const at=nowChoice ? null : body.occurredAt===null || body.occurredAt==="" ? null : String(body.occurredAt||"");
 if(at && (!/(Z|[+-]\d{2}:\d{2})$/.test(at)||!Number.isFinite(Date.parse(at))||Date.parse(at)>now))throw Error("Use a valid actual activity time, not a future date.");
 const route=text(body.route),message=typeof body.message==="string"?body.message:null;
 if(body.activityType==="note_added"&&!message?.trim())throw Error("Enter a note.");
 if((message?.length||0)>50000)throw Error("Message or note is too long.");
 return {activity_type:body.activityType,time_status:nowChoice?"now":"historical",occurred_at:at?new Date(at).toISOString():null,route,subject:text(body.subject),message};
}
export function gmailCandidates(record:FounderRecord,messages:Record<string,unknown>[]) {
 const emails=verifiedEmails(record);
 return messages.filter(m=>m.organisation_id===record.organisation_id && m.gmail_message_id && m.gmail_thread_id).flatMap(m=>{
  const addresses=[m.direction==="outbound"?m.recipient_email:m.sender_email].flatMap(v=>String(v||"").toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/g)||[]);
  const exact=!!record.company && addresses.some(address=>emails.includes(address));
  const domain=record.entity_kind!=="person" && record.domain_verified && addresses.some(address=>address.split("@")[1]===record.domain);
  if(!exact&&!domain)return[];
  return [{gmailMessageId:String(m.gmail_message_id),gmailThreadId:String(m.gmail_thread_id),direction:m.direction,at:m.sent_at,subject:m.subject,route:m.direction==="outbound"?m.recipient_email:m.sender_email,confidence:exact?"Exact verified contact route":"Organisation domain only — confirm the person",requiresConfirmation:true,evidence:exact?"Exact email in verified Founder contact context":"Verified organisation domain; different people remain separate",message:m.body,inboxItemId:m.inbox_item_id||null}];
 });
}

export function researchFingerprint(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(researchFingerprint).join(",")}]`;
 if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${researchFingerprint(v)}`).join(",")}}`;
 return JSON.stringify(value) ?? "null";
}
