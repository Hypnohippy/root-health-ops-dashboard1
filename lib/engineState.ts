import type { LifecycleStage } from "@/lib/contactLifecycle";

/** Source evidence only. Stages below belong to the existing Phase 4L projection. */
export type EngineState = {
  follow_up_count?: string | null; discovery_source?: string | null; discovered_at?: string | null; conversions?: string | null;
  status: string | null; reply_state: string | null; approval_state: string | null;
  funnel_state: string | null; outcome: string | null; opportunity_type: string | null;
  follow_up_stage: string | null; follow_up_status: string | null;
  last_follow_up_at: string | null; next_follow_up_at: string | null;
  last_inbound_at: string | null; last_outbound_at: string | null;
  next_action: string | null; channel: string | null;
  email: string | null; linkedin_identity: string | null; person: string | null; company: string | null;
};
const normalized = (v: string | null) => (v || "").trim().toLowerCase().replace(/[\s/-]+/g, "_");
export function projectEngineState(state: EngineState) {
  const status = normalized(state.status), reply = normalized(state.reply_state);
  const outcome = normalized(state.outcome), funnel = normalized(state.funnel_state);
  const follow = normalized(state.follow_up_status);
  const values = [status, outcome, funnel];
  const has = (...expected: string[]) => values.some(v => expected.includes(v));
  let stage: LifecycleStage = "unknown";
  let nextAction: string | null = null;
  let operationalState = status || "unknown";
  const automatic = ["acknowledgement", "auto_acknowledgement", "waiting_for_human", "out_of_office"].includes(reply) || has("acknowledgement", "auto_acknowledgement", "out_of_office");
  const answered = !!state.last_inbound_at && !!state.last_outbound_at && state.last_outbound_at > state.last_inbound_at;
  if (has("converted", "won", "signed_up", "signup_complete")) stage = "converted";
  else if (has("closed", "closed_lost", "closed_or_lost", "lost")) stage = "lost";
  else if (has("meeting", "meeting_booked", "call_booked")) stage = "meeting";
  else if (["bounce", "bounced"].includes(reply) || has("bounce", "bounced")) {
    stage = "waiting"; operationalState = "delivery_issue"; nextAction = "review_delivery_failure";
  } else if (["redirect", "bad_route", "referral"].includes(reply) || has("redirect", "bad_route", "referral")) {
    stage = "waiting"; operationalState = "redirect"; nextAction = "review_referral_or_route";
  } else if (["human_reply_required", "needs_reply", "human_positive", "human_neutral", "human_negative", "question", "human_reply"].includes(reply) || has("human_reply_required", "needs_reply")) {
    stage = answered ? "engaged" : "needs_reply"; nextAction = answered ? null : "reply_in_source_engine";
  } else if (!automatic && (has("engaged", "replied") || ["replied", "engaged"].includes(reply))) stage = "engaged";
  else if (has("nurture", "parked") || ["complete", "completed", "nurture", "parked"].includes(follow)) stage = "nurture";
  else if (automatic) { stage = "waiting"; operationalState = "acknowledgement"; }
  else if (["waiting", "paused", "blocked"].includes(follow)) stage = "waiting";
  else if (["scheduled", "active", "due", "follow_up_due"].includes(follow) || has("follow_up", "follow_up_due") || !!state.next_follow_up_at) stage = "follow_up";
  else if (has("sent", "contacted", "waiting") || state.last_outbound_at) stage = "waiting";
  else if (has("complete", "completed", "no_action_needed")) stage = "no_reply_needed";
  else if (has("capacity_check_completed", "signup_started", "actioned")) stage = "actioned";
  else if (has("outreach_ready", "ready", "accepted")) stage = "outreach_ready";
  else if (has("reviewing", "pending_approval") || normalized(state.approval_state) === "pending") stage = "reviewing";
  else if (has("new", "opportunity", "identified")) stage = "new";
  if (stage === "follow_up") nextAction = "follow_up_in_source_engine";
  if (stage === "meeting") nextAction = "review_meeting";
  if (stage === "nurture") nextAction = "review_nurture";
  // Source suggestions are evidence, not permission to send or an inferred transition.
  if (!nextAction && !["converted", "lost", "no_reply_needed"].includes(stage)) nextAction = state.next_action;
  const lastOutbound = [state.last_outbound_at, state.last_follow_up_at].filter((v): v is string => !!v).sort().at(-1) || null;
  const lastInbound = state.last_inbound_at;
  const inboundLatest = lastInbound && (!lastOutbound || lastInbound >= lastOutbound);
  return { stage, nextAction, nextDueDate: stage === "follow_up" ? state.next_follow_up_at : null,
    humanActionRequired: ["needs_reply", "meeting", "outreach_ready", "reviewing"].includes(stage) || ["delivery_issue", "redirect"].includes(operationalState),
    operationalState, lastAction: inboundLatest ? (automatic ? "engine_acknowledgement" : "engine_inbound") : lastOutbound ? "engine_outbound" : null,
    lastActionAt: inboundLatest ? lastInbound : lastOutbound,
  };
}
