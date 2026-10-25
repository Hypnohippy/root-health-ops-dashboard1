import {diaryDay,diaryWeek,type DiaryItem,type DiarySnapshot} from './diary';
export type Entry={id:string;organisation_id:string;owner_user_id:string;title:string;entry_type:'Meeting'|'Task'|'Reminder';starts_at:string;ends_at:string|null;time_zone:string;notes:string;relationship_locator:string|null;revision:number};
export type EmailEvidence={id:string;organisation_id:string;gmail_message_id:string;gmail_thread_id:string;sender_email?:string|null;subject:string;body:string;inbox_item_id?:string|null};
export function zonedInstant(date:string,time:string,zone:string):string|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
 const guess=Date.parse(`${date}T${time}:00Z`);if(!Number.isFinite(guess))return null;
 try{const format=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const matches=[];
 for(let offset=-840;offset<=840;offset+=15){const at=new Date(guess-offset*60000);if(format.format(at)===`${date} ${time}`)matches.push(at.toISOString());}return matches.length===1?matches[0]:null;
 }catch{return null;}
}
export function entryInput(value:Record<string,unknown>){
 const title=typeof value.title==='string'?value.title.trim():'',type=value.entry_type,notes=typeof value.notes==='string'?value.notes:'',zone='Europe/London';
 const start=zonedInstant(String(value.date||''),String(value.time||''),zone),duration=Number(value.duration||0);
 if(!title||title.length>200||!['Meeting','Task','Reminder'].includes(String(type))||notes.length>5000||!start||!Number.isInteger(duration)||duration<0||duration>1440)throw Error('Enter a title, valid UK date/time and duration of 0–1440 minutes. Ambiguous or missing daylight-saving times need another time.');
 const link=typeof value.relationship_locator==='string'&&value.relationship_locator?value.relationship_locator:null;
 if(link&&!/^(workspace|inbox|target|acquisition)_[a-f0-9-]{36}$/i.test(link))throw Error('Choose an existing relationship.');
 return {title,entry_type:type as Entry['entry_type'],starts_at:start,ends_at:duration?new Date(Date.parse(start)+duration*60000).toISOString():null,time_zone:zone,notes,relationship_locator:link};
}
export function manualDiaryItem(e:Entry,org:string,user:string,now:number):DiaryItem|null{
 if(e.organisation_id!==org||e.owner_user_id!==user)return null;
 return {id:`manual:${e.id}`,title:e.title,company:null,type:e.entry_type,at:e.starts_at,endAt:e.ends_at,timeZone:e.time_zone,dateOnly:false,status:'Manually recorded',action:e.notes||'Review your diary entry',actionable:e.entry_type!=='Meeting'&&Date.parse(e.starts_at)<=now,workspace:'Manual entry',href:e.relationship_locator?`/dashboard/growth/relationships/${e.relationship_locator}?organisationId=${org}`:`/dashboard/diary?organisationId=${org}&view=Week&date=${diaryDay(e.starts_at)}#diary-manual:${e.id}`,source:{provider:'manual_diary',organisationId:org,ownerUserId:user,recordId:e.id,dateSource:'starts_at'},manualEntry:{id:e.id,revision:e.revision,notes:e.notes,relationshipLocator:e.relationship_locator},provenance:[{source:'Manual entry',id:e.id}]};
}
function instant(value:unknown):string|null{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return null;const day=value.slice(0,10);if(new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)return null;return new Date(value).toISOString();}
export function googleDiaryItem(value:Record<string,unknown>,org:string,user:string,account:string):DiaryItem|null{
 const start=value.start as {date?:string;dateTime?:string;timeZone?:string}|undefined,end=value.end as typeof start;
 const attendees=Array.isArray(value.attendees)?value.attendees as {self?:boolean;responseStatus?:string}[]:[];
 if(value.status!=='confirmed'||typeof value.id!=='string'||attendees.some(a=>a.self&&a.responseStatus!=='accepted'))return null;
 const at=start?.dateTime?instant(start.dateTime):start?.date&&/^\d{4}-\d{2}-\d{2}$/.test(start.date)?start.date:null;if(!at)return null;
 const href=typeof value.htmlLink==='string'&&value.htmlLink.startsWith('https://calendar.google.com/')?value.htmlLink:`https://calendar.google.com/calendar/u/0/r`;
 return {id:`google:${org}:${account}:${value.id}`,title:typeof value.summary==='string'?value.summary:'Calendar appointment',company:null,at,endAt:end?.dateTime?instant(end.dateTime):end?.date||null,timeZone:start?.timeZone||null,dateOnly:!start?.dateTime,type:['birthday','focusTime','workingLocation','outOfOffice'].includes(String(value.eventType))?'Reminder':'Meeting',status:'Confirmed calendar event',action:'Review in Google Calendar',actionable:false,workspace:'Google Calendar',href,source:{provider:'google_calendar',organisationId:org,ownerUserId:user,accountId:account,externalEventId:value.id,dateSource:'Google start'},readOnly:true,appointmentKey:typeof value.iCalUID==='string'?`${value.iCalUID}|${at}`:undefined,location:typeof value.location==='string'?value.location:null,meetingUrl:typeof value.hangoutLink==='string'&&value.hangoutLink.startsWith('https://meet.google.com/')?value.hangoutLink:null,provenance:[{source:'Google Calendar',id:value.id}]};
}
export type AppointmentEvidence={state:'PROPOSED'|'CONFIRMED'|'UNCERTAIN';at:string|null;end:string|null;zone:string|null;uid:string|null;basis:string;support:string};
function icsTime(line:string):{at:string|null;zone:string|null}{
 const [,zone,y,m,d,h,min,sec,z]=line.match(/^DTSTART(?:;TZID=([^:;]+))?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)||[];
 if(!y)return {at:null,zone:null};return {at:z?instant(`${y}-${m}-${d}T${h}:${min}:${sec}Z`):zone?zonedInstant(`${y}-${m}-${d}`,`${h}:${min}`,zone):null,zone:z?'UTC':zone||null};
}
export function emailAppointment(body:string):AppointmentEvidence{
 // Only current, unquoted text. Relative days/year/timezone are deliberately not guessed.
 const text=body.split(/\n(?:On .+wrote:|From:|[- ]*Original Message[- ]*)/i)[0].split('\n').filter(l=>!/^\s*>/.test(l)).join('\n').slice(0,50000);
 const uncertain=(basis:string):AppointmentEvidence=>({state:'UNCERTAIN',at:null,end:null,zone:null,uid:null,basis,support:text});
 if(/BEGIN:VEVENT/.test(text)){
  const blocks=text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g);if(blocks?.length!==1)return uncertain('Multiple or incomplete invitations require review');
  const block=blocks[0].replace(/\r\n[ \t]/g,''),lines=block.split(/\r?\n/);
  const confirmed=lines.includes('STATUS:CONFIRMED')||/METHOD:REPLY/.test(text)&&/ATTENDEE[^\r\n]*PARTSTAT=ACCEPTED/.test(block);
  if(!confirmed||/STATUS:(?:CANCELLED|TENTATIVE)/.test(block)||/METHOD:CANCEL/.test(text))return {...uncertain('Invitation not confirmed'),state:'PROPOSED'};
  const time=icsTime(lines.find(l=>l.startsWith('DTSTART'))||''),uid=lines.find(l=>l.startsWith('UID:'))?.slice(4)||null;
  return {state:time.at?'CONFIRMED':'UNCERTAIN',at:time.at,end:null,zone:time.zone,uid,basis:'Structured calendar invitation confirmation',support:block};
 }
 if(/\b(?:would|could|can we|shall we|propos(?:e|ed|al)|tentative|cancelled|not confirmed|no longer|reschedul)\b|https?:\/\/\S*(?:calendly|booking)/i.test(text))return {...uncertain('Proposal, cancellation or booking link is not confirmation'),state:'PROPOSED'};
 if(!/(?:\b(?:meeting|call|appointment)\b.{0,80}\b(?:confirmed|accepted)\b|\b(?:confirmed|accepted)\b.{0,80}\b(?:meeting|call|appointment)\b|\bsee you\b)/i.test(text))return uncertain('No explicit appointment confirmation');
 const matches=[...text.matchAll(/\b(\d{4}-\d{2}-\d{2})[ T](?:at\s+)?(\d{2}:\d{2})(?::\d{2})?\s*(Z|[+-]\d{2}:\d{2}|Europe\/London|UTC)\b/g)];
 if(matches.length!==1)return uncertain('An unambiguous absolute date, time and explicit timezone are required');
 const [,date,time,zone]=matches[0],at=zone==='Europe/London'?zonedInstant(date,time,zone):instant(`${date}T${time}:00${zone==='UTC'?'Z':zone}`);
 return {state:at?'CONFIRMED':'UNCERTAIN',at,end:null,zone,uid:null,basis:'Explicit confirmation with absolute date/time and timezone',support:text};
}
export function emailDiaryItem(row:EmailEvidence,org:string):DiaryItem|null{
 if(row.organisation_id!==org)return null;const e=emailAppointment(row.body);if(e.state!=='CONFIRMED'||!e.at)return null;
 return {id:`email:${row.gmail_message_id}`,title:row.subject||'Confirmed email appointment',company:null,at:e.at,endAt:e.end,timeZone:e.zone,dateOnly:false,type:'Meeting',status:e.basis,action:'Review the exact email confirmation',actionable:false,workspace:'Email confirmation',href:`/dashboard/responses?organisationId=${org}${row.inbox_item_id?`&itemId=${row.inbox_item_id}`:''}`,source:{provider:'email_confirmation',organisationId:org,recordId:row.id,messageId:row.gmail_message_id,threadId:row.gmail_thread_id,dateSource:e.basis},readOnly:true,appointmentKey:e.uid?`${e.uid}|${e.at}`:undefined,provenance:[{source:'Email confirmation',id:row.gmail_message_id,detail:`${row.sender_email||'Sender not recorded'} · ${e.basis}\n${e.support}`}]};
}
export function combinedDiary(base:DiarySnapshot,added:DiaryItem[]):DiarySnapshot{
 const map=new Map<string,DiaryItem>(),appointments=new Map<string,DiaryItem>();
 for(const item of [...base.items,...added]){
  if(map.has(item.id))continue;
  // UID + exact occurrence start is required; never match names/titles/people.
  const previous=item.type==='Meeting'&&item.appointmentKey?appointments.get(item.appointmentKey):null;
  if(previous){previous.provenance=[...(previous.provenance||[]),...(item.provenance||[])];continue;}
  const copy={...item,provenance:item.provenance?[...item.provenance]:undefined};map.set(copy.id,copy);if(copy.type==='Meeting'&&copy.appointmentKey)appointments.set(copy.appointmentKey,copy);
 }
 const items=[...map.values()].sort((a,b)=>String(a.at||'9999').localeCompare(String(b.at||'9999'))||a.id.localeCompare(b.id)),week=diaryWeek(base.today);
 return {...base,items,summary:base.summary?{...base.summary,meetingsToday:items.filter(i=>i.type==='Meeting'&&diaryDay(i.at)===base.today).length,meetingsThisWeek:items.filter(i=>i.type==='Meeting'&&week.includes(diaryDay(i.at))).length,tasksToday:items.filter(i=>i.type==='Task'&&diaryDay(i.at)===base.today).length,overdueTasks:items.filter(i=>i.type==='Task'&&i.actionable&&i.at&&diaryDay(i.at)<base.today).length}:undefined};
}
