// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

// Price IDs stored in Vercel env (actual Stripe price IDs)
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
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);

  if (error) {
    console.error("[stripe/checkout] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

export async function POST(req: NextRequest) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY." }, { status: 200 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "").toLowerCase().trim() as PlanKey;

    if (!["solo", "growth", "team"].includes(plan)) {
      return NextResponse.json({ ok: false, error: "Invalid plan. Use solo|growth|team." }, { status: 200 });
    }

    // ✅ attach orgId into Stripe subscription metadata for webhook mapping
    let organisationId = String(body?.organisationId || "").trim();
    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisationId available. Create/select an organisation first." },
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

    const base = safeBaseUrl(req);

    const successUrl = `${base}/dashboard/connect?checkout=success&plan=${encodeURIComponent(plan)}`;
    const cancelUrl = `${base}/pricing?checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,

      // Durable org binding:
      client_reference_id: organisationId,
      subscription_data: {
        metadata: {
          organisationId,
          plan_key: plan, // ✅ match DB naming
        },
      },
    });

    return NextResponse.json({ ok: true, url: session.url }, { status: 200 });
  } catch (e: any) {
    console.error("[stripe/checkout] error", e);
    return NextResponse.json({ ok: false, error: e?.message || "Stripe error" }, { status: 200 });
  }
}
