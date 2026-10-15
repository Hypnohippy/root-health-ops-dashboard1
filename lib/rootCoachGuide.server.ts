import { guideAnswer, type GuideAnswer } from "@/lib/rootCoachGuide";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";

export async function rootCoachGuidance(body: Record<string, unknown>, tenant: { organisationId: string }): Promise<GuideAnswer> {
  const allowed = new Set(["mode", "organisationId", "organisation_id", "route", "question"]);
  if (Object.keys(body).some(key => !allowed.has(key))) throw Error("Guidance accepts only a workspace route and a question.");
  let founderAllowed = false;
  try { await requireFounderIntelligence(tenant.organisationId); founderAllowed = true; }
  catch { /* Unavailable permission evidence never exposes a protected destination. */ }
  // No page HTML, conversation text, user-provided URLs, counts or operational tools.
  // Until server-verified attention evidence is supplied by the existing path, counts remain unavailable.
  return guideAnswer(body.route, body.question, tenant.organisationId, founderAllowed);
}
