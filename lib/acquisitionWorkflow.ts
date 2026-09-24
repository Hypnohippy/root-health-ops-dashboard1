export const acquisitionStatuses = ["new", "reviewing", "accepted", "actioned", "engaged", "converted", "nurture", "lost", "dismissed"] as const;
export type AcquisitionStatus = typeof acquisitionStatuses[number];
export const acquisitionActions = ["start_review", "accept", "dismiss", "prepare_outreach", "route_outreach", "create_content_draft", "route_campaign", "route_publishing", "route_responses", "mark_actioned", "nurture", "mark_engaged", "mark_converted", "mark_lost"] as const;
export type AcquisitionAction = typeof acquisitionActions[number];
type RecordType = "b2b_lead" | "personal_opportunity" | "partner_opportunity" | "social_opportunity";

const allowedByType: Record<RecordType, AcquisitionAction[]> = {
  b2b_lead: ["start_review", "accept", "dismiss", "prepare_outreach", "route_outreach", "nurture", "mark_engaged", "mark_converted", "mark_lost"],
  personal_opportunity: ["start_review", "accept", "dismiss", "create_content_draft", "route_campaign", "route_publishing", "mark_actioned", "mark_engaged", "mark_converted", "mark_lost"],
  partner_opportunity: ["start_review", "accept", "dismiss", "prepare_outreach", "route_outreach", "nurture", "mark_engaged", "mark_converted", "mark_lost"],
  social_opportunity: ["start_review", "accept", "dismiss", "create_content_draft", "route_publishing", "route_responses", "mark_actioned", "mark_engaged", "mark_converted", "mark_lost"],
};
const allowedFrom: Record<AcquisitionAction, AcquisitionStatus[]> = {
  start_review: ["new"],
  accept: ["new", "reviewing", "nurture"], dismiss: ["new", "reviewing", "accepted", "nurture"],
  prepare_outreach: ["accepted", "reviewing", "nurture"], route_outreach: ["accepted", "reviewing", "nurture"],
  create_content_draft: ["accepted", "reviewing", "nurture"], route_campaign: ["accepted", "reviewing", "nurture"],
  route_publishing: ["accepted", "reviewing", "nurture"], route_responses: ["accepted", "reviewing", "nurture"],
  mark_actioned: ["accepted", "reviewing", "nurture"], nurture: ["reviewing", "accepted", "actioned", "engaged"],
  mark_engaged: ["actioned", "nurture"], mark_converted: ["actioned", "engaged", "nurture"], mark_lost: ["reviewing", "accepted", "actioned", "engaged", "nurture"],
};
const destinations: Partial<Record<AcquisitionAction, string>> = {
  prepare_outreach: "/dashboard/growth/pipeline", route_outreach: "/dashboard/growth/pipeline",
  create_content_draft: "/dashboard/brainstorm", route_campaign: "/dashboard/campaigns/new",
  route_publishing: "/dashboard", route_responses: "/dashboard/responses",
};

export class AcquisitionWorkflowError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function planAcquisitionAction(recordType: string, currentStatus: string, action: string, outcome?: unknown) {
  if (!(recordType in allowedByType)) throw new AcquisitionWorkflowError("Unsupported acquisition item type.");
  if (!acquisitionActions.includes(action as AcquisitionAction)) throw new AcquisitionWorkflowError("Unsupported action.");
  const typedAction = action as AcquisitionAction;
  if (!allowedByType[recordType as RecordType].includes(typedAction)) throw new AcquisitionWorkflowError("Action is not available for this opportunity type.");
  if (!allowedFrom[typedAction].includes(currentStatus as AcquisitionStatus)) throw new AcquisitionWorkflowError("Action is not allowed from the current status.", 409);
  let nextStatus: AcquisitionStatus = currentStatus as AcquisitionStatus;
  if (typedAction === "start_review") nextStatus = "reviewing";
  else if (typedAction === "accept") nextStatus = "accepted";
  else if (typedAction === "dismiss") nextStatus = "dismissed";
  else if (typedAction === "nurture") nextStatus = "nurture";
  else if (typedAction === "mark_engaged") nextStatus = "engaged";
  else if (typedAction === "mark_converted") nextStatus = "converted";
  else if (typedAction === "mark_lost") nextStatus = "lost";
  else nextStatus = "actioned";
  const outcomeValue = ["mark_engaged", "mark_converted", "mark_lost"].includes(typedAction)
    ? (typeof outcome === "string" && outcome.trim() ? outcome.trim().slice(0, 2000) : nextStatus) : null;
  return { action: typedAction, nextStatus, outcome: outcomeValue, destination: destinations[typedAction] || null };
}

export function routeUrl(destination: string | null, organisationId: string, itemId: string) {
  if (!destination) return null;
  const params = new URLSearchParams({ organisationId, acquisitionItemId: itemId });
  return `${destination}?${params.toString()}`;
}
