import { NextResponse } from "next/server";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { founderActivity } from "@/lib/founderMemory.server";
export async function POST(req:Request) {try {const body=await req.json(),tenant=await requireFounderIntelligence(body.organisationId);return NextResponse.json({success:true,...await founderActivity(tenant.organisationId,tenant.userId,body)});}catch(error){return accessErrorResponse(error)||NextResponse.json({error:error instanceof Error?error.message:"Activity was not recorded."},{status:400});}}
