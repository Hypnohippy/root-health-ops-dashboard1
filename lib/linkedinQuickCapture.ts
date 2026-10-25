import {lifecycleLinkedInIdentity} from './contactLifecycle';
import {diaryDay,diaryShift} from './diary';
import {zonedInstant} from './diaryEvidence';
export type CaptureContact={id:string;identity:string;name:string};
export type CaptureMessage={sender:string;direction:'inbound'|'outbound'|'';message:string;providerDate:string;providerTime:string;date:string;time:string;messageAt:string|null;timezone:'Europe/London';precision:'time'|'date'|'unknown';status:string;include:boolean};
const dayNames=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const sender=(v:string)=>v.replace(/\((?:she\/her|he\/him|they\/them)\)/ig,'').trim().replace(/\s+/g,' ').toLowerCase();
export function captureProfiles(text:string){return [...new Set((text.match(/(?:https?:\/\/)?(?:(?:www|[a-z]{2})\.)?linkedin\.com\/(?:comm\/)?in\/[^\s<>"\]]+/ig)||[]).map(v=>lifecycleLinkedInIdentity(v.replace(/[.,;)]+$/,''))).filter((v):v is string=>!!v))];}
export function resolveCaptureContact(text:string,contacts:CaptureContact[],selectedId?:string){
 const profiles=captureProfiles(text),selected=contacts.find(c=>c.id===selectedId);
 if(selected){if(profiles.length&&!profiles.includes(selected.identity))return {contact:null,reason:'The selected contact conflicts with the pasted profile. Choose the exact identity.'};return {contact:selected,reason:profiles.length===1?'Exact profile identity':'Explicit existing-contact selection; verify the profile before save'};}
 const exact=contacts.filter(c=>profiles.includes(c.identity));
 return profiles.length===1&&exact.length===1?{contact:exact[0],reason:'Exact profile identity'}:{contact:null,reason:profiles.length?'Choose the exact existing contact; the pasted profiles are ambiguous or unavailable.':'No exact profile URL in this paste. Choose an existing LinkedIn contact explicitly.'};
}
function heading(line:string){
 const clean=line.trim();
 const verbose=clean.match(/^(.+?)\s+sent the following messages? at\s+(\d{1,2}:\d{2}\s*[AP]M)\s*:?[ \t]*$/i);
 const compact=clean.match(/^(.+?)(?:\s+[—–-]\s+|\s{2,})(\d{1,2}:\d{2}\s*[AP]M)\s*$/i);
 const match=verbose||compact;return match?{sender:match[1].trim(),clock:match[2].trim()}:null;
}
const reactions=(line:string)=>/^[\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u.test(line)&&/\p{Extended_Pictographic}/u.test(line);
export function captureChrome(line:string){return /^(?:view .{0,100}profile|seen by\b|\d(?:st|nd|rd|th) degree connection|status is\b|\(?(?:she\/her|he\/him|they\/them)\)?$|·\s*\d)/i.test(line.trim())||reactions(line);}
/** Comparison only, never rewrites existing evidence. Known copied UI headers are excluded. */
export function captureMessageText(text:string){return text.replace(/\r\n?/g,'\n').split('\n').filter(line=>!heading(line)&&!captureChrome(line)).join('\n').trim().replace(/\n{3,}/g,'\n\n');}
export function captureInstant(date:string,time:string){return date&&time?zonedInstant(date,time,'Europe/London'):null;}
function clock24(clock:string){const m=clock.match(/^(\d{1,2}):([0-5]\d)\s*(am|pm)$/i);return m&&Number(m[1])>=1&&Number(m[1])<=12?`${String(Number(m[1])%12+(m[3].toLowerCase()==='pm'?12:0)).padStart(2,'0')}:${m[2]}`:'';}
function resolveDate(label:string,reference:string,weekConfirmed:boolean){
 if(/^\d{4}-\d{2}-\d{2}$/.test(label)){try{return diaryShift(label,0)===label?label:'';}catch{return '';}}
 const absolute=label.match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
 if(absolute){const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(absolute[2].toLowerCase())+1;return resolveDate(`${absolute[3]}-${String(month).padStart(2,'0')}-${absolute[1].padStart(2,'0')}`,reference,false);}
 if(!weekConfirmed||!/^\d{4}-\d{2}-\d{2}$/.test(reference)||!resolveDate(reference,'',false))return '';
 if(/^today$/i.test(label))return reference;if(/^yesterday$/i.test(label))return diaryShift(reference,-1);
 const index=dayNames.indexOf(label.toLowerCase());return index<0?'':diaryShift(reference,-((new Date(reference+'T12:00:00Z').getUTCDay()-index+7)%7));
}
export function parseLinkedInCapture(text:string,{referenceDate,weekConfirmed,contactName,selfNames}:{referenceDate:string;weekConfirmed:boolean;contactName:string;selfNames:string[]}){
 const messages:CaptureMessage[]=[],warnings:string[]=[];let dateLabel='',date='',previousDate='',current:{sender:string;clock:string;lines:string[]}|null=null;
 function flush(){if(!current)return;const reactionOnly=current.lines.some(reactions)&&current.lines.every(l=>!l.trim()||reactions(l)||/^\d+$/.test(l.trim())),message=reactionOnly?'':captureMessageText(current.lines.join('\n'));if(message){const name=sender(current.sender),inbound=name===sender(contactName),outbound=selfNames.some(n=>sender(n)&&sender(n)===name),direction=inbound&&!outbound?'inbound':outbound&&!inbound?'outbound':'',time=clock24(current.clock),at=captureInstant(date,time),status=!direction?'Sender requires direction review':!date?'Date unresolved — review required':!at?'Time is missing or ambiguous in UK timezone':'Review parsed message';messages.push({sender:current.sender,direction,message,providerDate:dateLabel,providerTime:current.clock,date,time,messageAt:at,timezone:'Europe/London',precision:at?'time':date?'date':'unknown',status,include:!!at&&!!direction});}current=null;}
 for(const line of text.replace(/\r\n?/g,'\n').split('\n')){
  const value=line.trim();
  if(/^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|today|yesterday|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})$/i.test(value)){
   flush();dateLabel=value;date=resolveDate(value,referenceDate,weekConfirmed);if(date&&previousDate&&date<previousDate){date='';warnings.push('Date headings move backwards; correct unresolved dates explicitly.');}if(date)previousDate=date;continue;
  }
  const next=heading(line);if(next){if(current&&sender(current.sender)===sender(next.sender)&&current.clock.toLowerCase().replace(/\s/g,'')===next.clock.toLowerCase().replace(/\s/g,'')&&!current.lines.some(l=>l.trim()&&!captureChrome(l)))continue;flush();current={...next,lines:[]};continue;}
  if(current&&(reactions(line)||!captureChrome(line)))current.lines.push(line);
 }
 flush();if(!messages.length)warnings.push('No supported message boundaries found. Your pasted text is retained; use the existing snapshot log if necessary.');
 if(messages.some(m=>!m.messageAt||!m.direction))warnings.push('Unresolved rows are excluded until you supply and verify their direction/date/time.');
 return {messages,warnings,profiles:captureProfiles(text),referenceDate:referenceDate||diaryDay(new Date().toISOString())};
}
