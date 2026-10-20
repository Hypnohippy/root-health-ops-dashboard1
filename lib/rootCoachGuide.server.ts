import { relationshipCoachAnswer, relationshipGuideLocator } from "@/lib/relationshipCoach.server";
import type { RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { guideAnswer, type GuideAnswer } from "@/lib/rootCoachGuide";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";

export async function rootCoachGuidance(body: Record<string, unknown>, tenant: RelationshipTenant): Promise<GuideAnswer> {
  const allowed = new Set(["mode", "organisationId", "organisation_id", "route", "question"]);
  if (Object.keys(body).some(key => !allowed.has(key))) throw Error("Guidance accepts only a workspace route and a question.");
  const locator = relationshipGuideLocator(body.route);
  if (locator) return relationshipCoachAnswer(tenant, locator, body.question);
  if (typeof body.route === "string" && body.route.startsWith("/dashboard/growth/relationships/")) throw Error("Relationship unavailable.");
  let founderAllowed = false;
  try { await requireFounderIntelligence(tenant.organisationId); founderAllowed = true; }
  catch { /* Unavailable permission evidence never exposes a protected destination. */ }
  // No page HTML, conversation text, user-provided URLs, counts or operational tools.
  // Until server-verified attention evidence is supplied by the existing path, counts remain unavailable.
  return guideAnswer(body.route, body.question, tenant.organisationId, founderAllowed);
}
