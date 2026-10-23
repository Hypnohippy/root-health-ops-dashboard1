import { readOperationalIntelligence } from "@/lib/operationalIntelligence.server";
import { NextResponse } from "next/server";
import { requireOrganisation,accessErrorResponse } from "@/lib/tenantAuth";
import { saveRelationship } from "@/lib/relationshipWorkspace.server";
type Context={params:Promise<{relationshipId:string}>};
export async function GET(req:Request,context:Context){try{const tenant=await requireOrganisation(new URL(req.url).searchParams.get("organisationId"),false);return NextResponse.json(await readOperationalIntelligence(tenant,(await context.params).relationshipId),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return accessErrorResponse(e)||NextResponse.json({error:e instanceof Error?e.message:"Relationship could not be loaded."},{status:409});}}
export async function POST(req:Request,context:Context){try{const body=await req.json(),tenant=await requireOrganisation(body.organisationId,true);return NextResponse.json(await saveRelationship(tenant,(await context.params).relationshipId,body));}catch(e){return accessErrorResponse(e)||NextResponse.json({error:e instanceof Error?e.message:"Not saved. Nothing was lost."},{status:409});}}
