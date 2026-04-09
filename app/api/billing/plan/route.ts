// app/api/billing/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type PlanKey = "solo" | "growth" | "team";

/**
 * TEMPORARY META REVIEW BYPASS
 * Turn this to false after Meta approval.
 */
const META_REVIEW_BYPASS = true;

function isMetaReviewerEmail(email: string) {
  const e = String(email || "").toLowerCase().trim();
  return e.endsWith("@fb.com") || e.endsWith("@meta.com");
}

function tryParseSbCookie(raw: string | undefined | null): any | null {
  if (!raw) return null;

  const attempts = [raw];

  try {
    attempts.push(decodeURIComponent(raw));
  } catch {}

  for (const value of attempts) {
    try {
      return JSON.parse(value);
    } catch {}
  }

  return null;
}

function extractAccessTokenFromCookies(req: NextRequest): string | null {
  const all = req.cookies.getAll();
  const sbCookie = all.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  const parsed = tryParseSbCookie(sbCookie?.value);
  const token = String(parsed?.access_token || "").trim();

  return token || null;
}

async function getAuthedUser(req: NextRequest) {
  const accessToken = extractAccessTokenFromCookies(req);
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}

async function getOrganisationIdForCurrentUser(req: NextRequest): Promise<string | null> {
  const user = await getAuthedUser(req);
  if (!user?.id) return null;

  const { data, error } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.organisation_id) return null;
  return String(data.organisation_id);
}

function mapPlan(raw: string | null | undefined): PlanKey {
  const p = String(raw || "").toLowerCase().trim();

  if (p === "enterprise" || p === "team") return "team";
  if (p === "pro" || p === "growth") return "growth";
  if (p === "basic" || p === "solo") return "solo";

  return "solo";
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    const userEmail = String(user?.email || "").trim();

    // ✅ TEMP reviewer bypass for Meta app review
    if (META_REVIEW_BYPASS && isMetaReviewerEmail(userEmail)) {
      return NextResponse.json(
        {
          ok: true,
          organisationId: null,
          plan: "team",
          rawPlan: "reviewer_bypass",
          postsPerMonth: 999999,
          trialEndsAt: null,
          updatedAt: new Date().toISOString(),
          isActive: true,
          status: "active",
          subscriptionStatus: "active",
          creditsRemaining: 999999,
          reviewBypass: true,
        },
        { status: 200 }
      );
    }

    // optional orgId override
    let organisationId = req.nextUrl.searchParams.get("organisationId")?.trim() || "";

    // ✅ use logged-in user's organisation membership first
    if (!organisationId) {
      const membershipOrg = await getOrganisationIdForCurrentUser(req);
      if (membershipOrg) organisationId = membershipOrg;
    }

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisationId available." },
        { status: 200 }
      );
    }

    const { data: planRows, error: planErr } = await supabaseAdmin
      .from("organisation_plans")
      .select("plan, posts_per_month, trial_ends_at, updated_at")
      .eq("organisation_id", organisationId)
      .limit(1);

    if (planErr) {
      console.error("[billing/plan] organisation_plans error", planErr);
    }

    const rawPlan = planRows?.[0]?.plan ?? null;
    const plan = mapPlan(rawPlan);

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        plan,
        rawPlan,
        postsPerMonth: planRows?.[0]?.posts_per_month ?? null,
        trialEndsAt: planRows?.[0]?.trial_ends_at ?? null,
        updatedAt: planRows?.[0]?.updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[billing/plan] fatal", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal error." },
      { status: 200 }
    );
  }
}
