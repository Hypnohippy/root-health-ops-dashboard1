import { IngestionError, parseIngestion } from "@/lib/growthIngestion.server";
import { lifecycleLinkedInIdentity, lifecycleStagePriority } from "@/lib/contactLifecycle";
import { projectEngineState, type EngineState } from "@/lib/engineState";

const engines = ["root_health_b2b", "root_health_personal"];
const stringFields = ["status", "reply_state", "approval_state", "funnel_state", "outcome", "opportunity_type", "follow_up_stage", "follow_up_status", "next_action", "channel", "email", "linkedin_identity", "person", "company", "follow_up_count", "discovery_source", "conversions"] as const;
const dateFields = ["last_follow_up_at", "next_follow_up_at", "last_inbound_at", "last_outbound_at", "discovered_at"] as const;
const aliases: Record<string, string> = { Status: "status", followUpStage: "follow_up_stage", lastFollowUpAt: "last_follow_up_at", nextFollowUpAt: "next_follow_up_at", followUpStatus: "follow_up_status", lastInboundAt: "last_inbound_at", lastOutboundAt: "last_outbound_at", linkedin_url: "linkedin_identity", followUpCount: "follow_up_count", discoverySource: "discovery_source", discoveredAt: "discovered_at" };
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new IngestionError("Expected an object.");
  return v as Record<string, unknown>;
}
function timestamp(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) throw new IngestionError(`Invalid ${field}; use an ISO timestamp with timezone.`);
  return new Date(v).toISOString();
}
export function parseEngineStateBatch(value: unknown, now = Date.now()) {
  const body = object(value);
  const base = parseIngestion(value);
  const rawRecords = body.records as unknown[];
  const records = base.records.map((record, index) => {
    if (!engines.includes(record.source_engine)) throw new IngestionError("Unsupported source engine.");
    if ((record.source_engine === "root_health_b2b") !== (record.record_type === "b2b_lead")) throw new IngestionError("Record type does not match source engine.");
    // This endpoint never imports approvals into the human-owned Ops workflow.
    if (record.status !== "new") throw new IngestionError("Use state.status for engine state; acquisition status must remain new.");
    const raw = object(rawRecords[index]);
    if (record.source_engine === "root_health_personal") {
      const safety = object(raw.safety);
      if (safety.public_context !== true || safety.consumer_outreach !== false || safety.health_targeting !== false || !record.source_url) throw new IngestionError("Personal records require public context, no consumer outreach and no health-based targeting.");
      if (record.record_type === "partner_opportunity" && safety.verified_public_business !== true) throw new IngestionError("Partner opportunities require verified public business context.");
      if (record.record_type === "social_opportunity") {
        const url = new URL(record.source_url);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const direct = ((host === "reddit.com" || host.endsWith(".reddit.com")) && /\/comments\/[^/]+/.test(url.pathname)) ||
          (["facebook.com", "instagram.com", "threads.net", "threads.com", "linkedin.com", "tiktok.com", "x.com", "twitter.com"].includes(host) && /\/(?:posts|p|post|status|video)\/[^/]+|\/feed\/update\/urn:li:/.test(url.pathname));
        if (safety.verified_direct_discussion !== true || !direct) throw new IngestionError("Social opportunities require a verified direct public discussion URL.");
      }
      record.metadata = { ...record.metadata, engine_safety: { public_context: true, consumer_outreach: false, health_targeting: false,
        verified_public_business: safety.verified_public_business === true, verified_direct_discussion: safety.verified_direct_discussion === true } };
    }
    const observedAt = timestamp(raw.observed_at, "observed_at");
    if (Date.parse(observedAt) > now + 300000) throw new IngestionError("observed_at is in the future.");
    const fields = object(raw.state), canonical: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      const name = aliases[key] || key;
      if (![...stringFields, ...dateFields].includes(name as typeof stringFields[number])) throw new IngestionError(`Unsupported state field: ${key}.`);
      if (name in canonical) throw new IngestionError(`Duplicate state field: ${name}.`);
      canonical[name] = value;
    }
    const state = {} as EngineState;
    for (const field of stringFields) {
      // Keep earlier snapshot shapes identical for safe retries of pre-mapping exports.
      if (["follow_up_count", "discovery_source", "conversions"].includes(field) && !(field in canonical)) continue;
      const v = canonical[field];
      if (v != null && (typeof v !== "string" || v.length > (field === "next_action" ? 2000 : 500))) throw new IngestionError(`Invalid ${field}.`);
      state[field] = typeof v === "string" ? v.trim() || null : null;
    }
    for (const field of dateFields) {
      if (field === "discovered_at" && !(field in canonical)) continue;
      state[field] = canonical[field] == null || canonical[field] === "" ? null : timestamp(canonical[field], field);
      if (field !== "next_follow_up_at" && state[field] && state[field]! > observedAt) throw new IngestionError(`${field} is later than observed_at.`);
    }
    if (state.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) throw new IngestionError("Invalid email.");
      state.email = state.email.toLowerCase();
    }
    if (state.linkedin_identity) {
      state.linkedin_identity = lifecycleLinkedInIdentity(state.linkedin_identity);
      if (!state.linkedin_identity) throw new IngestionError("Invalid LinkedIn identity.");
    }
    state.person ||= record.person; state.company ||= record.company;
    if (!state.channel && record.source_engine === "root_health_b2b") state.channel = "email";
    if (state.channel) state.channel = state.channel.toLowerCase();
    if (!state.status && !state.reply_state && !state.approval_state && !state.outcome && !state.funnel_state && !state.opportunity_type) throw new IngestionError("Supply source state evidence.");
    return { ...record, engine_state: state, engine_observed_at: observedAt };
  });
  return { organisationId: base.organisationId, records };
}

/** Reject weakening/conflicting snapshots, not manual Ops decisions. */
export function engineStateConflict(previous: EngineState, incoming: EngineState) {
  for (const field of ["email", "linkedin_identity"] as const) if (previous[field] && incoming[field] !== previous[field]) return "identity_conflict";
  if (!previous.email && !previous.linkedin_identity && previous.person && previous.company &&
    (previous.person.toLowerCase() !== incoming.person?.toLowerCase() || previous.company.toLowerCase() !== incoming.company?.toLowerCase())) return "identity_conflict";
  for (const field of ["last_inbound_at", "last_outbound_at", "last_follow_up_at"] as const) if (previous[field] && (!incoming[field] || incoming[field]! < previous[field]!)) return "evidence_regression";
  const before = projectEngineState(previous).stage, after = projectEngineState(incoming).stage;
  if (["converted", "lost", "meeting", "engaged", "needs_reply", "nurture"].includes(before) && lifecycleStagePriority[after] < lifecycleStagePriority[before]) {
    // A verified response answers a pending reply without restarting cold outreach.
    if (!(before === "needs_reply" && after === "engaged" && incoming.last_outbound_at && incoming.last_inbound_at && incoming.last_outbound_at > incoming.last_inbound_at)) return "stage_regression";
  }
  return null;
}
