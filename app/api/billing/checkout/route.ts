// app/api/billing/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePriceId = process.env.STRIPE_PRICE_ID;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!stripeSecretKey) {
  console.warn(
    "[billing/checkout] STRIPE_SECRET_KEY is not set. This route will fail until you add it."
  );
}

if (!stripePriceId) {
  console.warn(
    "[billing/checkout] STRIPE_PRICE_ID is not set. This route will fail until you add it."
  );
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20" as any,
    })
  : null;

// ❗️ TODO: Replace this with your real auth logic.
// e.g. Supabase auth helpers, session cookie, etc.
async function getCurrentUserId(_req: NextRequest): Promise<string | null> {
  // Example if you later wire Supabase auth:
  // const supabase = createRouteHandlerClient<Database>({ cookies });
  // const { data: { user } } = await supabase.auth.getUser();
  // return user?.id ?? null;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!stripe || !stripeSecretKey || !stripePriceId) {
      return NextResponse.json(
        {
          error:
            "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID in your environment.",
        },
        { status: 500 }
      );
    }

    // 1) Get current user id (you MUST wire this)
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorised. No user found in session." },
        { status: 401 }
      );
    }

    // 2) Find the organisation this user owns / belongs to
    // Adjust table/column names to your actual schema.
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organisation_members")
      .select(
        `
        organisation_id,
        organisations (
          id,
          name,
          slug,
          stripe_customer_id
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error("[billing/checkout] membershipError", membershipError);
      return NextResponse.json(
        {
          error: "Failed to load organisation membership.",
          details: membershipError.message,
        },
        { status: 500 }
      );
    }

    if (!membership || !membership.organisations) {
      return NextResponse.json(
        {
          error:
            "No organisation found for this user. Complete org setup before starting billing.",
        },
        { status: 404 }
      );
    }

    const org = membership.organisations as {
      id: string;
      name: string;
      slug: string | null;
      stripe_customer_id?: string | null;
    };

    // 3) Ensure Stripe customer exists for this org
    let customerId = org.stripe_customer_id || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: {
          orgId: org.id,
          orgSlug: org.slug || "",
        },
      });

      customerId = customer.id;

      // Save to organisations table (adjust column name if needed)
      const { error: updateError } = await supabaseAdmin
        .from("organisations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org.id);

      if (updateError) {
        console.error(
          "[billing/checkout] Failed to update stripe_customer_id",
          updateError
        );
      }
    }

    // 4) Create Stripe Checkout Session (subscription)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${appBaseUrl}/org-setup?billing=success`,
      cancel_url: `${appBaseUrl}/org-setup?billing=cancelled`,
      metadata: {
        orgId: org.id,
        orgSlug: org.slug || "",
      },
    });

    if (!session.url) {
      return NextResponse.json(
        {
          error: "Stripe did not return a checkout URL.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("[billing/checkout] Unexpected error", err);
    return NextResponse.json(
      { error: "Unexpected error in billing/checkout", details: err?.message },
      { status: 500 }
    );
  }
}
