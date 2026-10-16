import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { AccessError } from "@/lib/tenantAuth";
import { readIdentityReview,identityReviewPayload,previewIdentityReview,requireIdentityReviewer } from "@/lib/relationshipIdentityReconciliation.server";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex"};
export const GET=withTenantRoute(async(req,tenant)=>NextResponse.json(identityReviewPayload(await readIdentityReview(tenant,undefined,new URL(req.url).searchParams.get("example")==="synthetic")),{headers}),{write:false});
/** POST computes an in-memory rehearsal; there is no persistence mode or operational action. */
export const POST=withTenantRoute(async(req,tenant)=>{
 requireIdentityReviewer(tenant);
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new AccessError('Use the same Ops origin.',403);
 const text=await req.text();if(text.length>256000)throw new AccessError('Review preview is too large.',400);
 let body;try{body=JSON.parse(text);}catch{throw new AccessError('Invalid review preview.',400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||body.example!==undefined&&body.example!=="synthetic"||body.mode!=="dry_run"||Object.keys(body).some(k=>!["mode","organisationId","requests","example"].includes(k)))throw new AccessError('Only a read-only dry run is available.',400);
 return NextResponse.json(previewIdentityReview(await readIdentityReview(tenant,undefined,body.example==="synthetic"),tenant,body.requests),{headers});
},{write:false});
