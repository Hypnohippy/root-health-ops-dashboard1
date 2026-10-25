import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {supabaseAdmin} from './supabaseAdmin';
import type {RelationshipTenant} from './relationshipWorkspace.server';
import {googleDiaryItem} from './diaryEvidence';
import type {DiaryItem} from './diary';
export const calendarScope='https://www.googleapis.com/auth/calendar.events.readonly';
function key(){const k=Buffer.from(process.env.DIARY_CALENDAR_TOKEN_KEY||'','base64');if(k.length!==32)throw Error('Calendar credentials are not configured.');return k;}
export function encryptCalendarTokens(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(x=>x.toString('base64url')).join('.');}
function decrypt(value:string){const [iv,tag,body]=value.split('.').map(x=>Buffer.from(x,'base64url'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8'));}
export function calendarConfiguration(){const client=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET,redirect=process.env.GOOGLE_CALENDAR_REDIRECT_URI;if(!client||!secret||!redirect)throw Error('Calendar OAuth configuration is required.');const url=new URL(redirect);if(url.protocol!=='https:'&&url.hostname!=='localhost')throw Error('Invalid Calendar callback.');key();return {client,secret,redirect};}
async function tokenRequest(body:URLSearchParams,signal=AbortSignal.timeout(15000)){const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body,signal});if(!r.ok)throw Error('Google authorization is unavailable.');return r.json();}
export async function connectCalendar(tenant:RelationshipTenant,code:string){
 const c=calendarConfiguration(),tokens=await tokenRequest(new URLSearchParams({client_id:c.client,client_secret:c.secret,redirect_uri:c.redirect,code,grant_type:'authorization_code'}));
 if(!tokens.access_token||!tokens.refresh_token||!String(tokens.scope||'').split(' ').includes(calendarScope))throw Error('Calendar read consent with offline access is required.');
 const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Calendar account could not be verified.');const account=await response.json();if(typeof account.sub!=='string'||!account.sub)throw Error('Calendar account could not be verified.');
 const {error}=await supabaseAdmin.from('diary_calendar_accounts').upsert({organisation_id:tenant.organisationId,owner_user_id:tenant.userId,provider:'google_calendar',external_account_id:account.sub,encrypted_tokens:encryptCalendarTokens({refresh_token:tokens.refresh_token}),scopes:String(tokens.scope).split(' '),updated_at:new Date().toISOString()},{onConflict:'organisation_id,owner_user_id,provider,external_account_id'});if(error)throw Error('Calendar connection could not be saved.');
}
export async function readGoogleCalendar(tenant:RelationshipTenant,accounts:Record<string,unknown>[],now:number):Promise<DiaryItem[]>{
 const items:DiaryItem[]=[],deadline=AbortSignal.timeout(20000);const c=accounts.length?calendarConfiguration():null;
 for(const account of accounts){
  if(account.organisation_id!==tenant.organisationId||account.owner_user_id!==tenant.userId||account.provider!=='google_calendar'||!Array.isArray(account.scopes)||!account.scopes.includes(calendarScope))throw Error('Calendar account ownership or scope is unavailable.');
  const saved=decrypt(String(account.encrypted_tokens));const tokens=await tokenRequest(new URLSearchParams({client_id:c!.client,client_secret:c!.secret,refresh_token:saved.refresh_token,grant_type:'refresh_token'}),deadline);if(!tokens.access_token)throw Error('Reconnect Google Calendar.');
  let page:string|undefined,pages=0;
  do{const url=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');url.search=new URLSearchParams({timeMin:new Date(now-31*86400000).toISOString(),timeMax:new Date(now+366*86400000).toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250',showDeleted:'false',...(page?{pageToken:page}:{})}).toString();
   const response=await fetch(url,{cache:"no-store",headers:{Authorization:`Bearer ${tokens.access_token}`},signal:deadline});if(!response.ok)throw Error('Google Calendar could not be read.');const result=await response.json();for(const event of result.items||[]){const item=googleDiaryItem(event,tenant.organisationId,tenant.userId,String(account.id));if(item)items.push(item);}page=result.nextPageToken;if(++pages>=10&&page)throw Error('Calendar result limit reached; narrow the calendar before reconnecting.');
  }while(page);
 }
 return items;
}
