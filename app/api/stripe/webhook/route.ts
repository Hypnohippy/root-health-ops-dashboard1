// app/api/stripe/webhook/route.ts
import { NextRequest } from "next/server";
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

function norm(v: any) {
  return String(v || "").trim();
}

function planKeyFromPrice(priceId?: string | null): PlanKey {
  const id = String(priceId || "").trim();
  if (id && PRICE_GROWTH && id === PRICE_GROWTH) return "growth";
  if (id && PRICE_TEAM && id === PRICE_TEAM) return "team";
  return "solo";
}

function planStatusFromStripe(
  status?: string | null
): "active" | "past_due" | "canceled" {
  const s = String(status || "").toLowerCase();
  if (s === "canceled" || s === "incomplete_expired" || s === "unpaid") {
    return "canceled";
  }
  if (s === "past_due") return "past_due";
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

async function incrementCohortRedemptionOnce(args: {
  cohortCode: string;
  organisationId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeEventId?: string | null;
}) {
  const cohortCode = norm(args.cohortCode).toUpperCase();
  const organisationId = norm(args.organisationId);
  const stripeCustomerId = norm(args.stripeCustomerId);
  const stripeSubscriptionId = norm(args.stripeSubscriptionId);
  const stripeEventId = norm(args.stripeEventId);

  if (!cohortCode || !organisationId) return;

  const { data: cohort, error: cohortErr } = await supabaseAdmin
    .from("college_cohorts")
    .select("id, redemptions_used, max_redemptions, is_active")
    .eq("cohort_code", cohortCode)
    .eq("is_active", true)
    .maybeSingle();

  if (cohortErr) {
    console.error("[stripe/webhook] cohort load error:", cohortErr);
    return;
  }

  if (!cohort?.id) {
    console.warn("[stripe/webhook] no active cohort found for code", cohortCode);
    return;
  }

  // Prevent double-counting for the same organisation
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("college_cohort_redemptions")
    .select("id")
    .eq("cohort_id", cohort.id)
    .eq("organisation_id", organisationId)
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    console.error("[stripe/webhook] redemption lookup error:", existingErr);
    return;
  }

  if (existing?.id) {
    return;
  }

  const used =
    typeof cohort.redemptions_used === "number" ? cohort.redemptions_used : 0;
  const max =
    typeof cohort.max_redemptions === "number" ? cohort.max_redemptions : null;

  if (max !== null && used >= max) {
    console.warn("[stripe/webhook] cohort max redemptions reached", {
      cohortCode,
      used,
      max,
    });
    return;
  }

  const { error: insertErr } = await supabaseAdmin
    .from("college_cohort_redemptions")
    .insert({
      cohort_id: cohort.id,
      organisation_id: organisationId,
      email: null,
      full_name: null,
      status: "active",
      notes: JSON.stringify({
        source: "stripe_webhook",
        stripe_customer_id: stripeCustomerId || null,
        stripe_subscription_id: stripeSubscriptionId || null,
        stripe_event_id: stripeEventId || null,
      }),
    });

  if (insertErr) {
    console.error("[stripe/webhook] redemption insert error:", insertErr);
    return;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("college_cohorts")
    .update({
      redemptions_used: used + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cohort.id);

  if (updateErr) {
    console.error("[stripe/webhook] cohort increment error:", updateErr);
    return;
  }

  console.log("[stripe/webhook] cohort redemption incremented", {
    cohortCode,
    organisationId,
    redemptionsUsed: used + 1,
  });
}

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.warn("[stripe/webhook] missing env", {
      hasSecret: Boolean(STRIPE_SECRET_KEY),
      hasWebhookSecret: Boolean(STRIPE_WEBHOOK_SECRET),
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET.",
      }),
      { status: 200 }
    );
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error("[stripe/webhook] signature error:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const organisationId = norm(session.client_reference_id);
        const cohortCode = norm(session.metadata?.cohort_code).toUpperCase();

        if (organisationId && cohortCode) {
          await incrementCohortRedemptionOnce({
            cohortCode,
            organisationId,
            stripeCustomerId: norm(session.customer),
            stripeSubscriptionId: norm(session.subscription),
            stripeEventId: event.id,
          });
        }

        break;
      }

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

        const organisationId = norm((sub.metadata as any)?.organisationId);

        if (!organisationId) {
          console.warn(
            "[stripe/webhook] No organisationId on subscription metadata",
            {
              subscriptionId,
              customerId,
              priceId,
              status: sub.status,
            }
          );
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

        // Increment cohort redemption on subscription.created too, but guarded
        // so it does not double-count if checkout.session.completed already did it.
        if (event.type === "customer.subscription.created") {
          const cohortCode = norm((sub.metadata as any)?.cohort_code).toUpperCase();

          if (cohortCode) {
            await incrementCohortRedemptionOnce({
              cohortCode,
              organisationId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              stripeEventId: event.id,
            });
          }
        }

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const subscriptionId = sub.id;
        const customerId = sub.customer ? String(sub.customer) : null;

        const organisationId = norm((sub.metadata as any)?.organisationId);

        if (!organisationId) {
          console.warn(
            "[stripe/webhook] subscription.deleted missing organisationId",
            {
              subscriptionId,
              customerId,
            }
          );
          return new Response("No organisationId in metadata", { status: 200 });
        }

        await upsertOrganisationPlan({
          organisationId,
          planKey: "solo",
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
