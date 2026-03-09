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

  return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
}
