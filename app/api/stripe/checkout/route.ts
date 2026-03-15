// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const PRICE_SOLO = process.env.price_rootops_basic_monthly || "";
const PRICE_GROWTH = process.env.price_rootops_pro_monthly || "";
const PRICE_TEAM = process.env.price_rootops_enterprise_monthly || "";

type PlanKey = "solo" | "growth" | "team";

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
  const { data } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function loadCohort(code: string) {
  const { data } = await supabaseAdmin
    .from("college_cohorts")
    .select("*")
    .eq("cohort_code", code.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();

  return data;
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
    const plan = String(body?.plan || "").toLowerCase().trim() as PlanKey;
    const cohortCode = String(body?.cohortCode || "").trim().toUpperCase();

    if (!["solo", "growth", "team"].includes(plan)) {
      return NextResponse.json(
        { ok: false, error: "Invalid plan." },
        { status: 200 }
      );
    }

    let organisationId = String(body?.organisationId || "").trim();
    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisation found." },
        { status: 200 }
      );
    }

    const priceId = resolvePriceId(plan);
    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: "Missing Stripe price configuration." },
        { status: 200 }
      );
    }

    let discounts: any[] = [];
    let cohort: any = null;

    if (cohortCode) {
      cohort = await loadCohort(cohortCode);

      if (!cohort) {
        return NextResponse.json(
          { ok: false, error: "Invalid or inactive cohort code." },
          { status: 200 }
        );
      }

      if (cohort.stripe_coupon_id) {
        discounts = [{ coupon: cohort.stripe_coupon_id }];
      }
    }

    const base = safeBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${base}/dashboard/connect?checkout=success`,
      cancel_url: `${base}/pricing?checkout=cancelled`,
      line_items: [{ price: priceId, quantity: 1 }],
      discounts,
      allow_promotion_codes: false,

      client_reference_id: organisationId,

      metadata: {
        organisationId,
        plan,
        cohort_code: cohort?.cohort_code || "",
      },

      subscription_data: {
        metadata: {
          organisationId,
          plan,
          cohort_code: cohort?.cohort_code || "",
        },
      },
    });

    return NextResponse.json(
      { ok: true, url: session.url },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[stripe checkout]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Stripe error" },
      { status: 200 }
    );
  }
}
