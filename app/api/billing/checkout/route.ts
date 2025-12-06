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
      // @ts-ignore – type mismatch between Stripe versions, but works at runtime
      apiVersion: "2024-06-20",
    })
  : null;

// ❗️ TODO: Replace this with your real auth logic.
async function getCurrentUserId(_req: NextRequest): Promise<string | null> {
  // e.g. use Supabase auth here later
  return null;
}

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  stripe_customer_id?: string | null;
};

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

    // 1) Get current user id (you MUST wire this later)
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorised. No user found in session." },
        { status: 401 }
      );
    }

    // 2) Find the organisation this user belongs to
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

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "No organisation found for this user. Complete org setup before starting billing.",
        },
        { status: 404 }
      );
    }

    // Supabase can return `organisations` as an object or array; normalise it
    const orgField = (membership as any).organisations;
    let org: OrgRow | null = null;

    if (Array.isArray(orgField)) {
      org = (orgField[0] as OrgRow) ?? null;
    } else {
      org = (orgField as OrgRow) ?? null;
    }

    if (!org) {
      return NextResponse.json(
        {
          error:
            "No organisation record attached to this membership. Check your Supabase relationships.",
        },
        { status: 500 }
      );
    }

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

      // Save to organisations table
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
