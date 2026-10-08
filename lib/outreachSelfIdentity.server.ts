import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOrganisationProfile } from "@/lib/organisationProfile.server";
import { emptyOutreachSelfIdentity } from "@/lib/outreachSelfIdentity";

/** Caller has already authorised this tenant. Never return auth metadata or account IDs to the client. */
export async function readOutreachSelfIdentity(organisationId: string, userId: string) {
  const [profile, accounts, members] = await Promise.all([
    getOrganisationProfile(organisationId),
    supabaseAdmin.from("social_accounts").select("platform,page_id,page_name").eq("organisation_id", organisationId).eq("platform", "linkedin"),
    supabaseAdmin.from("organisation_members").select("user_id,role").eq("organisation_id", organisationId),
  ]);
  if (accounts.error || members.error) throw Error("Unable to verify sender identity; reload safely.");
  const self = emptyOutreachSelfIdentity();
  self.names.push(profile.profile.yourName, profile.profile.businessName, profile.organisationName);
  self.emails.push(profile.profile.contactEmail);
  for (const account of accounts.data || []) {
    if (account.page_name) self.names.push(account.page_name);
    if (account.page_id) self.linkedinAccountIds.push(account.page_id);
  }
  const owners = new Set<string>([userId, ...(members.data || []).filter(m => String(m.role).toLowerCase() === "owner").map(m => String(m.user_id))]);
  for (const id of owners) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    if (error || !data.user) throw Error("Unable to verify owner identity; reload safely.");
    const user = data.user, meta = user.user_metadata || {};
    if (user.email) self.emails.push(user.email);
    for (const value of [meta.full_name, meta.name, meta.display_name, [meta.given_name, meta.family_name].filter(Boolean).join(" ")]) if (typeof value === "string" && value.trim()) self.names.push(value);
    for (const value of [meta.linkedin_url, meta.profile_url]) if (typeof value === "string") self.linkedinProfiles.push(value);
  }
  return self;
}
