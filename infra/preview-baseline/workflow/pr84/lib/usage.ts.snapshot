import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOrganisation } from "@/lib/tenantAuth";

export async function getCurrentOrganisationId(requested?: string) {
  return (await requireOrganisation(requested, false)).organisationId;
}

export async function logUsageForOrganisation(
  organisationId: string,
  action: string
) {
  if (!organisationId) return;

  const costMap: Record<string, number> = {
    course_generation: 1,
    programme_generation: 5,
    deep_teach: 1,
    elite_deep_teach: 3,
    presentation_generation: 1,
  };

  const cost = costMap[action] || 1;

  const rows = Array.from({ length: cost }).map(() => ({
    organisation_id: organisationId,
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
}

export function mapStoredPlanToPublicPlan(
  raw: string | null | undefined
) {
  const p = String(raw || "").toLowerCase().trim();

  if (p === "enterprise" || p === "team") return "team";
  if (p === "pro" || p === "growth") return "growth";
  return "solo";
}

export async function getCurrentOrganisationPlan(requested?: string) {
  const organisationId = await getCurrentOrganisationId(requested);
  const { data, error } = await supabaseAdmin
    .from("organisation_plans")
    .select("plan")
    .eq("organisation_id", organisationId)
    .limit(1);

  if (error) {
    console.error("[usage] organisation_plans error", error);
    return "solo";
  }

  const rawPlan = data?.[0]?.plan ?? null;
  return mapStoredPlanToPublicPlan(rawPlan);
}

export async function getMonthlyUsageForOrganisation(organisationId: string) {
  if (!organisationId) return 0;

  const { count } = await supabaseAdmin
    .from("user_ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .gte(
      "created_at",
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    );

  return count || 0;
}
