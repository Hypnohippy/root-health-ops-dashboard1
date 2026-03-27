import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function logUsage(userId: string, action: string) {
  if (!userId) return;

  const costMap: Record<string, number> = {
    course_generation: 1,
    deep_teach: 1,
    elite_deep_teach: 3,
  };

  const cost = costMap[action] || 1;

  const rows = Array.from({ length: cost }).map(() => ({
    user_id: userId,
    action,
  }));

  await supabaseAdmin.from("user_ai_usage").insert(rows);
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
