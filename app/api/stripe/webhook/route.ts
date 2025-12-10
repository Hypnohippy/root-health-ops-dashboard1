// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig!,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error("Stripe webhook signature error:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        // Map to our DB
        const priceId = sub.items.data[0]?.price.id;
        const status = sub.status;
        const subscriptionId = sub.id;
        const customerId = sub.customer as string;

        // Find org via stripe_customer_id
        const { data: orgRows } = await supabaseAdmin
          .from("organisation_subscriptions")
          .select("organisation_id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        const organisationId = orgRows?.[0]?.organisation_id;

        if (organisationId) {
          await supabaseAdmin
            .from("organisation_subscriptions")
            .update({
              stripe_subscription_id: subscriptionId,
              stripe_price_id: priceId,
              status,
              current_period_end: new Date(
                sub.current_period_end * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("organisation_id", organisationId);

          // Also update organisation_plans
          let plan = "basic";
          let posts_per_month = 8;

          if (priceId === "price_rootops_pro_monthly") {
            plan = "pro";
            posts_per_month = 20;
          } else if (priceId === "price_rootops_enterprise_monthly") {
            plan = "enterprise";
            posts_per_month = 40;
          }

          await supabaseAdmin
            .from("organisation_plans")
            .update({
              plan,
              posts_per_month,
              trial_ends_at: null,
              created_by_source: "stripe",
            })
            .eq("organisation_id", organisationId);
        }

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        // Mark subscription cancelled
        await supabaseAdmin
          .from("organisation_subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_customer_id", customerId);

        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Webhook error", { status: 500 });
  }

  return new Response("Success", { status: 200 });
}
