import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { parseFounderLane,type FounderDeepResearch } from "@/lib/founderIntelligence";
import { researchFounderContacts } from "@/lib/founderIntelligence.server";
export const runtime="nodejs";
export async function POST(req:Request){try{const body=await req.json().catch(()=>({})),tenant=await requireFounderIntelligence(body.organisationId),lane=parseFounderLane(body.lane);if(!body.research||typeof body.research!=="object")throw Error("Run deep research before finding contacts.");const research=await researchFounderContacts(lane,body.research as FounderDeepResearch);return NextResponse.json({success:true,organisationId:tenant.organisationId,research},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return accessErrorResponse(error)||NextResponse.json({success:false,error:error instanceof Error?error.message:"Contact research failed."},{status:400});}}
