// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

// Your existing Vercel env vars (as you showed)
// NOTE: env names are case-sensitive — keep them EXACT.
const PRICE_SOLO = process.env.price_rootops_basic_monthly || "";
const PRICE_GROWTH = process.env.price_rootops_pro_monthly || "";
const PRICE_TEAM = process.env.price_rootops_enterprise_monthly || "";

type PlanKey = "solo" | "growth" | "team";

function safeBaseUrl(req: NextRequest) {
  const env = (APP_URL || "").replace(/\/$/, "");
  if (env) return env;
  return req.nextUrl.origin;
}

function resolvePriceId(plan: PlanKey) {
  if (plan === "solo") return PRICE_SOLO;
  if (plan === "growth") return PRICE_GROWTH;
  return PRICE_TEAM;
}

export async function POST(req: NextRequest) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_SECRET_KEY env var." },
        { status: 200 }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const body = await req.json().catch(() => ({}));

    const plan = String(body?.plan || "").toLowerCase().trim() as PlanKey;
    const email = body?.email ? String(body.email).trim() : undefined;

    if (!plan || !["solo", "growth", "team"].includes(plan)) {
      return NextResponse.json(
        { ok: false, error: "Missing/invalid plan. Use solo|growth|team." },
        { status: 200 }
      );
    }

    const priceId = resolvePriceId(plan);
    if (!priceId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing Stripe Price ID env var for this plan. Check Vercel env vars: price_rootops_basic_monthly / pro / enterprise.",
          missing: {
            price_rootops_basic_monthly: !PRICE_SOLO,
            price_rootops_pro_monthly: !PRICE_GROWTH,
            price_rootops_enterprise_monthly: !PRICE_TEAM,
          },
        },
        { status: 200 }
      );
    }

    const base = safeBaseUrl(req);

    // ✅ Guardrail: pricing -> checkout -> success -> app
    const successUrl = `${base}/dashboard/connect?checkout=success&plan=${encodeURIComponent(
      plan
    )}`;
    const cancelUrl = `${base}/pricing?checkout=cancelled`;

    // ✅ IMPORTANT: This enables your 6-month subsidy cleanly via Stripe promotion codes.
    // Colleges can distribute a code like COLLEGE50, students enter it at checkout.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,

      // optional — helps prefill Stripe checkout
      customer_email: email || undefined,

      line_items: [{ price: priceId, quantity: 1 }],

      // ✅ this is the key for “6-month subsidy” without custom code
      allow_promotion_codes: true,

      // optional quality-of-life settings
      billing_address_collection: "auto",
      subscription_data: {
        // metadata is helpful later in webhook processing
        metadata: {
          plan,
          product: "root_health_ops",
        },
      },
    });

    return NextResponse.json(
      { ok: true, url: session.url },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[stripe/checkout] error", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Stripe checkout error." },
      { status: 200 }
    );
  }
}
