// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

// Your env vars (these should be the REAL Stripe price IDs)
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

function prettyPlanName(plan: PlanKey) {
  if (plan === "solo") return "Solo";
  if (plan === "growth") return "Growth";
  return "Team";
}

/**
 * Option A guardrail:
 * Create the organisation BEFORE checkout so the webhook always has a real org to update.
 *
 * We keep this insert minimal + resilient:
 * - id (UUID)
 * - name (string)
 *
 * If your organisations table has extra required fields, this will error and we return a clear message.
 */
async function createOrganisation(plan: PlanKey) {
  const organisationId = randomUUID();

  const name = `Root Health Ops (${prettyPlanName(plan)})`;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .insert({
      id: organisationId,
      name,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[stripe/checkout] org insert failed", error);
    throw new Error(
      "Could not create organisation record. Your organisations table likely requires additional fields. Paste your organisations table columns (or app/api/organisations/route.ts) and I’ll align this perfectly."
    );
  }

  return String(data.id);
}

export async function POST(req: NextRequest) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_SECRET_KEY." },
        { status: 200 }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "").toLowerCase().trim() as PlanKey;

    if (!["solo", "growth", "team"].includes(plan)) {
      return NextResponse.json(
        { ok: false, error: "Invalid plan. Use solo|growth|team." },
        { status: 200 }
      );
    }

    const priceId = resolvePriceId(plan);
    if (!priceId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing price env var. Check: price_rootops_basic_monthly / price_rootops_pro_monthly / price_rootops_enterprise_monthly",
        },
        { status: 200 }
      );
    }

    const base = safeBaseUrl(req);

    // ✅ 1) Create org FIRST (guardrail)
    const organisationId = await createOrganisation(plan);

    // ✅ 2) Success & cancel URLs carry orgId (so UI can load the right tenant)
    const successUrl =
      `${base}/dashboard/connect` +
      `?checkout=success` +
      `&plan=${encodeURIComponent(plan)}` +
      `&org=${encodeURIComponent(organisationId)}` +
      `&session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl =
      `${base}/pricing` +
      `?checkout=cancelled` +
      `&plan=${encodeURIComponent(plan)}` +
      `&org=${encodeURIComponent(organisationId)}`;

    // ✅ 3) Create Stripe Checkout session with metadata for webhook determinism
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],

      // ✅ your 50% promo codes work here (college route etc)
      allow_promotion_codes: true,

      // ✅ make webhook deterministic (your webhook already supports organisationId metadata)
      metadata: {
        organisationId,
        plan,
        source: "pricing_page",
      },

      // Optional but helpful for support/debug
      client_reference_id: organisationId,
    });

    return NextResponse.json(
      { ok: true, url: session.url, organisationId },
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
