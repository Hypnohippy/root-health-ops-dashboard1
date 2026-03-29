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
export function getPlanLimit(plan: string | null) {
  switch (plan) {
    case "growth":
      return 60;
    case "team":
      return 150;
    default:
      return 20;
  }
  export function mapStoredPlanToPublicPlan(raw: string | null | undefined) {
  const p = String(raw || "").toLowerCase().trim();

  if (p === "enterprise" || p === "team") return "team";
  if (p === "pro" || p === "growth") return "growth";
  return "solo";
}

export async function getCurrentOrganisationPlan() {
  const { data, error } = await supabaseAdmin
    .from("organisation_plans")
    .select("plan")
    .limit(1);

  if (error) {
    console.error("[usage] organisation_plans error", error);
    return "solo";
  }

  const rawPlan = data?.[0]?.plan ?? null;
  return mapStoredPlanToPublicPlan(rawPlan);
}
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
