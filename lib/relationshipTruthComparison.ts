import type { RelationshipTruth } from "@/lib/relationshipTruth";
export const disagreementCategories = ["current_output_correct_shadow_wrong", "shadow_correct_current_output_wrong", "insufficient_evidence", "historical_evidence_gap", "identity_ambiguity"] as const;
export type DisagreementCategory = typeof disagreementCategories[number];
export type TruthObservation = { consumer: "lifecycle" | "outreach" | "responses" | "relationships" | "followups" | "search"; field: string; current: unknown; shadow: unknown; evidenceIds: string[]; classification?: DisagreementCategory; rationale?: string };
/** Comparison does not presume the shadow is right. Review classification is explicit. */
export function compareRelationshipTruth(truth: RelationshipTruth, observations: TruthObservation[]) {
  const counts = Object.fromEntries(disagreementCategories.map(c=>[c,0])) as Record<DisagreementCategory,number>;
  const differences = observations.filter(o=>JSON.stringify(o.current)!==JSON.stringify(o.shadow)).map(o=> {
    const classification=o.classification||"insufficient_evidence";
    if(!disagreementCategories.includes(classification))throw Error("Unknown disagreement classification.");
    if(!o.evidenceIds.length||!o.rationale)throw Error("Each disagreement requires evidence references and a review rationale.");
    counts[classification]++;
    return {...o,classification};
  });
  return {relationshipId:truth.relationshipId,asOf:truth.asOf,comparisons:observations.length,agreements:observations.length-differences.length,differences,counts,readOnly:true as const};
}
