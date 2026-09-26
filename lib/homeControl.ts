import { buildContactLifecycle, type LifecycleInput, type LifecycleRow } from "@/lib/contactLifecycle";
import { connectionState, type HealthAccount } from "@/lib/connectionHealth";

export const controlGroups = ["done", "in_hand", "human", "blocked"] as const;
export type ControlGroup = typeof controlGroups[number];
export type ControlItem = {
  id: string; group: ControlGroup; name: string; stage: string; channel: string; source: string;
  operationalState: "running" | "scheduled" | "waiting" | "completed" | "blocked" | "human_action_required";
  lastAction: string; lastActionAt: string | null; handled: string; why: string;
  nextAction: string; nextDueDate: string | null; owner: string;
  humanReason: "by_design" | "automation_failed" | null;
  href: string; workflowHref: string; evidence: { label: string; value: string }[];
  prepared: string | null; fallback: { intended: string; completed: string; remaining: string; option: string } | null;
};
export type ControlInput = LifecycleInput & { scheduled_posts: LifecycleRow[]; social_accounts: LifecycleRow[] };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(text(value))) ? new Date(text(value)).toISOString() : null;
const plain = (value: string) => value.replaceAll("_", " ");
const nextLabel = (value: string) => ({ reply: "Respond to the current reply", follow_up: "Follow up", day3_dm: "Send the first follow-up manually", day10_insight: "Share the next insight manually", day17_followup: "Send the final follow-up manually", review_engagement: "Review the warm conversation", review_meeting: "Review the meeting and next step", review_nurture: "Review when ready for further contact", prepare_outreach: "Prepare outreach for review", connection: "Review the contact and prepare outreach", wait_for_reply: "Wait for a reply", review_when_ready: "Review when ready" } as Record<string, string>)[value] || plain(value);
const closed = new Set(["converted", "lost", "dismissed", "no_reply_needed"]);
const deliveryText = (value: unknown) => /token|oauth|auth|expired|disconnect/i.test(JSON.stringify(value)) ? "Connection needs attention"
  : /credit|quota|rate.limit|billing|payment/i.test(JSON.stringify(value)) ? "Provider limit or credits need review" : "Provider or delivery failure";
export const homeLink = (organisationId: string, values: Record<string, string>) => `/dashboard?${new URLSearchParams({ organisationId, ...values })}`;
const workflow = (organisationId: string, table: string, id: string) => {
  const path = table === "inbox_items" ? "/dashboard/responses" : table === "acquisition_items" ? "/dashboard/growth/acquisition" : table === "scheduled_posts" ? "/dashboard/approvals" : table === "social_accounts" ? "/dashboard/connect" : "/dashboard/growth/pipeline";
  return `${path}?${new URLSearchParams({ organisationId, ...(table === "inbox_items" || table === "acquisition_items" || table === "scheduled_posts" ? { itemId: id } : table === "growth_targets" ? { targetId: id } : {}) })}`;
};

/** Home presentation only: one current work item per Phase 4L contact, no writes or transitions. */
export function buildHomeControl(organisationId: string, input: ControlInput, now = Date.now()) {
  const scoped = Object.fromEntries(Object.entries(input).map(([table, rows]) => [table, rows.filter(row => row.organisation_id === organisationId)])) as ControlInput;
  const contacts = buildContactLifecycle(organisationId, { acquisition_items: scoped.acquisition_items, inbox_items: scoped.inbox_items, growth_targets: scoped.growth_targets }, now);
  const index = new Map(Object.entries(scoped).flatMap(([table, rows]) => rows.map(r => [`${table}:${r.id}`, r] as const)));
  const items: ControlItem[] = [];
  const recent = (value: string | null) => !!value && Date.parse(value) <= now && Date.parse(value) >= now - 7 * 86400000;
  const add = (item: Omit<ControlItem, "href" | "operationalState"> & { operationalState?: ControlItem["operationalState"] }) => items.push({ ...item,
    operationalState: item.group === "done" ? "completed" : item.group === "blocked" ? "blocked" : item.group === "human" ? "human_action_required" : item.operationalState || "waiting",
    href: homeLink(organisationId, { group: item.group, item: item.id }) });
  for (const contact of contacts) {
    const contactKey = contact.records.map(r => `${r.table}:${r.id}`).sort()[0];
    const ref = contact.actionRecord, row = index.get(`${ref.table}:${ref.id}`)!;
    const engine = object(row.engine_state), meta = object(row.metadata);
    const sourceOwned = ref.table === "acquisition_items" && !!row.engine_state;
    const members = contact.records.map(r => index.get(`${r.table}:${r.id}`)!);
    const nextDueDate = contact.nextDueDate;
    const delivery = text(row.email_delivery_status);
    const operational = contact.engineEvidence.find(e => e.sourceEngine === row.source_engine && e.sourceRecordId === row.source_record_id)?.operationalState || "";
    const deliveryIssue = ref.table === "inbox_items" && row.platform === "email" && row.email_classification === "bounce" && contact.currentStage === "lost";
    const redirect = ref.table === "inbox_items" && row.platform === "email" && row.email_classification === "redirect" && ["follow_up", "needs_reply"].includes(contact.currentStage);
    const failed = deliveryIssue || redirect || delivery === "failed" || ["delivery_issue", "redirect", "failed", "blocked", "error"].includes(operational);
    const waitingForDelivery = ["approved", "dispatching"].includes(delivery) && !closed.has(contact.currentStage);
    const engineScheduled = sourceOwned && contact.currentStage === "follow_up" && ["scheduled", "active", "due", "follow_up_due"].includes(text(engine.follow_up_status).toLowerCase());
    const engineProcessing = sourceOwned && text(row.status) === "new" && ["new", "unknown"].includes(contact.currentStage) && ["enriching", "processing", "queued", "preparing"].includes(operational);
    const human = !closed.has(contact.currentStage) && !waitingForDelivery && !engineProcessing && (
      ["new", "reviewing", "outreach_ready", "needs_reply", "engaged", "meeting", "unknown"].includes(contact.currentStage) ||
      (contact.currentStage === "follow_up" && !engineScheduled && contact.followUpStatus !== "waiting") ||
      (contact.currentStage === "nurture" && !!nextDueDate && Date.parse(nextDueDate) <= now));
    const prepared = [row.email_reply_draft, row.approved_response, row.proposed_response, row.draft_text, meta.prepared_outreach, meta.outreach_draft, meta.prepared_draft, meta.content_draft, meta.reply_draft].map(text).find(Boolean)?.slice(0, 6000) || null;
    const next = failed ? "Verify the outcome and resolve the blocked step" : engineProcessing ? "Await the source engine’s next update" : waitingForDelivery ? "Wait for the engine delivery acknowledgement" : contact.currentStage === "new" ? "Review and qualify this opportunity" : contact.currentStage === "outreach_ready" && contact.channel === "linkedin" ? "Prepare and send the first LinkedIn message manually" : nextLabel(contact.nextAction || (contact.currentStage === "waiting" ? "wait_for_reply" : "review_when_ready"));
    const owner = failed || human ? (row.owner_user_id ? "Assigned team member" : "You / your team") : sourceOwned ? `${contact.source} · recorded source state` : nextDueDate ? "Your team · scheduled next step" : "Your team · waiting / parked";
    const lastAction = contact.lastAction ? plain(contact.lastAction.action) : "No completed action recorded";
    const evidence = contact.records.map(r => ({ label: `${r.table} · ${r.id}`, value: `${plain(r.stage)} · ${r.source}` }));
    for (const e of contact.engineEvidence) evidence.push({ label: `${e.sourceEngine} · ${e.sourceRecordId}`, value: `Observed ${e.observedAt || "time unavailable"}; ${plain(e.operationalState)}. A recorded schedule is not confirmation of execution.` });
    if (text(row.evidence)) evidence.push({ label: "Source evidence", value: text(row.evidence).slice(0, 2000) });
    const common = { name: contact.name || text(row.entity) || contact.company || "Unnamed opportunity", stage: contact.currentStage, channel: contact.channel || "Not recorded", source: contact.source,
      lastAction, lastActionAt: contact.lastAction?.at || null, handled: contact.lastAction ? `Recorded: ${lastAction}` : "Captured the source record; no completed action is claimed.",
      nextAction: next, nextDueDate, owner, workflowHref: workflow(organisationId, ref.table, ref.id), evidence, prepared };
    if (!closed.has(contact.currentStage) || deliveryIssue) add({ ...common, id: `contact:${contactKey}`, group: failed ? "blocked" : human ? "human" : "in_hand",
      operationalState: delivery === "dispatching" || (engineProcessing && ["processing", "enriching", "preparing"].includes(operational)) ? "running" : engineScheduled || (contact.currentStage === "follow_up" && contact.followUpStatus === "waiting") || (engineProcessing && operational === "queued") ? "scheduled" : "waiting",
      why: failed ? "The source records a failure or an unusable route. Human takeover is needed." : human ? contact.currentStage === "engaged" ? "A warm relationship needs human judgement." : "This step requires a person’s judgement, approval or relationship work." : engineProcessing ? `The latest source snapshot records ${operational}; completion is not confirmed.` : waitingForDelivery ? "Approved dispatch is recorded, but delivery is not yet confirmed." : engineScheduled ? "The source engine records the cadence. Execution is not independently confirmed." : contact.currentStage === "nurture" ? "Parked for later; no monitoring job is implied." : "The next step is dated or waiting on another party; no human action is currently due.",
      humanReason: failed ? "automation_failed" : human ? "by_design" : null,
      fallback: failed ? { intended: operational === "redirect" ? "Reach the correct contact or route" : "Complete the prepared delivery step", completed: common.handled,
        remaining: "Confirm provider delivery and the correct destination before any retry or manual send.", option: "Open the existing workflow to verify and complete manually" } : null });

    // Activity receipts can overlap current work. Never sum these into a people total.
    const receipts: { label: string; at: string | null }[] = [];
    if (contact.lastAction && !contact.lastAction.action.startsWith("response_state:") && !contact.lastAction.action.startsWith("reply:") && contact.lastAction.action !== "engine_inbound" && contact.lastAction.action !== "engine_acknowledgement") receipts.push({ label: lastAction, at: contact.lastAction.at });
    for (const member of members) {
      if (member.kind === "connection_accepted") receipts.push({ label: "LinkedIn acceptance captured", at: date(member.created_at_platform || member.inserted_at) });
    }
    const receipt = receipts.filter(r => recent(r.at)).sort((a, b) => b.at!.localeCompare(a.at!))[0];
    if (receipt) add({ ...common, id: `receipt:${contactKey}`, group: "done", lastAction: receipt.label, lastActionAt: receipt.at,
      handled: `Recorded: ${receipt.label}`, why: "Source evidence confirms this action within the last seven days.", humanReason: null, fallback: null });
  }
  for (const row of scoped.scheduled_posts) {
    const meta = object(row.meta), status = text(row.status).toLowerCase();
    const pending = text(object(meta.approvals).state).toLowerCase() === "pending";
    const failed = status === "failed", completed = status === "posted";
    if (completed && !recent(date(row.posted_at))) continue;
    if (!completed && !failed && !pending && !["scheduled", "queued", "publishing"].includes(status)) continue;
    const results = Array.isArray(object(row.error_info).results) ? object(row.error_info).results as Record<string, unknown>[] : [];
    const succeeded = results.filter(r => r.ok === true).map(r => text(r.platform)).filter(Boolean);
    const remaining = results.filter(r => r.ok === false && !r.skipped).map(r => text(r.platform)).filter(Boolean);
    const group: ControlGroup = failed ? "blocked" : completed ? "done" : pending ? "human" : "in_hand";
    const handled = completed ? "Publishing confirmed" : succeeded.length ? `Confirmed on ${succeeded.join(", ")}` : "Content prepared; no completed delivery confirmed";
    add({ id: `post:${row.id}`, group, operationalState: status === "publishing" ? "running" : "scheduled", name: text(row.message).slice(0, 100) || "Prepared content", stage: status, source: "Publishing", channel: Array.isArray(row.platforms) ? row.platforms.map(String).join(", ") : "Not recorded",
      lastAction: completed ? "Published" : failed ? "Publishing attempted" : "Content queued", lastActionAt: date(row.posted_at || meta.last_publish_attempt_at || row.created_at), handled,
      why: failed ? deliveryText(row.error_info) : pending ? "A person must approve this content." : completed ? "The recorded publishing outcome is successful." : "A publishing schedule is recorded; completion is not yet confirmed.",
      nextAction: failed ? "Review platform results and complete only the remaining work" : pending ? "Review and approve content" : completed ? "No action due" : "Await scheduled publishing outcome",
      nextDueDate: completed ? null : date(row.scheduled_for), owner: failed || pending ? "You / your team" : completed ? "Publishing · confirmed" : "Publishing · recorded schedule",
      humanReason: failed ? "automation_failed" : pending ? "by_design" : null, workflowHref: workflow(organisationId, "scheduled_posts", row.id), prepared: text(row.message).slice(0, 6000) || null,
      evidence: [{ label: `scheduled_posts · ${row.id}`, value: `Status: ${status}; approval: ${text(object(meta.approvals).state) || "not recorded"}` }, ...succeeded.map(platform => ({ label: platform, value: "Publishing confirmed" })), ...remaining.map(platform => ({ label: platform, value: "Publishing failed; verify before retry" }))],
      fallback: failed ? { intended: "Publish the prepared content to the selected channels", completed: handled,
        remaining: remaining.length ? `Review ${remaining.join(", ")}. Do not repeat already confirmed publications.` : "Verify provider outcomes; completion is not confirmed.", option: "Open Approvals to inspect results and use the existing manual workflow" } : null });
  }
  for (const row of scoped.social_accounts) {
    const state = connectionState(row as unknown as HealthAccount, now);
    if (!["expired", "reconnect_required"].includes(state)) continue;
    add({ id: `connection:${row.id}`, group: "blocked", name: text(row.page_name) || text(row.platform), stage: state, source: "Connected accounts", channel: text(row.platform),
      lastAction: state === "expired" ? "Credential expired" : "Reconnection required", lastActionAt: state === "expired" ? date(row.token_expires_at) : null, handled: "Detected a recorded connection problem", why: state === "expired" ? "The saved credential has expired." : "This saved integration requires reconnection.",
      nextAction: "Reconnect or choose the existing manual workflow", nextDueDate: null, owner: "You / your team", humanReason: "automation_failed", workflowHref: workflow(organisationId, "social_accounts", row.id), prepared: null,
      evidence: [{ label: `social_accounts · ${row.id}`, value: state }], fallback: { intended: "Keep the saved channel available for automated work", completed: "No delivery is claimed from this health check", remaining: "Restore the connection; inspect affected work before manual completion", option: "Open Connect to restore access" } });
  }
  const rank = (item: ControlItem) => item.group === "done" ? -(Date.parse(item.lastActionAt || "") || 0) : item.stage === "needs_reply" ? 0 : item.stage === "meeting" ? 1 : item.nextDueDate && Date.parse(item.nextDueDate) <= now ? 2 : item.stage === "new" ? 5 : 3;
  items.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  return { generatedAt: new Date(now).toISOString(), recentSince: new Date(now - 7 * 86400000).toISOString(),
    groups: controlGroups.map(key => ({ key, count: items.filter(item => item.group === key).length, href: homeLink(organisationId, { group: key }) })), items };
}
export type HomeControl = ReturnType<typeof buildHomeControl>;
