import { AccessError, requireOrganisation } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
function founderEmail(){return String(process.env.FOUNDER_INTELLIGENCE_EMAIL||process.env.NEXT_PUBLIC_BUILDER_LOGIN_EMAIL||"").trim().toLowerCase();}
export async function requireFounderIntelligence(requested?:unknown){
  const tenant=await requireOrganisation(requested,false);
  if(String(tenant.role||"").toLowerCase()!=="owner")throw new AccessError("Founder Intelligence is restricted to the founder.",403);
  const expected=founderEmail();if(!expected)throw new AccessError("Founder Intelligence is not configured.",503);
  const {data,error}=await supabaseAdmin.auth.admin.getUserById(tenant.userId);const actual=String(data?.user?.email||"").trim().toLowerCase();
  if(error||!actual||actual!==expected)throw new AccessError("Founder Intelligence is restricted to the founder.",403);
  const {data:plan,error:planError}=await supabaseAdmin.from("organisation_plans").select("plan,plan_key").eq("organisation_id",tenant.organisationId).limit(1).maybeSingle();
  if(planError)throw new AccessError("Unable to verify Founder workspace.",503);
  if(![String(plan?.plan||"").toLowerCase(),String(plan?.plan_key||"").toLowerCase()].includes("founder"))throw new AccessError("Founder Intelligence is restricted to the Founder workspace.",403);
  return tenant;
}
