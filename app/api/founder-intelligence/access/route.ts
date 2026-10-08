import { NextResponse } from "next/server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
export const runtime="nodejs";
export async function GET(req:Request){try{const url=new URL(req.url),tenant=await requireFounderIntelligence(url.searchParams.get("organisationId"));return NextResponse.json({success:true,allowed:true,organisationId:tenant.organisationId},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return accessErrorResponse(error)||NextResponse.json({success:false,allowed:false},{status:403});}}
