import { getCurrentUserId } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AccessError } from "@/lib/tenantAuth";

// Onboarding can create a first workspace, never join an existing tenant.
export async function requireOnboardingIdentity(claimedUserId?: unknown) {
  const userId = await getCurrentUserId();
  if (!userId) throw new AccessError("Not signed in.", 401);
  if (claimedUserId !== undefined && claimedUserId !== userId) {
    throw new AccessError("Cannot provision another user.");
  }
  const { data, error } = await supabaseAdmin.from("organisation_members")
    .select("organisation_id, role").eq("user_id", userId).limit(2);
  if (error) throw new AccessError("Unable to verify organisation membership.", 503);
  if ((data?.length || 0) > 1) throw new AccessError("Use workspace settings for existing organisations.", 409);
  return { userId, membership: data?.[0] || null };
}

export async function requireNewOrganisationUser(claimedUserId?: unknown) {
  const identity = await requireOnboardingIdentity(claimedUserId);
  if (identity.membership) throw new AccessError("An organisation membership already exists. Use workspace settings.", 409);
  return identity.userId;
}
