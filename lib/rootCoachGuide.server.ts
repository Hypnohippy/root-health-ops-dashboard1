import { relationshipCoachAnswer, relationshipGuideLocator, relationshipCandidateName, resolveGlobalRelationship, relationshipIntent, blockedRelationshipAction } from "@/lib/relationshipCoach.server";
import type { RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { guideAnswer, type GuideAnswer } from "@/lib/rootCoachGuide";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";

export async function rootCoachGuidance(body: Record<string, unknown>, tenant: RelationshipTenant, reason?: (question: string, evidence: string, intent: ReturnType<typeof relationshipIntent>) => Promise<string>): Promise<GuideAnswer> {
  const allowed = new Set(["mode", "organisationId", "organisation_id", "route", "question", "relationshipRoute"]);
  if (Object.keys(body).some(key => !allowed.has(key))) throw Error("Guidance accepts only a workspace route and a question.");
  if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 600) throw Error("Invalid question.");
  if (blockedRelationshipAction(body.question)) return {workspace:"Read-only boundary",message:"No action taken. I can explain, interpret, prepare or suggest a draft for review, but cannot send, save, schedule or change records.",destinations:[]};
  const name=relationshipCandidateName(body.question);
  let locator = relationshipGuideLocator(body.route);
  if (!locator && name) locator=await resolveGlobalRelationship(tenant,name);
  const intent=relationshipIntent(body.question);
  const hint=body.relationshipRoute===undefined?null:relationshipGuideLocator(body.relationshipRoute);
  if(body.relationshipRoute!==undefined&&!hint)throw Error("Invalid relationship context.");
  // A global follow-up may retain a previously selected exact locator; it is
  // re-authorized and re-checked against Truth on every request, never trusted.
  if(!locator&&!name&&hint&&(intent!=="factual"||/this relationship|our history|latest interaction|emailed (?:him|her|them)|what is uncertain/i.test(body.question)))locator=hint;
  if (!locator && (name || intent!=="factual"))return {workspace:"Choose a relationship",message:"I could not establish one unique safe relationship for this question. Open Relationships and choose the correct record; I will not guess from a name, company or domain.",destinations:[{id:"relationships",label:"Relationships",href:`/dashboard/growth/relationships?organisationId=${encodeURIComponent(tenant.organisationId)}`}]};
  if (locator) {
    const answer=await relationshipCoachAnswer(tenant,locator,body.question);
    if (intent!=="factual") {
      if (!reason) return {...answer,message:answer.message+"\n\nAdvice is unavailable. No draft was sent or saved."};
      try { const advice=await reason(body.question,answer.message,intent);return {...answer,message:advice+"\n\nRecorded grounding:\n"+answer.message}; }
      catch { return {...answer,message:answer.message+"\n\nAdvice is temporarily unavailable. Please review the linked evidence; no draft was sent or saved."}; }
    }
    return answer;
  }
  if (typeof body.route === "string" && body.route.startsWith("/dashboard/growth/relationships/")) throw Error("Relationship unavailable.");
  let founderAllowed = false;
  try { await requireFounderIntelligence(tenant.organisationId); founderAllowed = true; }
  catch { /* Unavailable permission evidence never exposes a protected destination. */ }
  // No page HTML, conversation text, user-provided URLs, counts or operational tools.
  // Until server-verified attention evidence is supplied by the existing path, counts remain unavailable.
  return guideAnswer(body.route, body.question, tenant.organisationId, founderAllowed);
}
