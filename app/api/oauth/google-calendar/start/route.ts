import {NextResponse} from 'next/server';
import {createOAuthState} from '@/lib/oauthState';
import {accessErrorResponse} from '@/lib/tenantAuth';
import {calendarConfiguration,calendarScope} from '@/lib/diaryCalendar.server';
export async function GET(req:Request){try{const c=calendarConfiguration(),state=await createOAuthState('google_calendar',new URL(req.url).searchParams.get('organisationId')),url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:c.client,redirect_uri:c.redirect,response_type:'code',scope:`openid ${calendarScope}`,state,access_type:'offline',prompt:'consent'}).toString();return NextResponse.redirect(url);}catch(error){return accessErrorResponse(error)||NextResponse.json({error:'Google Calendar read consent is not configured. No connection was changed.'},{status:503});}}
