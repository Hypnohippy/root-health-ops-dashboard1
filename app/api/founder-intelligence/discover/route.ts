import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { cleanFounderQuery,parseFounderLane } from "@/lib/founderIntelligence";
import { discoverFounderOrganisations } from "@/lib/founderIntelligence.server";
export const runtime="nodejs";
export async function POST(req:Request){try{const body=await req.json().catch(()=>({})),tenant=await requireFounderIntelligence(body.organisationId),lane=parseFounderLane(body.lane),query=cleanFounderQuery(body.query),result=await discoverFounderOrganisations(lane,query);return NextResponse.json({success:true,organisationId:tenant.organisationId,...result},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return accessErrorResponse(error)||NextResponse.json({success:false,error:error instanceof Error?error.message:"Founder discovery failed."},{status:400});}}
