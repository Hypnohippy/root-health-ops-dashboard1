// app/api/stripe/webhook/route.ts
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// These should be the ACTUAL Stripe price IDs stored in Vercel env
const PRICE_SOLO = process.env.price_rootops_basic_monthly || "";
const PRICE_GROWTH = process.env.price_rootops_pro_monthly || "";
const PRICE_TEAM = process.env.price_rootops_enterprise_monthly || "";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

function planFromPriceId(priceId?: string | null) {
  // Defaults
  let plan = "basic";
  let posts_per_month = 8;

  if (!priceId) return { plan, posts_per_month };

  if (priceId === PRICE_GROWTH) {
    plan = "pro";
    posts_per_month = 20;
  } else if (priceId === PRICE_TEAM) {
    plan = "enterprise";
    posts_per_month = 40;
  } else if (priceId === PRICE_SOLO) {
    plan = "basic";
    posts_per_month = 8;
  }

  return { plan, posts_per_month };
}

export async function POST(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return new Response("Stripe not configured", { status: 500 });
    }

    const payload = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, sig!, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error("[stripe/webhook] signature error:", err?.message || err);
      return new Response(`Webhook Error: ${err?.message || "bad signature"}`, {
        status: 400,
      });
    }

    // -------------------------
    // Helpful: capture orgId if you later add it to metadata
    // -------------------------
    const getOrgIdFromMetadata = (obj: any): string | null => {
      const v = obj?.metadata?.organisationId || obj?.metadata?.organizationId;
      return v ? String(v) : null;
    };

    switch (event.type) {
      /**
       * Best event for “who paid” is checkout.session.completed,
       * because it contains customer + subscription id together.
       */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = session.customer ? String(session.customer) : null;
        const subscriptionId = session.subscription ? String(session.subscription) : null;

        // Optional (only works if you set it in checkout creation later)
        const organisationIdFromMeta = getOrgIdFromMetadata(session);

        // If we have a subscription, fetch it so we can get status/price reliably
        let sub: Stripe.Subscription | null = null;
        if (subscriptionId) {
          sub = await stripe.subscriptions.retrieve(subscriptionId);
        }

        const priceId =
          sub?.items?.data?.[0]?.price?.id ||
          null;

        const status = sub?.status || "active";
        const currentPeriodEnd =
          sub?.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

        // If we KNOW the organisation (via metadata), upsert cleanly.
        // If we don't, we still store the customer/subscription IDs by customerId mapping
        // (assuming your organisation_subscriptions table has stripe_customer_id).
        if (organisationIdFromMeta) {
          // Upsert subscription row for that org
          await supabaseAdmin
            .from("organisation_subscriptions")
            .upsert(
              {
                organisation_id: organisationIdFromMeta,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                stripe_price_id: priceId,
                status,
                current_period_end: currentPeriodEnd,
                updated_at: new Date().toISOString(),
              } as any,
              { onConflict: "organisation_id" } as any
            );

          const { plan, posts_per_month } = planFromPriceId(priceId);

          await supabaseAdmin
            .from("organisation_plans")
            .upsert(
              {
                organisation_id: organisationIdFromMeta,
                plan,
                posts_per_month,
                trial_ends_at: null,
                created_by_source: "stripe",
              } as any,
              { onConflict: "organisation_id" } as any
            );
        } else if (customerId) {
          // Fallback: update any row that already has this customer id
          await supabaseAdmin
            .from("organisation_subscriptions")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_price_id: priceId,
              status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          // Note: we can’t safely update organisation_plans without knowing organisation_id.
          // That will happen on subscription.updated once mapping exists, or if you add metadata orgId.
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const subscriptionId = sub.id;
        const customerId = String(sub.customer);
        const priceId = sub.items?.data?.[0]?.price?.id || null;
        const status = sub.status;
        const currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();

        // Find org via stripe_customer_id
        const { data: orgRows, error: findErr } = await supabaseAdmin
          .from("organisation_subscriptions")
          .select("organisation_id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (findErr) console.warn("[stripe/webhook] lookup error", findErr);

        const organisationId = orgRows?.[0]?.organisation_id || null;

        // Update subscription row (by customer id)
        await supabaseAdmin
          .from("organisation_subscriptions")
          .update({
            stripe_subscription_id: subscriptionId,
            stripe_price_id: priceId,
            status,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        // Update plan only if we know the org
        if (organisationId) {
          const { plan, posts_per_month } = planFromPriceId(priceId);

          await supabaseAdmin
            .from("organisation_plans")
            .upsert(
              {
                organisation_id: organisationId,
                plan,
                posts_per_month,
                trial_ends_at: null,
                created_by_source: "stripe",
              } as any,
              { onConflict: "organisation_id" } as any
            );
        }

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = String(sub.customer);

        await supabaseAdmin
          .from("organisation_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        break;
      }

      default:
        // ignore
        break;
    }

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("[stripe/webhook] handler error:", e?.message || e);
    return new Response("Webhook handler error", { status: 500 });
  }
}
