import { requireOrganisation, isWriteRole } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normaliseProfile, toGenerationProfile, validateProfilePatch } from "@/lib/brandGrowthProfile";

// Server-only entry point. Authenticate every call; do not cache across users.
export async function getOrganisationProfile(requested?: unknown) {
  const { organisationId, role } = await requireOrganisation(requested, false);
  const { data, error } = await supabaseAdmin.from("organisation_profiles")
    .select("profile,updated_at").eq("organisation_id", organisationId).maybeSingle();
  if (error) throw error;
  // Profile branding is canonical; only the organisation name is a safe fallback.
  const { data: organisation, error: orgError } = await supabaseAdmin.from("organisations")
    .select("id,name").eq("id", organisationId).maybeSingle();
  if (orgError) throw orgError;
  const profile = normaliseProfile(data?.profile, normaliseProfile({
    businessName: organisation?.name || "",
  }));
  const brandPrimaryColor = "#10b981";
  return { organisationId, canEdit: isWriteRole(role), brandPrimaryColor, organisationName: String(organisation?.name || profile.businessName || "Your organisation"), profile, updatedAt: data?.updated_at ?? null };
}

export async function updateOrganisationProfile(requested: unknown, input: unknown) {
  const { organisationId, userId } = await requireOrganisation(requested);
  const patch = validateProfilePatch(input);
  const { error } = await supabaseAdmin.rpc("merge_organisation_profile", {
    p_organisation_id: organisationId, p_patch: patch, p_user_id: userId,
  });
  if (error) throw error;
  return getOrganisationProfile(organisationId);
}

export async function getOrganisationGenerationProfile(requested?: unknown) {
  const { organisationId, profile, updatedAt } = await getOrganisationProfile(requested);
  return { organisationId, updatedAt, ...toGenerationProfile(profile) };
}
