import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { parseFounderGeography,parseFounderLane } from "@/lib/founderIntelligence";
import { deepenFounderOrganisation } from "@/lib/founderIntelligence.server";
export const runtime="nodejs";
export async function POST(req:Request){try{const body=await req.json().catch(()=>({})),tenant=await requireFounderIntelligence(body.organisationId),lane=parseFounderLane(body.lane),o=body.organisation&&typeof body.organisation==="object"?body.organisation:{},research=await deepenFounderOrganisation(lane,{name:String(o.name||""),website:o.website?String(o.website):null,discoveryContext:o.discoveryContext?String(o.discoveryContext):null},parseFounderGeography(body.geography));return NextResponse.json({success:true,organisationId:tenant.organisationId,research},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return accessErrorResponse(error)||NextResponse.json({success:false,error:error instanceof Error?error.message:"Deep research failed."},{status:400});}}
