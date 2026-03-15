// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

// Public plan price IDs
const PRICE_SOLO = process.env.price_rootops_basic_monthly || "";
const PRICE_GROWTH = process.env.price_rootops_pro_monthly || "";
const PRICE_TEAM = process.env.price_rootops_enterprise_monthly || "";

type PlanKey = "solo" | "growth" | "team";

type CollegeCohortRow = {
  id: string;
  college_name: string;
  cohort_name: string;
  cohort_code: string;
  slug: string | null;
  discount_percent: number | null;
  discount_months: number | null;
  max_redemptions: number | null;
  redemptions_used: number | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean | null;
  notes: string | null;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
};

function norm(v: any) {
  return String(v || "").trim();
}

function safeBaseUrl(req: NextRequest) {
  const env = (APP_URL || "").replace(/\/$/, "");
  return env || req.nextUrl.origin;
}

function resolvePriceId(plan: PlanKey) {
  if (plan === "solo") return PRICE_SOLO;
  if (plan === "growth") return PRICE_GROWTH;
  return PRICE_TEAM;
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[stripe/checkout] organisations error", error);
    return null;
  }

  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function loadValidCollegeCohort(
  cohortCode: string
): Promise<CollegeCohortRow | null> {
  const code = norm(cohortCode).toUpperCase();
  if (!code) return null;

  const { data, error } = await supabaseAdmin
    .from("college_cohorts")
    .select("*")
    .eq("cohort_code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[stripe/checkout] college_cohorts load error", error);
    return null;
  }

  if (!data) return null;

  const now = new Date();
  const startsAt = data.starts_at ? new Date(data.starts_at) : null;
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const maxRedemptions =
    typeof data.max_redemptions === "number" ? data.max_redemptions : null;
  const redemptionsUsed =
    typeof data.redemptions_used === "number" ? data.redemptions_used : 0;

  if (startsAt && startsAt > now) return null;
  if (expiresAt && expiresAt < now) return null;
  if (maxRedemptions !== null && redemptionsUsed >= maxRedemptions) return null;

  return data as CollegeCohortRow;
}

export async function POST(req: NextRequest) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_SECRET_KEY." },
        { status: 200 }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const body = await req.json().catch(() => ({}));
    const plan = norm(body?.plan).toLowerCase() as PlanKey;
    const cohortCode = norm(body?.cohortCode).toUpperCase();

    if (!["solo", "growth", "team"].includes(plan)) {
      return NextResponse.json(
        { ok: false, error: "Invalid plan. Use solo|growth|team." },
        { status: 200 }
      );
    }

    let organisationId = norm(body?.organisationId);
    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No organisationId available. Create/select an organisation first.",
        },
        { status: 200 }
      );
    }

    const priceId = resolvePriceId(plan);
    if (!priceId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing Stripe price env var. Check: price_rootops_basic_monthly / price_rootops_pro_monthly / price_rootops_enterprise_monthly",
        },
        { status: 200 }
      );
    }

    let cohort: CollegeCohortRow | null = null;
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined =
      undefined;

    if (cohortCode) {
      cohort = await loadValidCollegeCohort(cohortCode);

      if (!cohort) {
        return NextResponse.json(
          {
            ok: false,
            error: "That cohort code is invalid, inactive, expired, or fully used.",
          },
          { status: 200 }
        );
      }

      if (!cohort.stripe_coupon_id) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This cohort exists, but no Stripe coupon is attached yet.",
          },
          { status: 200 }
        );
      }

      discounts = [{ coupon: cohort.stripe_coupon_id }];
    }

    const base = safeBaseUrl(req);
    const successUrl = `${base}/dashboard/connect?checkout=success&plan=${encodeURIComponent(
      plan
    )}`;
    const cancelUrl = `${base}/pricing?checkout=cancelled`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: organisationId,
      metadata: {
        organisationId,
        plan_key: plan,
        cohort_code: cohort?.cohort_code || "",
        cohort_id: cohort?.id || "",
        college_name: cohort?.college_name || "",
        cohort_name: cohort?.cohort_name || "",
        pricing_mode: cohort ? "college_cohort" : "public",
      },
      subscription_data: {
        metadata: {
          organisationId,
          plan_key: plan,
          cohort_code: cohort?.cohort_code || "",
          cohort_id: cohort?.id || "",
          college_name: cohort?.college_name || "",
          cohort_name: cohort?.cohort_name || "",
          pricing_mode: cohort ? "college_cohort" : "public",
        },
      },
    };

    if (discounts && discounts.length > 0) {
      sessionParams.discounts = discounts;
    } else {
      sessionParams.allow_promotion_codes = false;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json(
      {
        ok: true,
        url: session.url,
        pricingMode: cohort ? "college_cohort" : "public",
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[stripe/checkout] error", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Stripe error" },
      { status: 200 }
    );
  }
}
