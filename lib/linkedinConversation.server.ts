import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle } from "@/lib/contactLifecycle";
import { record } from "@/lib/linkedinSendEvidence";
import { validateConversationMessage, validateConversationHistory, chronologicalMessages } from "@/lib/linkedinConversation";
async function conversationSnapshotOnce(org: string, contactId?: string) {
 const {data: version,error: versionError}=await supabaseAdmin.from("lifecycle_revisions").select("revision").eq("organisation_id",org).maybeSingle();
 if(versionError) throw versionError;
 const input=await readLifecycleInput(org,false);
 const contacts=buildContactLifecycle(org,input).filter(c=>c.channel==="linkedin" && c.identity.startsWith("linkedin:"));
 const contact=contacts.find(c=>c.contactId===contactId);
 const entries: Record<string,unknown>[]=[];let schemaAvailable=true;
 if(contact) for(let offset=0;;offset+=500){
  const {data,error}=await supabaseAdmin.from("linkedin_conversation_messages").select("*").eq("organisation_id",org).eq("linkedin_identity",contact.identity.slice(9)).order("confirmed_at").order("id").range(offset,offset+499);
  if(error){if(["42P01","PGRST205"].includes(error.code)){schemaAvailable=false;break;}throw error;}
  entries.push(...(data||[]));if(!data||data.length<500)break;
 }
 const {data: after,error: afterError}=await supabaseAdmin.from("lifecycle_revisions").select("revision").eq("organisation_id",org).maybeSingle();
 if(afterError) throw afterError;
 if(String(version?.revision||0)!==String(after?.revision||0)) throw Error("Conversation changed; reload before appending.");
 const legacyEvidence=contact?contact.records.flatMap(ref=>{
  const row=input[ref.table].find(r=>r.id===ref.id);const receipt=record(row?.manual_completion);
  return [...(Array.isArray(receipt.history)?receipt.history.map(record):[]),receipt].filter(r=>typeof r.message==="string"&&r.message).map(r=>({table:ref.table,id:ref.id,key:r.key,message:String(r.message),confirmedAt:r.confirmed_at||r.completed_at||null}));
 }):[];
 return {revision:String(version?.revision||0), contacts, contact, legacyEvidence, messages:chronologicalMessages(entries), schemaAvailable};
}
export async function conversationSnapshot(org: string, contactId?: string) {
 for(let attempt=0;attempt<3;attempt++)try{return await conversationSnapshotOnce(org,contactId);}catch(error){if(!(error instanceof Error)||!error.message.includes("Conversation changed")||attempt===2)throw error;}
 throw Error("Conversation changed; reload.");
}
export async function appendConversation(org: string, actor: string, body: Record<string,unknown>) {
 const isSnapshot=body.kind==="snapshot";
 const details=isSnapshot?validateConversationHistory(body):validateConversationMessage(body);
 if(typeof body.contactId!=="string" || typeof body.revision!=="string") throw Error("Select the LinkedIn contact.");
 const state=await conversationSnapshot(org,body.contactId);
 if([...state.messages.dated,...state.messages.undated].some(r=>r.receipt_key===body.key))return {duplicate:true};
 if(!state.contact || state.revision!==body.revision) throw Error("Contact state changed. Reload before appending.");
 const {data,error}=await supabaseAdmin.rpc(isSnapshot?"append_linkedin_conversation_snapshot":"append_linkedin_conversation_message",{p_organisation_id:org,p_actor:actor,p_identity:state.contact.identity.slice(9),p_revision:body.revision,p_key:body.key,p_details:details,p_refs:state.contact.records});
 if(error) throw Error("Conversation entry could not be recorded. Reload and retry with the same key. The conversation schema must be deployed separately; do not resend the LinkedIn message.");
 return data;
}
