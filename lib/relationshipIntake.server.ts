import { relationshipContext,type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { readTenantHistory } from "@/lib/opsSearch.server";
import type { IdentityLedgerRow } from "@/lib/relationshipIdentityLedger";
import { resolveRelationshipIntake } from "@/lib/relationshipIntake";
import type { TruthRow } from "@/lib/relationshipTruth";
export async function readRelationshipIntake(tenant:RelationshipTenant,proposal:Parameters<typeof resolveRelationshipIntake>[1]){
 const ctx=await relationshipContext(tenant),ledger=await readTenantHistory("relationship_identity_decisions",tenant.organisationId,"*",["sequence"]) as IdentityLedgerRow[];
 const founderPrior=proposal.sourceType==="founder_research"?ctx.founder.find(r=>r.id===proposal.row.id||!!proposal.row.identity_key&&r.identity_key===proposal.row.identity_key):null;
 const prior=proposal.row.source_engine&&proposal.row.source_record_id?ctx.input.acquisition_items.find(r=>r.source_engine===proposal.row.source_engine&&r.source_record_id===proposal.row.source_record_id):null;
 return {...resolveRelationshipIntake({input:{lifecycle:ctx.input,founder:ctx.founder as TruthRow[],workspaces:ctx.workspaces as TruthRow[],links:ctx.links as TruthRow[],activities:[],tasks:[],emailMessages:[],linkedinMessages:[],founderActivities:[],acquisitionEvents:[],responseEvents:[]},policy:{organisationId:tenant.organisationId,founderAllowed:ctx.canFounder,asOf:new Date().toISOString()},ledger},{...proposal,...(prior?{sourceRef:{table:"acquisition_items",id:prior.id}}:founderPrior?{sourceRef:{table:"founder_research_records",id:String(founderPrior.id)}}:{})}),sameSubmission:!!prior||!!founderPrior};
}
