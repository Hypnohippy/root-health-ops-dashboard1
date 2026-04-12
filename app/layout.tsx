// app/dashboard/layout.tsx
import React from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import ClientDashboardLayout from "./ClientDashboardLayout";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DashboardLayoutProps = {
  children: React.ReactNode;
};

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

function extractAccessTokenFromCookieValue(parsed: any): string | null {
  const token = String(parsed?.access_token || "").trim();
  return token || null;
}

function isPlanUsable(args: {
  plan: string | null | undefined;
  planKey: string | null | undefined;
  status: string | null | undefined;
  stripeSubscriptionId: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
}) {
  const plan = String(args.plan || "").toLowerCase().trim();
  const planKey = String(args.planKey || "").toLowerCase().trim();
  const status = String(args.status || "").toLowerCase().trim();
  const stripeSubscriptionId = String(args.stripeSubscriptionId || "").trim();
  const currentPeriodEnd = String(args.currentPeriodEnd || "").trim();

  // Founder stays in
  if (plan === "founder" || planKey === "founder") {
    return true;
  }

  // Must have a real Stripe subscription
  if (!stripeSubscriptionId) {
    return false;
  }

  // Active subscription
  if (status === "active") {
    return true;
  }

  // Grace period until paid-through date
  if (currentPeriodEnd) {
    const end = new Date(currentPeriodEnd).getTime();
    if (!Number.isNaN(end) && end > Date.now()) {
      return true;
    }
  }

  return false;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const cookieStore = await cookies();

  const allCookies = cookieStore.getAll();

  const sbCookie = allCookies.find((c) =>
    c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  const parsed = tryParseSbCookie(sbCookie?.value);
  const accessToken = extractAccessTokenFromCookieValue(parsed);

  if (!accessToken) {
    redirect("/signin?next=/dashboard");
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) {
    redirect("/signin?next=/dashboard");
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membershipError && membership?.organisation_id) {
    const organisationId = String(membership.organisation_id);

    const { data: planRow, error: planError } = await supabaseAdmin
      .from("organisation_plans")
      .select(
        "plan, plan_key, status, stripe_subscription_id, current_period_end"
      )
      .eq("organisation_id", organisationId)
      .limit(1)
      .maybeSingle();

    if (!planError && planRow) {
      const allowed = isPlanUsable({
        plan: (planRow as any)?.plan,
        planKey: (planRow as any)?.plan_key,
        status: (planRow as any)?.status,
        stripeSubscriptionId: (planRow as any)?.stripe_subscription_id,
        currentPeriodEnd: (planRow as any)?.current_period_end,
      });

      if (!allowed) {
        redirect("/pricing?reason=subscription_inactive");
      }
    } else {
      redirect("/pricing?reason=no_plan");
    }
  } else {
    redirect("/pricing?reason=no_organisation");
  }

  return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
}
