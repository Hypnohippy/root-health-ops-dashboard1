// app/dashboard/layout.tsx
import React from "react";
import { redirect } from "next/navigation";
import ClientDashboardLayout from "./ClientDashboardLayout";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

export const runtime = "nodejs";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/signin?next=/dashboard");
  }

  return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
}
