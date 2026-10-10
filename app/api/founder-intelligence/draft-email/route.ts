import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { parseFounderGeography,parseFounderLane,type FounderDeepResearch } from "@/lib/founderIntelligence";
import { draftFounderFirstApproach } from "@/lib/founderIntelligence.server";
export const runtime="nodejs";
export async function POST(req:Request){try{const body=await req.json().catch(()=>({})),tenant=await requireFounderIntelligence(body.organisationId),lane=parseFounderLane(body.lane);if(!body.research||typeof body.research!=="object")throw Error("Run Founder research before drafting an email.");const draft=await draftFounderFirstApproach(lane,{...body.research,geography:parseFounderGeography(body.geography??body.research.geography)} as FounderDeepResearch);return NextResponse.json({success:true,organisationId:tenant.organisationId,draft},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return accessErrorResponse(error)||NextResponse.json({success:false,error:error instanceof Error?error.message:"Email drafting failed."},{status:400});}}
