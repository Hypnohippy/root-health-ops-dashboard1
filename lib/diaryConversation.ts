import {diaryDay,diaryShift,diaryWeek,type DiaryItem} from './diary';
import {zonedInstant,emailAppointment} from './diaryEvidence';
export type ConversationMessage={id:string;at:string|null;direction:string;text:string};
export type AppointmentConversation={organisationId:string;relationshipId:string;identity:string;sourceId:string;provider:'linkedin'|'email';name:string;company:string|null;href:string;messages:ConversationMessage[]};
export type ConversationState='INTENT'|'AVAILABILITY'|'PROPOSED'|'ACCEPTED'|'CONFIRMED'|'CANCELLED'|'RESCHEDULE_PENDING'|'UNCERTAIN';
export type ConversationAppointment={state:ConversationState;at:string|null;channel:string|null;caller:'contact'|'owner'|null;basis:string;proposal:string|null;acceptance:string|null;confirmation:string|null;dateBasis?:string;uid?:string|null};
const weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
// Quoted history and pasted multi-speaker snapshots never become separate messages.
export function currentConversationText(body:string){return body.split(/\n(?:On .+wrote:|From:|[- ]*Original Message[- ]*)/i)[0].split('\n').filter(l=>!/^\s*>/.test(l)).join('\n').slice(0,10000).toLowerCase();}
function timestamp(at:string|null):at is string{return !!at&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(at)&&Number.isFinite(Date.parse(at));}
function times(text:string){
 const result=new Set<string>();
 for(const m of text.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b|\b([01]\d|2[0-3]):([0-5]\d)\b/g)){
  if(m[1]){const h=Number(m[1]);if(h<1||h>12)continue;result.add(`${String(h%12+(m[3]==='pm'?12:0)).padStart(2,'0')}:${m[2]||'00'}`);}else result.add(`${m[4]}:${m[5]}`);
 }return [...result];
}
/** Bounded deterministic grammar, not a language model. Unknown or contradictory evidence stays review-only. */
export function conversationAppointment(conversation:AppointmentConversation):ConversationAppointment{
 let result:ConversationAppointment={state:'UNCERTAIN',at:null,channel:null,caller:null,basis:'No deterministic agreement',proposal:null,acceptance:null,confirmation:null};
 const messages=conversation.messages.filter(m=>m.text.trim());
 if(!conversation.identity||!conversation.relationshipId||!conversation.sourceId||!messages.length||messages.some(m=>!timestamp(m.at)||!['inbound','outbound'].includes(m.direction)))return {...result,basis:'Missing authoritative message date/direction or exact identity'};
 const ordered=[...messages].sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
 if(ordered.some((m,i)=>i>0&&Date.parse(m.at!)===Date.parse(ordered[i-1].at!)))return {...result,basis:'Message order is ambiguous'};
 let week:string[]|null=null,weekAt=0,activeDate:string|null=null,proposalDirection='',rescheduling=false,meetingContext=false,pendingHour:number|null=null;
 for(const m of ordered){
  const text=currentConversationText(m.text).replace(/[’‘]/g,"'"),day=diaryDay(m.at!),explicitDates=[...new Set(text.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[])];
  if(conversation.provider==='email'&&/BEGIN:VEVENT/.test(m.text)){
   meetingContext=true;
   const invitation=emailAppointment(m.text);
   if(/METHOD:CANCEL|STATUS:CANCELLED/.test(m.text)){result={...result,state:'CANCELLED',at:null,basis:'Later structured cancellation',confirmation:m.id};continue;}
   if(invitation.state==='CONFIRMED'&&invitation.at){result={...result,state:'CONFIRMED',at:invitation.at,proposal:m.id,acceptance:m.id,uid:invitation.uid,basis:invitation.basis,dateBasis:invitation.basis};activeDate=diaryDay(invitation.at);proposalDirection=m.direction;}
   else result={...result,state:'UNCERTAIN',at:null,basis:'Invitation requires review'};
   continue;
  }
  if(/\bnext week\b/.test(text)){week=diaryWeek(diaryShift(day,7));weekAt=Date.parse(m.at!);}
  if(week&&Date.parse(m.at!)-weekAt>7*86400000){week=null;activeDate=null;}
  const namedDays=weekdays.filter(d=>new RegExp(`\\b${d}\\b`).test(text)),clock=times(text);
  meetingContext ||= /\b(?:meeting|chat|call|appointment|speak|zoom|whats?app)\b/.test(text);
  const meeting=meetingContext||!!result.proposal;
  if(meeting&&/\b(?:cancel(?:led)?|can't make|cannot make|no longer (?:meet|available)|won't be able|not going ahead)\b/.test(text)){
   result={...result,state:'CANCELLED',at:null,basis:'Later cancellation',confirmation:m.id};activeDate=null;continue;
  }
  if(meeting&&/\b(?:reschedul\w*|move (?:our|the) (?:call|meeting)|another (?:day|time))\b/.test(text)){
   result={...result,state:'RESCHEDULE_PENDING',at:null,basis:'Reschedule needs a new agreement',proposal:null,acceptance:null,confirmation:null};rescheduling=true;activeDate=null;
  }
  // A timezone outside the operational zone or hedged/negative agreement is never silently accepted.
  if(/\b(?:maybe|perhaps|possibly|not sure|not confirmed|not perfect|doesn't work|does not work)\b|\b(?:est|pst|cet|utc|gmt[+-])\b/.test(text)&&meeting){result={...result,state:'UNCERTAIN',at:null,basis:'Hedged, negative or non-operational timezone evidence'};continue;}
  let date:string|null=null;
  if(explicitDates.length===1)date=explicitDates[0];
  else if(!explicitDates.length&&namedDays.length===1&&week)date=week[weekdays.indexOf(namedDays[0])];
  if(date&&explicitDates.length&&namedDays.length===1&&diaryWeek(date).indexOf(date)!==weekdays.indexOf(namedDays[0])){result={...result,state:'UNCERTAIN',at:null,proposal:null,acceptance:null,basis:'Weekday conflicts with the explicit date'};activeDate=null;continue;}
  const dateMention=explicitDates.length>0||namedDays.length>0;
  if(explicitDates.length>1||clock.length>1){
   // Multiple options are availability, not a proposal or acceptance.
   result={...result,state:rescheduling?'RESCHEDULE_PENDING':'AVAILABILITY',at:null,basis:'Multiple options; no single agreed occurrence',proposal:null,acceptance:null};activeDate=null;continue;
  }
  if(dateMention&&namedDays.length>1){result={...result,state:'AVAILABILITY',at:null,basis:'Multiple days offered',proposal:null,acceptance:null};activeDate=null;continue;}
  if(dateMention&&!date){result={...result,state:'UNCERTAIN',at:null,basis:'Relative weekday lacks an authoritative active week',proposal:null,acceptance:null};activeDate=null;continue;}
  if(date&&result.at&&diaryDay(result.at)!==date&&!clock.length){result={...result,state:'UNCERTAIN',at:null,proposal:null,acceptance:null,basis:'Changed date without an agreed time'};pendingHour=null;}
  if(date)activeDate=date;
  const agreementText=text.replace(/if that's ok\??/g,'');
  const agreement=/\b(?:perfect|works for me|agreed|confirmed|see you|speak then|that works|that(?:'s| is| all)? (?:good|fine)|yes|i accept)\b/.test(text)&&! /\b(?:if|would|could|shall|how does|does .+ work|can we|not|can't|cannot)\b|(?:^|[.!?]\s*)(?:is|does|how|can)\b/.test(agreementText);
  const channel=/\bwhats?app\b/.test(text)?'WhatsApp':/\bzoom\b/.test(text)?'Zoom':/\b(?:phone|telephone)\b/.test(text)?'Phone':null;
  // A stated preference can safely resolve a previous choice; an unqualified list cannot.
  const channels=(text.match(/\b(?:whats?app|zoom|phone|telephone)\b/g)||[]);
  const chosenChannel=/prefer whats?app/.test(text)?'WhatsApp':new Set(channels).size===1?channel:null;
  if(chosenChannel)result.channel=chosenChannel;
  if(/\bi will call you\b/.test(text))result.caller=m.direction==='inbound'?'contact':'owner';
  const at=activeDate&&clock.length===1?zonedInstant(activeDate,clock[0],'Europe/London'):null;
  const bare=text.match(/\b(?:at|how (?:about|does))\s+(1[0-2]|[1-9])\b(?!\s*(?:am|pm|:))/);
  if(meeting&&activeDate&&!clock.length&&bare){result={...result,state:'PROPOSED',at:null,proposal:m.id,acceptance:null,basis:'Proposal hour needs AM/PM clarification',dateBasis:explicitDates.length?'Explicit date; accepted UK time':`Named weekday in next week established at ${new Date(weekAt).toISOString()}; accepted UK time`};pendingHour=Number(bare[1]);proposalDirection=m.direction;continue;}
  if(clock.length&&(!at||Date.parse(at)<Date.parse(m.at!))){result={...result,state:'UNCERTAIN',at:null,basis:'Time/date is missing, invalid, ambiguous or already past',proposal:null,acceptance:null};continue;}
  if(at&&meeting){
   const same=(result.at===at||pendingHour!==null&&Number(clock[0].slice(0,2))%12===pendingHour%12)&&!!result.proposal;
   if(same&&agreement&&m.direction!==proposalDirection){result={...result,state:'CONFIRMED',at,acceptance:m.id,basis:'Opposite participant accepted the active deterministic proposal'};rescheduling=false;pendingHour=null;}
   else {const dateBasis=explicitDates.length?'Explicit date and UK time':`Named weekday in next week established at ${new Date(weekAt).toISOString()}; Europe/London`;result={...result,state:rescheduling?'RESCHEDULE_PENDING':'PROPOSED',at,proposal:m.id,acceptance:null,confirmation:null,basis:dateBasis,dateBasis,uid:null};proposalDirection=m.direction;pendingHour=null;}
  }else if(result.proposal&&result.at&&agreement&&m.direction!==proposalDirection){result={...result,state:'CONFIRMED',acceptance:m.id,basis:'Opposite participant accepted the active deterministic proposal'};rescheduling=false;}
  else if(!result.proposal&&meeting&&!dateMention&&!clock.length&&!rescheduling)result={...result,state:/\b(?:free|available|schedule|availability)\b/.test(text)?'AVAILABILITY':'INTENT'};
  if(result.state==='CONFIRMED'&&(chosenChannel||/\bi will call you\b/.test(text)))result.confirmation=m.id;
 }
 return result;
}
export function conversationDiaryItem(conversation:AppointmentConversation,org:string):DiaryItem|null{
 if(conversation.organisationId!==org)return null;
 const e=conversationAppointment(conversation);if(e.state!=='CONFIRMED'||!e.at)return null;
 const label=conversation.provider==='linkedin'?'LinkedIn':'email',key=JSON.stringify([org,conversation.provider,conversation.identity,conversation.relationshipId,conversation.sourceId,e.at]);
 return {id:`conversation:${key}`,appointmentKey:e.uid?`${e.uid}|${e.at}`:`conversation:${key}`,title:`${conversation.name} — ${e.channel?e.channel+' call':'Meeting'}`,company:conversation.company,at:e.at,endAt:null,timeZone:'Europe/London',dateOnly:false,type:'Meeting',status:`Confirmed from ${label} conversation`,action:`Confirmed from ${label} conversation${e.caller?`; caller: ${e.caller==='contact'?conversation.name:'outbound participant'}`:''}`,actionable:false,workspace:'Relationships',href:conversation.href,source:{provider:'conversation_confirmation',organisationId:org,relationshipId:conversation.relationshipId,conversationId:conversation.sourceId,channel:conversation.provider,dateSource:e.dateBasis||e.basis},readOnly:true,channel:e.channel||undefined,provenance:[{source:`${label} proposal`,id:e.proposal!,detail:e.dateBasis||'Authoritative dated message; open the linked relationship to inspect the conversation.'},{source:`${label} acceptance`,id:e.acceptance!,detail:e.basis},...(e.confirmation?[{source:'Channel / caller confirmation',id:e.confirmation}]:[])]};
}
