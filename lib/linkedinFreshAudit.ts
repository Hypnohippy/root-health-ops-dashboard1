import { linkedInDayZeroMessage, linkedInFirstMessageFamily } from "@/lib/linkedinDayZero";
import type { LinkedInOutreachItem } from "@/lib/linkedinOutreach";

export type FreshAuditStatus = "passed" | "failed" | "not_run";
export type FreshAuditGeneration = { status: FreshAuditStatus; reasonCode?: string };
export type FreshAuditContact = {
  name: string;
  eligibleFresh: boolean;
  canonicalIdentity: "verified" | "not_verified";
  professionalEvidence: "available" | "unavailable" | "withheld" | "unknown";
  contextPreserved: boolean;
  rolePresent: boolean;
  companyPresent: boolean;
  recipientCategoryPresent: boolean;
  classification: "hr_consultant" | "people_leader" | "executive" | "partner" | "general";
  classificationConsistent: boolean;
  outboundSuppression: "clear" | "held";
  draftGeneration: FreshAuditStatus;
  reasonCodes: string[];
};
export type LinkedInFreshAuditReport = {
  schemaVersion: 1;
  generatedAt: string;
  mode: "deterministic_fresh_first_message";
  scope: "authenticated_current_organisation";
  validationOnly: true;
  externalModelCalls: 0;
  sends: 0;
  lifecycleWrites: 0;
  queueRevisionStable: boolean;
  traversalComplete: boolean;
  eligibleFreshContacts: number;
  contactsWithProfessionalEvidence: number;
  contextSuccessfullyPreserved: number;
  contextGenuinelyUnavailable: number;
  contextWithheld: number;
  unexpectedContextLoss: number;
  correctGeneralClassifications: number;
  correctSpecialisedClassifications: number;
  successfulDraftGenerations: number;
  failedDraftGenerations: number;
  contactsRequiringInvestigation: number;
  contacts: FreshAuditContact[];
  exceptions: Array<{ name: string; reasonCodes: string[] }>;
  exceptionsTruncated: boolean;
};

type ContextItem = Pick<LinkedInOutreachItem, "contactId" | "name" | "stage" | "mode" | "lifecycle" | "context" | "previousOutbound" | "professionalContextStatus">;
type ReportInput = {
  queued: LinkedInOutreachItem[];
  displayed: LinkedInOutreachItem[];
  generations: Map<string, FreshAuditGeneration>;
  queueTotal: number;
  queueRevisionStable: boolean;
  traversalComplete?: boolean;
  generatedAt?: string;
};

export function isLinkedInFreshAuditAvailable(environment: Record<string, string | undefined> = process.env) {
  return environment.VERCEL_ENV === "preview" && environment.VERCEL_GIT_COMMIT_REF === "codex/linkedin-first-message-engine";
}

export function generateFreshLinkedInFirstMessage(queued: LinkedInOutreachItem, presented: LinkedInOutreachItem, variant = 0) {
  if (queued.stage !== "connection" || queued.mode !== "fresh" || queued.lifecycle !== "outreach_ready") {
    throw Error("FRESH_CONTACT_NOT_ELIGIBLE");
  }
  if (queued.contactId !== presented.contactId || !canonicalLinkedInIdentityVerified(queued.contactId)) {
    throw Error("CANONICAL_LINKEDIN_IDENTITY_UNVERIFIED");
  }
  if (queued.previousOutbound) throw Error("OUTBOUND_HISTORY_PRESENT");
  if (!queued.context.name?.trim()) throw Error("CONTACT_NAME_UNVERIFIED");
  return linkedInDayZeroMessage(presented.context, variant);
}

export function freshDraftFailureReason(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "") : "";
  if (message === "CANONICAL_LINKEDIN_IDENTITY_UNVERIFIED" || message === "FRESH_CONTACT_NOT_ELIGIBLE" || message === "CONTACT_NAME_UNVERIFIED") return message;
  if (message === "OUTBOUND_HISTORY_PRESENT") return "OUTBOUND_HISTORY_SUPPRESSED";
  if (/professional context|review the recorded/i.test(message)) return "PROFESSIONAL_CONTEXT_VALIDATION_FAILED";
  if (/saved person.s name/i.test(message)) return "CONTACT_NAME_UNVERIFIED";
  return "DRAFT_GENERATION_FAILED";
}

function hasContext(item: ContextItem) {
  return !!(item.context.role?.trim() || item.context.company?.trim() || item.context.recipientCategory?.trim());
}

function canonicalLinkedInIdentityVerified(contactId: string) {
  try {
    const parsed: unknown = JSON.parse(contactId);
    return Array.isArray(parsed) && typeof parsed[1] === "string" && parsed[1].startsWith("linkedin:") && parsed[1].length > "linkedin:".length;
  } catch { return false; }
}

function safeName(value: string) {
  const redacted = value
    .replace(/https?:\/\/[^\s<>"']+/gi, "[redacted]")
    .replace(/(?:^|\s)(?:www\.)?linkedin\.com\/[^\s<>"']+/gi, " [redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/\b(?:bearer|token|session)[\s=:]+[A-Z0-9._~+/-]{8,}/gi, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80);
  return redacted || "Unnamed contact";
}

export function buildLinkedInFreshAuditReport(input: ReportInput): LinkedInFreshAuditReport {
  const displayedById = new Map(input.displayed.map(item => [item.contactId, item]));
  let contactsWithProfessionalEvidence = 0;
  let contextSuccessfullyPreserved = 0;
  let contextGenuinelyUnavailable = 0;
  let contextWithheld = 0;
  let unexpectedContextLoss = 0;
  let correctGeneralClassifications = 0;
  let correctSpecialisedClassifications = 0;
  let successfulDraftGenerations = 0;
  let failedDraftGenerations = 0;
  const contacts: FreshAuditContact[] = input.queued.map(queued => {
    const presented = displayedById.get(queued.contactId);
    const sourceHasContext = hasContext(queued);
    const outputHasContext = presented ? hasContext(presented) : false;
    const state = presented?.professionalContextStatus?.state ?? "unknown";
    const evidence = state === "available" || state === "withheld" || sourceHasContext || outputHasContext;
    const reasons = new Set<string>();
    if (!presented) reasons.add("DISPLAY_PROJECTION_MISSING");
    if (!canonicalLinkedInIdentityVerified(queued.contactId)) reasons.add("CANONICAL_LINKEDIN_IDENTITY_UNVERIFIED");

    const statusMatches = state === "available" ? outputHasContext
      : state === "unavailable" || state === "withheld" ? !outputHasContext
        : false;
    const contextLost = (sourceHasContext || state === "available") && !outputHasContext && state !== "withheld";
    if (!statusMatches) reasons.add(contextLost ? "CONTEXT_LOSS_AFTER_ENRICHMENT" : "CONTEXT_STATUS_MISMATCH");
    if (contextLost || !presented) unexpectedContextLoss++;

    if (evidence) contactsWithProfessionalEvidence++;
    if (state === "available" && outputHasContext && statusMatches) contextSuccessfullyPreserved++;
    if (state === "unavailable" && !sourceHasContext && !outputHasContext && statusMatches) contextGenuinelyUnavailable++;
    if (state === "withheld" && !outputHasContext && statusMatches) contextWithheld++;

    const classification = presented ? linkedInFirstMessageFamily(presented.context) : "general";
    const queuedClassification = linkedInFirstMessageFamily(queued.context);
    const classificationConsistent = !!presented && (state === "withheld" ? classification === "general" : state !== "unknown" && classification === queuedClassification);
    if (!classificationConsistent) reasons.add("CLASSIFICATION_PROJECTION_MISMATCH");
    if (statusMatches && classificationConsistent && classification === "general") correctGeneralClassifications++;
    if (statusMatches && classificationConsistent && classification !== "general" && state === "available" && outputHasContext) correctSpecialisedClassifications++;
    if (presented?.professionalContextStatus?.discrepancy) reasons.add("PROFESSIONAL_CONTEXT_DISCREPANCY");

    const eligibleFresh = queued.stage === "connection" && queued.mode === "fresh" && queued.lifecycle === "outreach_ready" && !queued.previousOutbound && canonicalLinkedInIdentityVerified(queued.contactId);
    const suppressionClear = eligibleFresh;
    if (!suppressionClear) reasons.add(queued.previousOutbound ? "OUTBOUND_HISTORY_SUPPRESSED" : "FRESH_ELIGIBILITY_CHECK_FAILED");
    let generation = input.generations.get(queued.contactId) || { status: "not_run" as const, reasonCode: "DRAFT_CHECK_NOT_COMPLETED" };
    if (!input.queueRevisionStable) {
      generation = { status: "not_run", reasonCode: "QUEUE_CHANGED_DURING_AUDIT" };
      reasons.add("QUEUE_CHANGED_DURING_AUDIT");
    }
    if (generation.status === "passed") successfulDraftGenerations++;
    if (generation.status === "failed") {
      failedDraftGenerations++;
      reasons.add(generation.reasonCode || "DRAFT_GENERATION_FAILED");
    }
    if (generation.status === "not_run") reasons.add(generation.reasonCode || "DRAFT_CHECK_NOT_COMPLETED");

    return {
      name: safeName(queued.name || presented?.name || "Unnamed contact"),
      eligibleFresh,
      canonicalIdentity: canonicalLinkedInIdentityVerified(queued.contactId) ? "verified" : "not_verified",
      professionalEvidence: state === "available" || state === "withheld" ? state : state === "unavailable" ? "unavailable" : "unknown",
      contextPreserved: state === "available" && outputHasContext && statusMatches,
      rolePresent: !!presented?.context.role?.trim(),
      companyPresent: !!presented?.context.company?.trim(),
      recipientCategoryPresent: !!presented?.context.recipientCategory?.trim(),
      classification,
      classificationConsistent,
      outboundSuppression: suppressionClear ? "clear" : "held",
      draftGeneration: generation.status,
      reasonCodes: [...reasons].sort(),
    };
  });

  const exceptions = contacts.filter(contact => contact.reasonCodes.length > 0).map(contact => ({ name: contact.name, reasonCodes: contact.reasonCodes }));
  const complete = input.traversalComplete !== false && input.queued.length === input.queueTotal && input.displayed.length === input.queued.length;
  if (!complete) {
    exceptions.push({ name: "Queue", reasonCodes: ["QUEUE_TRAVERSAL_INCOMPLETE"] });
  }
  const maxExceptions = 100;
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    mode: "deterministic_fresh_first_message",
    scope: "authenticated_current_organisation",
    validationOnly: true,
    externalModelCalls: 0,
    sends: 0,
    lifecycleWrites: 0,
    queueRevisionStable: input.queueRevisionStable,
    traversalComplete: complete,
    eligibleFreshContacts: input.queueTotal,
    contactsWithProfessionalEvidence,
    contextSuccessfullyPreserved,
    contextGenuinelyUnavailable,
    contextWithheld,
    unexpectedContextLoss,
    correctGeneralClassifications,
    correctSpecialisedClassifications,
    successfulDraftGenerations: input.queueRevisionStable ? successfulDraftGenerations : 0,
    failedDraftGenerations: input.queueRevisionStable ? failedDraftGenerations : 0,
    contactsRequiringInvestigation: exceptions.length,
    contacts,
    exceptions: exceptions.slice(0, maxExceptions),
    exceptionsTruncated: exceptions.length > maxExceptions,
  };
}
