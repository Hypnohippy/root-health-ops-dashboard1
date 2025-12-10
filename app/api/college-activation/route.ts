// app/api/college-activation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      code,
      userId,
      userEmail,
      organisationName,
    }: {
      code?: string;
      userId?: string;
      userEmail?: string;
      organisationName?: string;
    } = body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { success: false, error: "Activation code is required." },
        { status: 200 }
      );
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "User ID is required to activate a college plan.",
        },
        { status: 200 }
      );
    }

    // 1) Look up the activation code
    const { data: codeRows, error: codeError } = await supabaseAdmin
      .from("college_activation_codes")
      .select(
        "id, college_id, code, max_uses, uses_count, trial_months, expires_at"
      )
      .eq("code", code.trim())
      .limit(1);

    if (codeError) {
      console.error("[college-activation] Error fetching code", codeError);
      return NextResponse.json(
        {
          success: false,
          error: "Could not verify activation code. Please try again.",
        },
        { status: 200 }
      );
    }

    const activation = codeRows?.[0];

    if (!activation) {
      return NextResponse.json(
        { success: false, error: "Invalid activation code." },
        { status: 200 }
      );
    }

    if (
      typeof activation.expires_at === "string" &&
      new Date(activation.expires_at) < new Date()
    ) {
      return NextResponse.json(
        { success: false, error: "This activation code has expired." },
        { status: 200 }
      );
    }

    if (activation.uses_count >= activation.max_uses) {
      return NextResponse.json(
        { success: false, error: "This activation code has already been used." },
        { status: 200 }
      );
    }

    const trialMonths =
      typeof activation.trial_months === "number"
        ? activation.trial_months
        : 6;

    const now = new Date();
    const trialEnds = new Date(
      now.getFullYear(),
      now.getMonth() + trialMonths,
      now.getDate()
    );

    // 2) Create organisation (simple name default)
    const safeOrgName =
      organisationName ||
      (userEmail
        ? `Practice of ${userEmail.split("@")[0]}`
        : "New Root Health Practice");

    const { data: orgInsert, error: orgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        name: safeOrgName,
        // add any other default fields your organisations table requires
      })
      .select("id")
      .single();

    if (orgError || !orgInsert) {
      console.error("[college-activation] Error creating organisation", orgError);
      return NextResponse.json(
        {
          success: false,
          error: "Could not create organisation for this activation.",
        },
        { status: 200 }
      );
    }

    const organisationId = orgInsert.id as string;

    // 3) Link user to organisation as owner (or 'admin')
    const { error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .insert({
        organisation_id: organisationId,
        user_id: userId,
        role: "owner", // adjust to your existing role system
      });

    if (memberError) {
      console.error(
        "[college-activation] Error creating organisation_members row",
        memberError
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Organisation created but could not link you as a member. Please contact support.",
        },
        { status: 200 }
      );
    }

    // 4) Create organisation plan: basic, 8 posts/month, 6 months trial
    // First, check if a plan already exists (it shouldn't for new orgs, but safety)
    const { data: existingPlan, error: planFetchError } = await supabaseAdmin
      .from("organisation_plans")
      .select("id")
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (planFetchError) {
      console.error(
        "[college-activation] Error checking existing plan",
        planFetchError
      );
    }

    if (!existingPlan) {
      const { error: planInsertError } = await supabaseAdmin
        .from("organisation_plans")
        .insert({
          organisation_id: organisationId,
          plan: "basic",
          posts_per_month: 8,
          trial_ends_at: trialEnds.toISOString(),
          created_by_source: "college",
        });

      if (planInsertError) {
        console.error(
          "[college-activation] Error creating organisation plan",
          planInsertError
        );
        // We won't fail the entire flow here, but we return a warning
        return NextResponse.json(
          {
            success: true,
            organisationId,
            warning:
              "Organisation created, but could not set up the plan. Please contact support to fix your subscription.",
          },
          { status: 200 }
        );
      }
    }

    // 5) Mark activation code as used (increment count)
    const { error: updateCodeError } = await supabaseAdmin
      .from("college_activation_codes")
      .update({
        uses_count: activation.uses_count + 1,
      })
      .eq("id", activation.id);

    if (updateCodeError) {
      console.error(
        "[college-activation] Error updating activation code usage",
        updateCodeError
      );
      // Non-fatal: student still has their org and plan
    }

    return NextResponse.json(
      {
        success: true,
        organisationId,
        trialEndsAt: trialEnds.toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[college-activation] Unexpected error", err);
    return NextResponse.json(
      {
        success: false,
        error: "Unexpected error while activating your college access.",
      },
      { status: 200 }
    );
  }
}
