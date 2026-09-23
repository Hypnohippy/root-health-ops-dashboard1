import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function loadFacebookConnection(organisationId: string) {
  const { data, error } = await supabaseAdmin.from("social_accounts")
    .select("page_id,page_access_token")
    .eq("organisation_id", organisationId).eq("platform", "facebook")
    .eq("is_active", true).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
