// app/api/social/callback/facebook/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUserId } from "@/lib/supabaseServer";

/**
 * HANDLE THE FACEBOOK OAUTH CALLBACK
 *
 * 1. Get ?code from provider
 * 2. Exchange code for a profileKey (placeholder)
 * 3. Automatically store (organisation_id, platform, profile_key) in social_profiles
 * 4. Redirect user back to /connect with success status
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect("/connect?error=missing_code");
  }

  // 1. Identify the user
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.redirect("/connect?error=not_logged_in");
  }

  // 2. Find their organisation
  const { data: orgMember, error: orgErr } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", userId)
    .single();

  if (orgErr || !orgMember?.organisation_id) {
    return NextResponse.redirect("/connect?error=no_org_found");
  }

  const organisationId = orgMember.organisation_id;

  // 3. Exchange the code for a profile_key (placeholder for now)
  // We will replace this with a real call once we select the provider.
  const tokenRes = await fetch(
    "https://example-social-provider.com/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SOCIAL_API_CLIENT_ID,
        client_secret: process.env.SOCIAL_API_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/facebook`,
        grant_type: "authorization_code",
      }),
    }
  );

  if (!tokenRes.ok) {
    return NextResponse.redirect("/connect?error=token_exchange_failed");
  }

  const tokenData = await tokenRes.json();
  const profileKey = tokenData.profileKey || tokenData.access_token;

  if (!profileKey) {
    return NextResponse.redirect("/connect?error=missing_profile_key");
  }

  // 4. Store profileKey inside social_profiles (automatic, no manual steps)
  await supabaseAdmin.from("social_profiles").upsert(
    {
      organisation_id: organisationId,
      platform: "facebook",
      profile_key: profileKey,
    },
    { onConflict: "organisation_id,platform" }
  );

  // 5. Done — go back to connect UI
  return NextResponse.redirect("/connect?connected=facebook");
}
