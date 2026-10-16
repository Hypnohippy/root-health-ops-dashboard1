import {NextResponse} from 'next/server';
import {withTenantRoute} from '@/lib/tenantRoute.server';
import {AccessError} from '@/lib/tenantAuth';
import {saveIdentityDecision} from '@/lib/relationshipIdentityLedger.server';
/** Dedicated gated append; never shares the rehearsal mode dispatch. */
export const POST=withTenantRoute(async(req,tenant)=>{
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new AccessError('Same-origin review required.',403);
 const text=await req.text();if(text.length>300000)throw new AccessError('Review request too large.',400);
 let body;try{body=JSON.parse(text);}catch{throw new AccessError('Invalid decision request.',400);}
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['organisationId','request'].includes(k))||!body.request||Object.keys(body.request).some(k=>!['candidateId','candidateRevision','evidenceIdsShown','choice','confirmed','requestId','note','previousDecisionId'].includes(k)))throw new AccessError('One explicit decision is required.',400);
 return NextResponse.json(await saveIdentityDecision(tenant,body.request),{headers:{'Cache-Control':'private, no-store'}});
},{write:true});
