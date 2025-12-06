// app/api/billing/checkout2/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://root-health-ops-dashboard1.vercel.app";

export async function POST() {
  try {
    if (!stripeSecret || !priceId) {
      return NextResponse.json(
        {
          error:
            "Stripe is not configured. Please set STRIPE_SECRET_KEY and STRIPE_PRICE_ID in Vercel.",
        },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2024-06-20",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/org-setup?billing=success`,
      cancel_url: `${appUrl}/org-setup?billing=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "No checkout URL returned from Stripe." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("[billing/checkout2] error", err);
    return NextResponse.json(
      {
        error: err?.message || "Stripe checkout error",
      },
      { status: 500 }
    );
  }
}
