import {createHash} from 'node:crypto';
import {supabaseAdmin} from './supabaseAdmin';
import {conversationSnapshot} from './linkedinConversation.server';
import {validateConversationMessage} from './linkedinConversation';
import {captureInstant,captureMessageText,resolveCaptureContact,type CaptureContact} from './linkedinQuickCapture';
import {sourceLocator} from './relationshipWorkspace';
/** Stable across paste/review retries; credentials and names never participate. */
export function captureReceiptKey(org:string,identity:string,direction:string,at:string,message:string){const hex=createHash('sha256').update(JSON.stringify(['linkedin-capture-v1',org,identity,direction,at,captureMessageText(message)])).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;}
export function reviewedCapturePlan(org:string,identity:string,rows:unknown,existing:Record<string,unknown>[],now=Date.now()){
 if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Review 1–100 messages per capture.');
 const seen=new Set<string>();let duplicates=0;
 const messages=rows.flatMap(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Review every selected message.');
  const row=value as Record<string,unknown>,at=captureInstant(String(row.date||''),String(row.time||''));
  if(!at||typeof row.message!=='string'||!row.message.trim())throw Error('Each selected message needs a verified direction, date and unambiguous UK time.');
  const key=captureReceiptKey(org,identity,String(row.direction),at,row.message),details=validateConversationMessage({key,direction:row.direction,message:row.message,dateKnown:true,timeKnown:true,messageAt:at,timezone:'Europe/London',confirmed:true},now);
  if(seen.has(key)){duplicates++;return [];}seen.add(key);
  const match=existing.find(e=>e.organisation_id===org&&e.linkedin_identity===identity&&e.direction===details.direction&&e.time_precision==='time'&&e.message_at&&new Date(String(e.message_at)).toISOString()===at&&captureMessageText(String(e.message))===captureMessageText(details.message));
  // Keep our own deterministic receipts in the RPC payload so lost-response retries can be verified atomically.
  if(match&&match.receipt_key!==key){duplicates++;return [];}
  return [{key,details}];
 });return {messages,duplicates};
}
export async function appendQuickCapture(org:string,actor:string,body:Record<string,unknown>){
 if(body.confirmed!==true||typeof body.contactId!=='string'||typeof body.revision!=='string')throw Error('Confirm the exact existing contact and all included message details.');
 if(typeof body.paste!=='string'||body.paste.length>500000)throw Error('Paste a conversation of no more than 500,000 characters.');
 const state=await conversationSnapshot(org,body.contactId);
 if(!state.contact||!state.schemaAvailable)throw Error('Existing LinkedIn contact or conversation storage is unavailable. Your paste is retained.');
 const contacts:CaptureContact[]=state.contacts.map(c=>({id:c.contactId,identity:c.identity.slice(9),name:c.name||c.identity}));
 const resolved=resolveCaptureContact(typeof body.paste==='string'?body.paste:'',contacts,body.contactId);
 if(!resolved.contact||resolved.contact.id!==state.contact.contactId)throw Error('Choose the exact existing LinkedIn identity before saving.');
 const identity=state.contact.identity.slice(9),plan=reviewedCapturePlan(org,identity,body.messages,[...state.messages.dated,...state.messages.undated]);
 const links={relationship:`/dashboard/growth/relationships/${sourceLocator(state.contact.records[0])}?organisationId=${org}`,diary:`/dashboard/diary?organisationId=${org}`,history:`/dashboard/responses/linkedin/conversations?organisationId=${org}&contactId=${encodeURIComponent(body.contactId)}`};
 if(!plan.messages.length)return {appended:0,duplicates:plan.duplicates,revision:state.revision,links};
 const {data,error}=await supabaseAdmin.rpc('append_linkedin_conversation_batch',{p_organisation_id:org,p_actor:actor,p_identity:identity,p_revision:body.revision,p_refs:state.contact.records,p_messages:plan.messages});
 if(error||!data||!Number.isInteger(data.appended)||!Number.isInteger(data.duplicates)||data.appended<0||data.duplicates<0||data.appended+data.duplicates!==plan.messages.length)throw Error('Save not confirmed. Reload the review and retry the same messages safely. The proposed batch migration must be deployed separately. No LinkedIn message was sent.');
 return {...data,duplicates:Number(data?.duplicates||0)+plan.duplicates,links};
}
