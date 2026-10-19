// Facts are a snapshot of the submitted request. Recommendations never overwrite them.
export type RequestEvidence = Record<string, unknown> & { id: string; organisation_id: string };
export type BriefRecommendation = {
  understoodNeed: string; intervention: string; audience: string; outcomes: string;
  format: string; sessions: number; duration: string; resources: string;
  measurement: string; constraints: string; commercial: string;
};
export type SolutionBrief = {
  id: string; organisation_id: string; source_request_id: string;
  source_snapshot: RequestEvidence; recommendation: BriefRecommendation;
  status: "draft" | "approved"; version: number; approved_at: string | null;
  approved_by: string | null; presentation_resource_id: string | null;
  generation_token?: string | null;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function requestFact(source: RequestEvidence, key: string) {
  const payload = source.submission_payload;
  // New submissions preserve exactly what was supplied; intake defaults are
  // never promoted into client facts. Historical rows are explicitly labelled.
  return text(payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>)[key] : source[key]);
}
export const factFields = [
  ["client_organisation", "Client organisation"], ["contact_name", "Requester"],
  ["contact_email", "Requester email"], ["workshop_title", "Requested intervention"],
  ["initiative", "Initiative"], ["audience", "Audience"], ["notes", "Problem / submitted notes"],
  ["desired_outcomes", "Desired outcomes"], ["delivery_format", "Delivery format"],
  ["delivery_preference", "Delivery preference"], ["duration", "Duration"],
  ["timing", "Timing"], ["location", "Location"], ["estimated_investment", "Budget clues"],
  ["measurement_requirements", "Measurement requirements"], ["constraints", "Constraints"],
] as const;
export function missingBriefInformation(source: RequestEvidence) {
  return factFields.filter(([key]) => !requestFact(source, key) || /to (be )?confirm|not specified|\btbc\b|\btbd\b/i.test(requestFact(source, key))).map(([, label]) => label);
}
export function proposeSolutionBrief(source: RequestEvidence): BriefRecommendation {
  const fact = (key: string) => requestFact(source, key);
  return {
    understoodNeed: fact("notes") || fact("workshop_title") || "Clarify the training need with the requester.",
    intervention: fact("workshop_title") || "Workplace learning workshop (proposed)",
    audience: fact("audience"), outcomes: fact("desired_outcomes"),
    format: fact("delivery_format") || fact("delivery_preference") || "To confirm",
    sessions: 1, duration: fact("duration") || "45 minutes (proposed)",
    resources: "One editable presentation with private presenter guidance",
    measurement: fact("measurement_requirements") || "Proposed: anonymous learning reflection before and after the session; agree follow-up measures with the client.",
    constraints: fact("constraints") || fact("location"),
    commercial: "Pricing requires human review. No approved rate card is configured for this flow. This brief does not create or send a quote.",
  };
}
export function validateRecommendation(input: unknown): BriefRecommendation {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Recommendation is required.");
  const fields = input as Record<string, unknown>;
  const result: Record<string, string | number> = {};
  for (const key of Object.keys(proposeSolutionBrief({ id: "", organisation_id: "" }))) {
    if (key === "sessions") continue;
    if (typeof fields[key] !== "string" || fields[key].length > 6000) throw Error(`Invalid ${key}.`);
    result[key] = fields[key].trim();
  }
  if (!Number.isInteger(fields.sessions) || Number(fields.sessions) < 1 || Number(fields.sessions) > 24) throw Error("Sessions must be between 1 and 24.");
  result.sessions = Number(fields.sessions);
  if (!result.intervention || !result.understoodNeed) throw Error("Intervention and understood need are required.");
  return result as BriefRecommendation;
}
export function presentationInput(brief: SolutionBrief) {
  const r = brief.recommendation;
  if (brief.status !== "approved") throw Error("Approve the brief before creating a presentation.");
  if (!r.audience || !r.outcomes || !r.duration || !r.format || r.format === "To confirm") throw Error("Review audience, outcomes, duration and format before approval.");
  return {
    topic: r.intervention, goal: r.outcomes, audience: r.audience, duration: r.duration,
    deliveryMode: /hybrid/i.test(r.format) ? "hybrid" : /person|onsite|on-site/i.test(r.format) ? "in_person" : "online",
    notes: `Reviewed interpretation (not client facts): ${r.understoodNeed}\nDelivery format: ${r.format}\nSessions: ${r.sessions}\nConstraints: ${r.constraints}\nMeasurement plan (proposed): ${r.measurement}`,
    fillLevel: "draft", solutionBriefLayout: true,
  };
}
