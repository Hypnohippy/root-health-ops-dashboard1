import { AccessError, requireOrganisation } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function requireFounderIntelligence(requested?:unknown){
  const tenant=await requireOrganisation(requested,false);
  if(String(tenant.role||"").toLowerCase()!=="owner")throw new AccessError("Founder Intelligence is restricted to the founder.",403);
  const {data,error}=await supabaseAdmin.rpc("founder_authorization_allowed",{p_org:tenant.organisationId,p_actor:tenant.userId});
  if(error)throw new AccessError("Unable to verify Founder workspace.",503);
  if(data!==true)throw new AccessError("Founder Intelligence is restricted to the Founder workspace.",403);
  return tenant;
}
