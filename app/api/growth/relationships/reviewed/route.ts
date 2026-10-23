import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { confirmReviewedDecision, previewSeparation, previewResearchSave, reviewRequestKey, ReviewedStateChanged } from "@/lib/reviewedIdentity.server";
import { relationshipContext } from "@/lib/relationshipWorkspace.server";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req:Request) {
 try {
  const params=new URL(req.url).searchParams,tenant=await requireOrganisation(params.get("organisationId"),true),ctx=await relationshipContext(tenant),q=(params.get("q")||"").trim().toLowerCase();
  if(q.length<3)return json({sources:[]});
  const rows=[...Object.entries(ctx.input).flatMap(([table,rows])=>rows.map(row=>({table,row}))),...ctx.founder.map(row=>({table:"founder_research_records",row}))];
  return json({sources:rows.filter(({row})=>[row.person,row.person_name,row.author_name,row.target_name,row.company,row.entity].some(value=>String(value||"").toLowerCase().includes(q))).slice(0,30).map(({table,row})=>({ref:{table,id:row.id},label:String(row.person||row.person_name||row.author_name||row.target_name||row.company||row.entity||row.id),company:row.company||null}))});
 }catch(error){return accessErrorResponse(error)||json({error:"Review sources unavailable."},503);}
}
export async function POST(req:Request) {
 try {
  if(Number(req.headers.get("content-length")||0)>250000)return json({error:"Review request is too large."},413);
  const body=await req.json(),tenant=await requireOrganisation(body.organisationId,true);
  if(body.action==="confirm")return json(await confirmReviewedDecision(tenant,body.reviewToken,body.confirmed,body.sourceUrls));
  const key=reviewRequestKey(body.key);
  if(body.action==="separation_preview")return json(await previewSeparation(tenant,body.refs,key));
  if(body.action==="research_preview"&&typeof body.locator==="string")return json(await previewResearchSave(tenant,body.locator,key));
  return json({error:"Choose a reviewed action."},400);
 } catch(error) {if(error instanceof ReviewedStateChanged)return json({error:error.message,currentReview:error.currentReview},409);return accessErrorResponse(error)||json({error:"Review unavailable. No action was confirmed. Reopen the exact recorded source."},409);}
}
