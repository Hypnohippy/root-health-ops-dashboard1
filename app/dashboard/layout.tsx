// app/dashboard/layout.tsx
import React from "react";
import { redirect } from "next/navigation";
import ClientDashboardLayout from "./ClientDashboardLayout";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

export const runtime = "nodejs";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect("/signin?next=/dashboard");
  }

  return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
}
