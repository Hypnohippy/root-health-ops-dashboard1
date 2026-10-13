import { NextResponse } from "next/server";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { founderReconciliation,linkFounderGmail } from "@/lib/founderMemory.server";
export async function GET(req:Request) {try {const p=new URL(req.url).searchParams,tenant=await requireFounderIntelligence(p.get("organisationId"));return NextResponse.json({candidates:await founderReconciliation(tenant.organisationId,String(p.get("recordId")||""))},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return accessErrorResponse(error)||NextResponse.json({error:"Unable to preview existing Gmail evidence."},{status:503});}}
export async function POST(req:Request) {try {const body=await req.json(),tenant=await requireFounderIntelligence(body.organisationId);return NextResponse.json({success:true,...await linkFounderGmail(tenant.organisationId,tenant.userId,body)});}catch(error){return accessErrorResponse(error)||NextResponse.json({error:error instanceof Error?error.message:"Gmail evidence was not linked."},{status:409});}}
