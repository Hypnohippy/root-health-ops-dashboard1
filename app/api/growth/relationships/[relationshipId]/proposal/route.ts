import { NextResponse } from "next/server";
import { requireOrganisation,accessErrorResponse } from "@/lib/tenantAuth";
import { readOperationalIntelligence } from "@/lib/operationalIntelligence.server";
import { relationshipProposals } from "@/lib/relationshipCommands";
/** Read-only proposal; execution remains the existing explicitly confirmed domain route. */
export async function POST(req:Request,context:{params:Promise<{relationshipId:string}>}) {
 try {
  const raw=await req.text();if(raw.length>4096)throw Error("Keep the request short.");
  const body=JSON.parse(raw),tenant=await requireOrganisation(body.organisationId,false),locator=(await context.params).relationshipId;
  const data=await readOperationalIntelligence(tenant,locator);
  return NextResponse.json(relationshipProposals(body.request,tenant.organisationId,locator,data),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return accessErrorResponse(error)||NextResponse.json({error:"Proposal unavailable. Reopen the authorised relationship and review the request."},{status:409});}
}
