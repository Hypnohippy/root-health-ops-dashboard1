// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Stripe Price IDs (from Vercel env)
const PRICE_SOLO = process.env.price_rootops_basic_monthly || "";
const PRICE_GROWTH = process.env.price_rootops_pro_monthly || "";
const PRICE_TEAM = process.env.price_rootops_enterprise_monthly || "";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

type PlanKey = "solo" | "growth" | "team";

function planKeyFromPrice(priceId?: string | null): PlanKey {
  const id = String(priceId || "").trim();
  if (id && PRICE_GROWTH && id === PRICE_GROWTH) return "growth";
  if (id && PRICE_TEAM && id === PRICE_TEAM) return "team";
  return "solo";
}

function planStatusFromStripe(status?: string | null): "active" | "past_due" | "canceled" {
  const s = String(status || "").toLowerCase();
  if (s === "canceled" || s === "incomplete_expired" || s === "unpaid") return "canceled";
  if (s === "past_due") return "past_due";
  // treat trialing/active/incomplete as "active" for gating purposes
  return "active";
}

async function upsertOrganisationPlan(args: {
  organisationId: string;
  planKey: PlanKey;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEndIso: string | null;
  status: "active" | "past_due" | "canceled";
}) {
  // organisation_plans columns we expect (from your latest SQL fixes):
  // organisation_id, plan_key, status, stripe_customer_id, stripe_subscription_id, current_period_end, created_at, updated_at
  const { error } = await supabaseAdmin.from("organisation_plans").upsert(
    {
      organisation_id: args.organisationId,
      plan_key: args.planKey,
      status: args.status,
      stripe_customer_id: args.stripeCustomerId,
      stripe_subscription_id: args.stripeSubscriptionId,
      current_period_end: args.currentPeriodEndIso,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organisation_id" }
  );

  if (error) throw error;
}

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    // Keep 200 to stop Stripe retry storms, but log clearly.
    console.warn("[stripe/webhook] missing env", {
      hasSecret: Boolean(STRIPE_SECRET_KEY),
      hasWebhookSecret: Boolean(STRIPE_WEBHOOK_SECRET),
    });
    return NextResponse.json(
      { ok: false, error: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET." },
      { status: 200 }
    );
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[stripe/webhook] signature error:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const subscriptionId = sub.id;
        const customerId = sub.customer ? String(sub.customer) : null;

        const priceId = sub.items?.data?.[0]?.price?.id || null;
        const planKey = planKeyFromPrice(priceId);

        const mappedStatus = planStatusFromStripe(sub.status);

        const currentPeriodEndIso = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        // ✅ Primary mapping: metadata from /api/stripe/checkout
        const organisationId = String((sub.metadata as any)?.organisationId || "").trim();

        if (!organisationId) {
          console.warn("[stripe/webhook] No organisationId on subscription metadata", {
            subscriptionId,
            customerId,
            priceId,
            status: sub.status,
          });
          return new Response("No organisationId in metadata", { status: 200 });
        }

        await upsertOrganisationPlan({
          organisationId,
          planKey,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          currentPeriodEndIso,
          status: mappedStatus,
        });

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const subscriptionId = sub.id;
        const customerId = sub.customer ? String(sub.customer) : null;

        const organisationId = String((sub.metadata as any)?.organisationId || "").trim();

        if (!organisationId) {
          console.warn("[stripe/webhook] subscription.deleted missing organisationId", {
            subscriptionId,
            customerId,
          });
          return new Response("No organisationId in metadata", { status: 200 });
        }

        // Mark plan canceled (keep plan_key as-is, but lock features down)
        await upsertOrganisationPlan({
          organisationId,
          planKey: "solo", // safe default; gating uses status anyway
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          currentPeriodEndIso: null,
          status: "canceled",
        });

        break;
      }

      default:
        break;
    }
  } catch (err: any) {
    console.error("[stripe/webhook] handler error:", err);
    return new Response("Webhook error", { status: 500 });
  }

  return new Response("Success", { status: 200 });
}
