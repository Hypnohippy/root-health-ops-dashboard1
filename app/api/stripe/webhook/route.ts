// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const PRICE_SOLO = process.env.price_rootops_basic_monthly || "";
const PRICE_GROWTH = process.env.price_rootops_pro_monthly || "";
const PRICE_TEAM = process.env.price_rootops_enterprise_monthly || "";

const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: "2024-06-20",
});

function planFromPrice(priceId?: string | null) {
  const id = String(priceId || "");
  if (id && PRICE_GROWTH && id === PRICE_GROWTH) return { plan: "pro", posts: 20 };
  if (id && PRICE_TEAM && id === PRICE_TEAM) return { plan: "enterprise", posts: 40 };
  return { plan: "basic", posts: 8 };
}

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET." },
      { status: 200 }
    );
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig!, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[stripe/webhook] signature error:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const priceId = sub.items.data[0]?.price?.id || null;
        const status = sub.status;
        const subscriptionId = sub.id;
        const customerId = String(sub.customer || "");

        // ✅ Primary: orgId is attached in subscription metadata by /api/stripe/checkout
        let organisationId = String((sub.metadata as any)?.organisationId || "").trim();

        // Fallback: legacy mapping via stripe_customer_id (if it exists)
        if (!organisationId && customerId) {
          const { data: orgRows } = await supabaseAdmin
            .from("organisation_subscriptions")
            .select("organisation_id")
            .eq("stripe_customer_id", customerId)
            .limit(1);

          organisationId = orgRows?.[0]?.organisation_id ? String(orgRows[0].organisation_id) : "";
        }

        if (!organisationId) {
          console.warn("[stripe/webhook] No organisationId found for subscription", {
            subscriptionId,
            customerId,
          });
          return new Response("No organisation mapping", { status: 200 });
        }

        // Upsert subscription row
        await supabaseAdmin.from("organisation_subscriptions").upsert(
          {
            organisation_id: organisationId,
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: priceId,
            status,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organisation_id" }
        );

        // Update org plan row (same org)
        const mapped = planFromPrice(priceId);

        await supabaseAdmin.from("organisation_plans").upsert(
          {
            organisation_id: organisationId,
            plan: mapped.plan,
            posts_per_month: mapped.posts,
            trial_ends_at: null,
            created_by_source: "stripe",
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "organisation_id" }
        );

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = String(sub.customer || "");

        let organisationId = String((sub.metadata as any)?.organisationId || "").trim();

        if (!organisationId && customerId) {
          const { data: orgRows } = await supabaseAdmin
            .from("organisation_subscriptions")
            .select("organisation_id")
            .eq("stripe_customer_id", customerId)
            .limit(1);

          organisationId = orgRows?.[0]?.organisation_id ? String(orgRows[0].organisation_id) : "";
        }

        if (organisationId) {
          await supabaseAdmin
            .from("organisation_subscriptions")
            .update({ status: "canceled", updated_at: new Date().toISOString() })
            .eq("organisation_id", organisationId);
        }

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
