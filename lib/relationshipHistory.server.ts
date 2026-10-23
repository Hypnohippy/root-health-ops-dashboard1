import { readTenantHistory } from "@/lib/opsSearch.server";
import { lifecycleLinkedInIdentity, type LifecycleInput } from "@/lib/contactLifecycle";
import { externalSentAt, sendReceipts } from "@/lib/linkedinSendEvidence";
import { chronologicalEvidence, workspaceActivityEvidence, object, words, sourceRows, type Row, type ProjectedRelationship, type EvidenceEvent } from "@/lib/relationshipWorkspace";
export async function relationshipHistory(org:string,relationship:ProjectedRelationship,input:LifecycleInput,founder:Row[],events:Row[],readHistory:typeof readTenantHistory=readTenantHistory) {
 // Defence in depth around the tenant-scoped reader; never borrow protected provenance across tenants.
 const historyRows=async(table:string)=>(await readHistory(table,org)).filter(r=>!r.organisation_id||r.organisation_id===org);
 founder=founder.filter(f=>f.organisation_id===org);
 const rows=sourceRows(input,relationship.refs).filter(r=>r.organisation_id===org), identities=new Set(rows.flatMap(r=>[r.linkedin_identity,r.linkedin_url,r.permalink].map(lifecycleLinkedInIdentity).filter(Boolean)));
 // The existing canonical projection may carry stronger identity than any one source row.
 if(relationship.contactId)try{const [tenant,identity]=JSON.parse(relationship.contactId);if(tenant===org&&typeof identity==="string"&&identity.startsWith("linkedin:")){const canonical=lifecycleLinkedInIdentity(identity.slice(9));if(canonical)identities.add(canonical);}}catch{ /* Source evidence remains usable; never guess an identity. */ }
 for(const f of founder.filter(f=>relationship.founderIds.includes(String(f.id)))){const canonical=lifecycleLinkedInIdentity(f.linkedin_identity);if(canonical)identities.add(canonical);}
 const threads=new Set(rows.filter(r=>r.platform==="email").flatMap(r=>[words(r.email_thread_id),words(r.email_sent_thread_id)]).filter(Boolean));
 const founderEvents=founder.length?(await historyRows("founder_activity_events")).filter(e=>relationship.founderIds.includes(String(e.research_record_id))):[];
 for(const e of founderEvents)if(e.gmail_message_id&&e.gmail_thread_id)threads.add(String(e.gmail_thread_id));
 const [li,email,acquisition,response]=await Promise.all([
  identities.size?historyRows("linkedin_conversation_messages"):[],threads.size?historyRows("email_conversation_messages"):[],
  relationship.refs.some(r=>r.table==="acquisition_items")?historyRows("acquisition_item_events"):[],relationship.refs.some(r=>r.table==="inbox_items")?historyRows("response_item_events"):[],
 ]);
 const communication:EvidenceEvent[]=[],history:EvidenceEvent[]=[];
 const event=(e:EvidenceEvent)=>history.push(e);
 for(const m of li.filter(m=>identities.has(String(m.linkedin_identity))))communication.push({id:`linkedin:${m.id}`,kind:String(m.direction)==="snapshot"?"Conversation history snapshot":"Message",channel:"LinkedIn",direction:String(m.direction),text:String(m.message??""),at:words(m.message_at)||null,recordedAt:words(m.confirmed_at)||null,source:String(m.source||"Stored LinkedIn conversation")});
 for(const m of email.filter(m=>threads.has(String(m.gmail_thread_id))))communication.push({id:`gmail:${m.gmail_message_id}`,kind:"Email",channel:"Email",direction:String(m.direction),text:String(m.body??""),at:words(m.sent_at)||null,recordedAt:words(m.created_at)||null,source:`Gmail thread ${m.gmail_thread_id}; message ${m.gmail_message_id}`});
 for(const r of rows) {
  if(r.kind==="connection_accepted")event({id:`acceptance:${r.id}`,kind:"Connection accepted",channel:"LinkedIn",text:"Existing accepted-connection evidence",at:words(r.created_at_platform)||null,recordedAt:words(r.inserted_at)||null,source:`inbox_items:${r.id}`});
  if(r.replied_at)event({id:`growth-reply:${r.id}:${r.replied_at}`,kind:"Reply recorded",channel:r.linkedin_identity?"LinkedIn":"Ops",text:String(r.reply_notes||"Reply recorded; no message body supplied here."),at:words(r.replied_at)||null,recordedAt:null,source:`growth_targets:${r.id}`});
  if(r.call_date)event({id:`meeting-scheduled:${r.id}:${r.call_date}`,kind:"Meeting scheduled — not evidence it took place",channel:"Meetings",text:String(r.call_notes||"Recorded meeting schedule"),at:words(r.call_date)||null,recordedAt:null,source:`growth_targets:${r.id}; scheduled time only`});
  const notifications=object(r.raw).linkedin_message_notifications;
  if(Array.isArray(notifications))for(const n of notifications.map(object))if(n.source==="linkedin_message_notification"&&n.gmailMessageId)event({id:`notification:${n.eventKey||`${n.gmailMessageId}:${r.linkedin_identity}`}`,kind:"LinkedIn reply detected",channel:"LinkedIn",text:"Notification evidence only. No reply content or sentiment is inferred.",at:words(n.receivedAt)||null,recordedAt:words(n.recordedAt)||null,source:`Gmail ${n.gmailMessageId}`});
  for(const receipt of sendReceipts(r.manual_completion)) {
   const item={id:`receipt:${receipt.key}`,kind:"Manual send evidence",channel:r.platform==="email"?"Email":"LinkedIn",direction:"outbound",text:String(receipt.message),at:externalSentAt(receipt),recordedAt:words(receipt.confirmed_at||receipt.completed_at)||null,source:`${r.id}; receipt ${receipt.key}`};
   event(item); // Keep legacy evidence; do not collapse pasted snapshots into fabricated individual messages.
   if(item.channel==="LinkedIn"&&!communication.some(m=>m.direction==="outbound"&&m.at===item.at&&m.text===item.text))communication.push(item);
  }
  const invitations=object(object(r.metadata).linkedin_invitation).history;
  if(Array.isArray(invitations))for(const v of invitations.map(object))if(v.action==="invitation_sent")event({id:`invitation:${v.key}`,kind:"Invitation manually recorded",channel:"LinkedIn",text:"An invitation is not an accepted connection or an outbound message.",at:words(v.invitation_sent_at)||null,recordedAt:words(v.confirmed_at)||null,source:`acquisition_items:${r.id}`});
 }
 for(const f of founder.filter(f=>relationship.founderIds.includes(String(f.id))))event({id:`research:${f.id}`,kind:"Research saved",channel:"Founder",text:String(f.company||f.person_name||"Stored research"),at:words(f.created_at)||null,recordedAt:words(f.created_at)||null,source:`founder_research_records:${f.id}`});
 for(const f of founder.filter(f=>relationship.founderIds.includes(String(f.id))))if(Array.isArray(f.research_versions))for(const [index,v] of f.research_versions.map(object).entries())event({id:`research-version:${f.id}:${index}`,kind:"Research snapshot saved",channel:"Founder",text:"Stored research version; no outreach implied.",at:words(v.recorded_at)||null,recordedAt:words(v.recorded_at)||null,source:`Founder research; actor ${v.actor||"not recorded"}`});
 for(const e of founderEvents)event({id:`founder:${e.id}`,kind:String(e.activity_type).replaceAll("_"," "),channel:"Founder",text:String(e.message||e.subject||e.route||"Recorded activity"),at:words(e.occurred_at)||null,recordedAt:words(e.recorded_at)||null,source:`Founder activity; actor ${e.actor}`});
 for(const [table,list,key] of [["acquisition_item_events",acquisition,"acquisition_item_id"],["response_item_events",response,"inbox_item_id"]] as const)for(const e of list.filter(e=>relationship.refs.some(r=>r.id===e[key]&&r.table===(key==="inbox_item_id"?"inbox_items":"acquisition_items"))))event({id:`${table}:${e.id}`,kind:String(e.action||"State recorded").replaceAll("_"," "),channel:"Ops",text:[e.note,e.outcome,e.new_state||e.new_status].filter(Boolean).join(" — "),at:words(e.created_at)||null,recordedAt:words(e.created_at)||null,source:`${table}; actor ${e.actor_user_id}`});
 for(const e of events) {
  const item=workspaceActivityEvidence(e);
  event(item);if(["Calls","Meetings","Email","LinkedIn"].includes(item.channel))communication.push(item);
 }
 history.push(...communication);return {conversation:chronologicalEvidence(communication),history:chronologicalEvidence(history)};
}
