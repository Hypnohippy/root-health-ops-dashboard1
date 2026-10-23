import { readOperationalIntelligence } from "@/lib/operationalIntelligence.server";
import { NextResponse } from "next/server";
import { requireOrganisation,accessErrorResponse } from "@/lib/tenantAuth";
import { saveRelationship } from "@/lib/relationshipWorkspace.server";
import { validateRelationshipProposal } from "@/lib/relationshipCommands";
type Context={params:Promise<{relationshipId:string}>};
export async function GET(req:Request,context:Context){try{const tenant=await requireOrganisation(new URL(req.url).searchParams.get("organisationId"),false);return NextResponse.json(await readOperationalIntelligence(tenant,(await context.params).relationshipId),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return accessErrorResponse(e)||NextResponse.json({error:e instanceof Error?e.message:"Relationship could not be loaded."},{status:409});}}
export async function POST(req:Request,context:Context){try{const body=await req.json(),tenant=await requireOrganisation(body.organisationId,true);const locator=(await context.params).relationshipId;
const canonical=await readOperationalIntelligence(tenant,locator);
if(body.proposal){
 if(body.confirmed!==true)throw Error("Explicit confirmation required.");
 const proposal=validateRelationshipProposal(body.proposal,tenant.organisationId,locator,canonical);
 if(body.action!==proposal.actionType || JSON.stringify(body.details)!==JSON.stringify(proposal.details) || body.revision!==proposal.revision)throw Error("Proposal changed. Review again.");
}
return NextResponse.json(await saveRelationship(tenant,locator,body,canonical.relationship.refs));}catch(e){return accessErrorResponse(e)||NextResponse.json({error:e instanceof Error?e.message:"Not saved. Nothing was lost."},{status:409});}}
