import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const name = form.get("name") as string;
    const brandName = form.get("brandName") as string;
    const primaryColor = form.get("primaryColor") as string;
    const secondaryColor = form.get("secondaryColor") as string;

    // Insert organisation
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organisations")
      .insert({
        name,
        brand_name: brandName,
        brand_primary_color: primaryColor,
        brand_secondary_color: secondaryColor,
        owner_id: "replace-me-with-auth-user", // TODO: wire auth
      })
      .select()
      .single();

    if (orgErr) {
      console.error(orgErr);
      return NextResponse.json({ error: orgErr.message }, { status: 500 });
    }

    // Create Stripe Checkout session
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: process.env.NEXT_PUBLIC_APP_URL + "/dashboard",
      cancel_url: process.env.NEXT_PUBLIC_APP_URL + "/org-setup",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      client_reference_id: org.id,
    });

    return NextResponse.json({
      redirectUrl: checkout.url,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Setup failed", details: err.message },
      { status: 500 }
    );
  }
}
