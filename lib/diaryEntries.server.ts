import {supabaseAdmin} from './supabaseAdmin';
import {getRelationship,type RelationshipTenant} from './relationshipWorkspace.server';
import {combinedDiary,manualDiaryItem,emailDiaryItem,entryInput,type Entry,type EmailEvidence} from './diaryEvidence';
import {readGoogleCalendar} from './diaryCalendar.server';
import type {DiarySnapshot} from './diary';
import {AccessError} from './tenantAuth';
const missing=(error:{code?:string}|null)=>['42P01','PGRST205'].includes(error?.code||'');
export async function extendDiary(tenant:RelationshipTenant,base:DiarySnapshot):Promise<DiarySnapshot>{
 const notices:string[]=[],now=Date.parse(base.asOf);
 const [entries,accounts,mail]=await Promise.all([
  supabaseAdmin.from('diary_entries').select('*').eq('organisation_id',tenant.organisationId).eq('owner_user_id',tenant.userId).order('starts_at').limit(2000),
  supabaseAdmin.from('diary_calendar_accounts').select('*').eq('organisation_id',tenant.organisationId).eq('owner_user_id',tenant.userId).eq('provider','google_calendar').limit(10),
  supabaseAdmin.from('email_conversation_messages').select('id,organisation_id,gmail_message_id,gmail_thread_id,sender_email,subject,body,inbox_item_id').eq('organisation_id',tenant.organisationId).order('sent_at',{ascending:false}).limit(2000)
 ]);
 for(const result of [entries,accounts])if(result.error&&!missing(result.error))throw Error('Diary sources could not be loaded.');
 if(mail.error)throw Error('Stored email evidence could not be loaded.');
 if(entries.error)notices.push('Manual entries need the reviewed Diary migration before they can be saved.');
 if(accounts.error)notices.push('Google Calendar connection storage is not available yet.');
 if(entries.data?.length===2000||mail.data?.length===2000)notices.push('Source coverage is limited to 2,000 entries/messages. Older evidence may not be included.');
 const added=(entries.data||[]).flatMap(e=>{const item=manualDiaryItem(e as Entry,tenant.organisationId,tenant.userId,now);return item?[item]:[];});
 for(const row of mail.data||[]){const item=emailDiaryItem(row as EmailEvidence,tenant.organisationId);if(item)added.push(item);}
 let connected=!!accounts.data?.length;if(connected)notices.push("Google Calendar coverage: your primary calendar, previous 31 days and next 366 days. External events are read-only.");if(accounts.data?.length===10)notices.push("Calendar account coverage is limited to ten connected accounts.");
 try{added.push(...await readGoogleCalendar(tenant,accounts.data||[],now));}catch{notices.push('Google Calendar could not be read. Reconnect your own account; other Diary sources remain visible.');connected=false;}
 return {...combinedDiary(base,added),sourceNotices:notices,manualAvailable:!entries.error,canWriteDiary:['owner','admin','manager'].includes(tenant.role.toLowerCase()),calendarConnected:connected};
}
export async function mutateDiaryEntry(tenant:RelationshipTenant,method:string,body:Record<string,unknown>){
 if(!['owner','admin','manager'].includes(tenant.role.toLowerCase()))throw new AccessError('Diary is read-only for this role.');
 const id=typeof body.id==='string'?body.id:'',revision=Number(body.revision);
 if(method!=='POST'&&(!/^[a-f0-9-]{36}$/i.test(id)||!Number.isInteger(revision)||revision<1))throw new AccessError('Reload the entry before editing.',409);
 const select='id,revision';
 if(method==='DELETE'){const {data,error}=await supabaseAdmin.from('diary_entries').delete().eq('organisation_id',tenant.organisationId).eq('owner_user_id',tenant.userId).eq('id',id).eq('revision',revision).select(select);if(error||data?.length!==1)throw new AccessError('Entry changed or is unavailable. Reload Diary.',409);return {deleted:true};}
 let value:ReturnType<typeof entryInput>;try{value=entryInput(body);}catch{throw new AccessError("Enter a valid title, UK date/time, duration and relationship selection.",400);}
 if(value.relationship_locator)await getRelationship(tenant,value.relationship_locator,false);
 const q=method==='POST'?supabaseAdmin.from('diary_entries').insert({...value,organisation_id:tenant.organisationId,owner_user_id:tenant.userId}):supabaseAdmin.from('diary_entries').update({...value,revision:revision+1,updated_at:new Date().toISOString()}).eq('organisation_id',tenant.organisationId).eq('owner_user_id',tenant.userId).eq('id',id).eq('revision',revision);
 const {data,error}=await q.select(select);if(error||data?.length!==1)throw new AccessError('Entry changed or could not be saved. Reload Diary.',409);return {entry:data[0]};
}
