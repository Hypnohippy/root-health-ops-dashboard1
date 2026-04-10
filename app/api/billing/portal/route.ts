import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

async function getCustomerId(organisationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organisation_plans")
    .select("stripe_customer_id")
    .eq("organisation_id", organisationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[billing/portal] DB error", error);
    return null;
  }

  return data?.stripe_customer_id || null;
}

export async function GET(req: NextRequest) {
  try {
    const organisationId =
      req.nextUrl.searchParams.get("organisationId") || "";

    if (!organisationId) {
      return NextResponse.json(
        { error: "Missing organisationId" },
        { status: 400 }
      );
    }

    const customerId = await getCustomerId(organisationId);

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer found" },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.nextUrl.origin}/dashboard`,
    });

    return NextResponse.redirect(session.url);
  } catch (err: any) {
    console.error("[billing/portal] error", err);
    return NextResponse.json(
      { error: err?.message || "Portal error" },
      { status: 500 }
    );
  }
}
