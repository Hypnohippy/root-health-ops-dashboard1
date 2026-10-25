import type { TruthRef, TruthRow } from "@/lib/relationshipTruth";
import { identitySourceFacts } from "@/lib/relationshipIdentityEvidence";
import type { IdentityLedgerRow } from "@/lib/relationshipIdentityLedger";
import type { PublicResearchSource } from "@/lib/relationshipResearch";
import { sharedIdentityMailbox } from "@/lib/relationshipIdentityEnrichment";

export const reviewedSourceTables = ["acquisition_items", "inbox_items", "founder_research_records"] as const;
export type ReviewedSourceTable = typeof reviewedSourceTables[number];
export type ApprovedPublicFact = { claim: string; sourceUrls: string[] };
export type ReviewedDecision = {
 version: 1; organisationId: string; actor: string; key: string; expiresAt: number; snapshot: string;
 action: "create" | "keep_separate" | "save_research"; label: string;
 table?: ReviewedSourceTable; row?: TruthRow; kind?: "person" | "company";
 separations?: {ref:TruthRef;aliases:{type:"linkedin"|"email";value:string}[]}[]; createdAliases?: {type:"linkedin"|"email";value:string}[];
 refs?: TruthRef[]; locator?: string; workspaceId?: string | null; workspaceRevision?: number | null;
 sources?: PublicResearchSource[]; facts?: ApprovedPublicFact[]; matched?: boolean;
 endpointSummary?: {ref:TruthRef;name:string;company:string|null;status:string|null;aliases:{type:"linkedin"|"email";value:string}[]}[];
 aliases?: {a: {type:"linkedin"|"email";value:string}[];b: {type:"linkedin"|"email";value:string}[]};
};
/** A human cannot-link remains authoritative. Only a newly recorded strong alias
 * reopens the review prompt; names, company wording, scores and repeated searches do not. */
export function separationNeedsReview(decision: IdentityLedgerRow, rows: {ref:TruthRef;row:TruthRow}[]) {
 return [decision.source_ref_a, decision.source_ref_b].some((ref, index) => {
  const current = rows.find(r => r.ref.table === ref.table && r.ref.id === ref.id);
  if (!current) return false;
  const facts = identitySourceFacts(ref, current.row), previous = index === 0 ? decision.alias_bindings.a : decision.alias_bindings.b;
  return facts.profiles.some(value => !previous.some(a => a.type === "linkedin" && a.value === value)) || facts.emails.some(value => !sharedIdentityMailbox(value) && !previous.some(a => a.type === "email" && a.value === value));
 });
}
/** Selection never broadens the server-attested preview. In particular there is
 * no path that accepts browser-provided claims or saves unverified candidates. */
export function selectedPublicEvidence(preview: Pick<ReviewedDecision,"matched"|"sources"|"facts">, urls: unknown) {
 if (!preview.matched) throw Error("Unverified candidates cannot be saved as relationship research.");
 if (!Array.isArray(urls) || !urls.length || urls.length > 8 || urls.some(u => typeof u !== "string")) throw Error("Select attributed evidence to save.");
 const chosen = new Set(urls as string[]), sources = (preview.sources || []).filter(s => chosen.has(s.url));
 if (sources.length !== chosen.size) throw Error("Evidence selection changed; review again.");
 // A multi-source assertion is saved only if ALL of its attribution was approved.
 const facts = (preview.facts || []).filter(f => f.sourceUrls.length && f.sourceUrls.every(u => chosen.has(u)));
 if (!facts.length) throw Error("The selected sources have no matched attributed findings.");
 return { sources, facts };
}
