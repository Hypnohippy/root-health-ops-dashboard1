import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function logUsage(userId: string, action: string) {
  if (!userId) return;

  await supabaseAdmin.from("user_ai_usage").insert({
    user_id: userId,
    action,
  });
}

export async function getMonthlyUsage(userId: string) {
  if (!userId) return 0;

  const { count } = await supabaseAdmin
    .from("user_ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte(
      "created_at",
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    );

  return count || 0;
}
