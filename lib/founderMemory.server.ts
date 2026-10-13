import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle, lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";
import { researchFingerprint,founderRecordInput,activityInput,gmailCandidates,verifiedEmails,type FounderRecord } from "@/lib/founderMemory";
export async function founderRecord(org:string,id:string) {
 const {data,error}=await supabaseAdmin.from("founder_research_records").select("*").eq("organisation_id",org).eq("id",id).maybeSingle();if(error)throw error;if(!data)throw Error("Founder record not found.");return data as FounderRecord;
}
export async function saveFounderRecord(org:string,actor:string,body:Record<string,unknown>) {
 const input=founderRecordInput(body);let existing:FounderRecord|null=null;
 if(typeof body.recordId==="string")existing=await founderRecord(org,body.recordId);
 else if(input.identity_key) {const {data,error}=await supabaseAdmin.from("founder_research_records").select("*").eq("organisation_id",org).eq("identity_key",input.identity_key).maybeSingle();if(error)throw error;existing=data as FounderRecord|null;}
 if(!existing && typeof body.key==="string") {const {data,error}=await supabaseAdmin.from("founder_research_records").select("*").eq("organisation_id",org).eq("id",body.key).maybeSingle();if(error)throw error;existing=data as FounderRecord|null;}
 if(existing?.identity_key && input.identity_key && existing.identity_key!==input.identity_key)throw Error("Research identity changed. Create a separate record or review the existing identity.");
 if(existing && existing.entity_kind!==input.entity_kind)throw Error("Person and company records must remain separate.");
 if(!existing&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(body.key||"")))throw Error("A stable capture key is required before saving research.");
 if(existing && researchFingerprint(existing.research_snapshot)===researchFingerprint(input.research_snapshot) && existing.person_name===input.person_name && existing.discovery_context===input.discovery_context)return existing;
 const id=existing?.id || (typeof body.key==="string"?body.key:randomUUID());
 const values={...input,id,organisation_id:org,created_by:existing?.created_by||actor,updated_at:new Date().toISOString(),research_versions:[...(Array.isArray(existing?.research_versions)?existing.research_versions:[]),{snapshot:input.research_snapshot,actor,recorded_at:new Date().toISOString()}]};
 const request=existing ? supabaseAdmin.from("founder_research_records").update(values).eq("organisation_id",org).eq("id",id).eq("updated_at",existing.updated_at):supabaseAdmin.from("founder_research_records").insert(values);
 const {data,error}=await request.select("*").maybeSingle();if(error)throw error;if(!data)throw Error("Research changed; reload before saving.");return data as FounderRecord;
}
export async function founderActivity(org:string,actor:string,body:Record<string,unknown>) {
 const details=activityInput(body);return appendFounderActivity(org,actor,String(body.recordId||""),String(body.key||""),details);
}
export async function appendFounderActivity(org:string,actor:string,id:string,key:string,details:Record<string,unknown>,acquisition:string|null=null) {
 const {data,error}=await supabaseAdmin.rpc("record_founder_activity",{p_org:org,p_record:id,p_actor:actor,p_key:key,p_details:details,p_acquisition:acquisition});if(error)throw error;return data;
}
export async function founderReconciliation(org:string,id:string) {
 const record=await founderRecord(org,id),messages=await readTenantHistory("email_conversation_messages",org),history=await readTenantHistory("founder_activity_events",org);
 const ignored=new Set(history.filter(event=>event.research_record_id===id&&event.activity_type==="note_added"&&String(event.route||"").startsWith("ignored_gmail:")).map(event=>String(event.route).slice("ignored_gmail:".length)));
 return gmailCandidates(record,messages).filter(candidate=>!ignored.has(candidate.gmailMessageId));
}
export async function linkFounderGmail(org:string,actor:string,body:Record<string,unknown>) {
 if(body.confirmed!==true)throw Error("Confirm this exact conversation belongs to the selected Founder record.");
 const candidates=await founderReconciliation(org,String(body.recordId));const candidate=candidates.find(c=>c.gmailMessageId===body.gmailMessageId&&c.gmailThreadId===body.gmailThreadId);
 if(!candidate)throw Error("Gmail identity evidence changed or is not a verified match.");
 return appendFounderActivity(org,actor,String(body.recordId),String(body.key),{activity_type:"linked_gmail_evidence",occurred_at:candidate.at,route:candidate.route,subject:candidate.subject,message:null,gmail_message_id:candidate.gmailMessageId,gmail_thread_id:candidate.gmailThreadId});
}
export async function founderState(org:string,record:FounderRecord) {
 const input=await readLifecycleInput(org),emails=verifiedEmails(record),linkedin=lifecycleLinkedInIdentity(record.linkedin_identity);
 const ids=new Set(input.inbox_items.filter(row=>emails.includes(String(row.sender_email||"").toLowerCase()) || !!linkedin && [row.linkedin_identity,row.permalink].some(v=>lifecycleLinkedInIdentity(v)===linkedin)).map(row=>row.id));
 return buildContactLifecycle(org,input).filter(contact=>contact.records.some(ref=>ref.table==="inbox_items"&&ids.has(ref.id)||ref.table==="acquisition_items"&&ref.id===record.linked_acquisition_item_id));
}
