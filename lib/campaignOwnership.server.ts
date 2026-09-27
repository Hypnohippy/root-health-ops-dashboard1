import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AccessError } from "@/lib/tenantAuth";
export async function requireOwnedCampaignVariant(organisationId: string, variantId: string) {
  const { data: campaigns, error } = await supabaseAdmin.from("campaigns").select("id").eq("organisation_id", organisationId);
  if (error || !campaigns?.length) throw new AccessError("Campaign variant does not belong to this organisation.");
  const { data: variant, error: variantError } = await supabaseAdmin.from("campaign_variants").select("id,campaign_id")
    .eq("id", variantId).in("campaign_id", campaigns.map(c => c.id)).maybeSingle();
  if (variantError || !variant) throw new AccessError("Campaign variant does not belong to this organisation.");
  return variant;
}
