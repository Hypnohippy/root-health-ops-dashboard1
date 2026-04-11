// app/api/billing/checkout2/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://root-health-ops-dashboard1.vercel.app";

function tryParseSbCookie(raw: string | undefined | null): any | null {
  if (!raw) return null;

  const attempts = [raw];

  try {
    attempts.push(decodeURIComponent(raw));
  } catch {}

  for (const value of attempts) {
    try {
      return JSON.parse(value);
    } catch {}
  }

  return null;
}

function extractAccessTokenFromCookies(req: NextRequest): string | null {
  const all = req.cookies.getAll();
  const sbCookie = all.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  const parsed = tryParseSbCookie(sbCookie?.value);
  const token = String(parsed?.access_token || "").trim();

  return token || null;
}

async function getAuthedUser(req: NextRequest) {
  const accessToken = extractAccessTokenFromCookies(req);
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}

async function getOrganisationIdForCurrentUser(req: NextRequest): Promise<string | null> {
  const user = await getAuthedUser(req);
  if (!user?.id) return null;

  const { data, error } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.organisation_id) return null;
  return String(data.organisation_id);
}

export async function POST(req: NextRequest) {
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

    const organisationId = await getOrganisationIdForCurrentUser(req);

    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found for the signed-in user." },
        { status: 400 }
      );
    }

   const organisationId = "REPLACE_THIS_TEMP";

const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  line_items: [
    {
      price: priceId,
      quantity: 1,
    },
  ],

  // 🔑 THIS IS THE FIX
  client_reference_id: organisationId,

  subscription_data: {
    metadata: {
      organisationId,
    },
  },

  success_url: `${appUrl}/dashboard?billing=success`,
  cancel_url: `${appUrl}/dashboard?billing=cancelled`,
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
