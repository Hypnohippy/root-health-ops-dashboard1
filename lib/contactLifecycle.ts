/** Read-only projection. No persisted identity, workflow transitions or sending. */
export type LifecycleTable = "acquisition_items" | "inbox_items" | "growth_targets";
export type LifecycleRow = { id: string; organisation_id: string; [key: string]: unknown };
export type LifecycleInput = Record<LifecycleTable, LifecycleRow[]>;
export type LifecycleStage = "new" | "reviewing" | "outreach_ready" | "actioned" | "needs_reply" | "waiting" | "follow_up" | "engaged" | "meeting" | "nurture" | "converted" | "lost" | "dismissed" | "no_reply_needed" | "unknown";
type Action = { action: string; at: string | null; table: LifecycleTable; id: string };
type Projection = {
  table: LifecycleTable; row: LifecycleRow; linkedin: string | null; email: string | null;
  fallback: string | null; name: string | null; company: string | null;
  currentStage: LifecycleStage; lastAction: Action | null; nextAction: string | null;
  nextDueDate: string | null; channel: string | null; source: string; observedAt: string | null;
};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normal = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(String(value))) ? new Date(String(value)).toISOString() : null;
const latest = (...values: unknown[]) => values.map(date).filter((v): v is string => v !== null).sort().at(-1) || null;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function lifecycleLinkedInIdentity(value: unknown): string | null {
  const input = text(value);
  if (!input) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!/^(?:[a-z]{2,3}\.|www\.)?linkedin\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:comm\/)?in\/([^/]+)\/?$/i);
    return match ? `linkedin.com/in/${encodeURIComponent(decodeURIComponent(match[1]).normalize("NFKC").toLowerCase())}` : null;
  } catch { return null; }
}

function project(table: LifecycleTable, row: LifecycleRow): Projection {
  const raw = object(row.raw);
  const meta = table === "inbox_items" ? { ...raw, ...object(raw.metadata) } : object(row.metadata);
  const name = text(table === "acquisition_items" ? row.person : table === "growth_targets" ? row.target_name : row.author_name);
  const company = text(row.company) || text(meta.company);
  const linkedin = [row.linkedin_identity, row.linkedin_url, meta.linkedin_url, meta.profile_url,
    table === "acquisition_items" ? row.source_url : null,
    table === "inbox_items" && row.platform === "linkedin" && row.kind === "connection_accepted" ? row.permalink : null,
  ].map(lifecycleLinkedInIdentity).find(Boolean) || null;
  const email = [row.sender_email, row.email, meta.email, meta.sender_email,
    row.platform === "email" ? row.author_handle : null,
  ].map(text).find(value => value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))?.toLowerCase() || null;
  const fallback = name && company ? JSON.stringify([normal(name), normal(company)]) : null;
  let currentStage: LifecycleStage = "unknown";
  let nextAction: string | null = null;
  let nextDueDate: string | null = null;
  let lastAction: Action | null = null;
  const action = (value: string, at: unknown): Action => ({ action: value, at: date(at), table, id: row.id });
  const status = text(row.status);
  if (table === "acquisition_items") {
    const stages: Record<string, LifecycleStage> = { new: "new", reviewing: "reviewing", accepted: "outreach_ready", actioned: "actioned", engaged: "engaged", converted: "converted", nurture: "nurture", lost: "lost", dismissed: "dismissed" };
    currentStage = stages[status || ""] || "unknown";
    nextAction = ({ new: "review", reviewing: "review", outreach_ready: "prepare_outreach", engaged: "review_engagement", nurture: "review_nurture" } as Partial<Record<LifecycleStage, string>>)[currentStage] || null;
    if (text(row.current_action)) lastAction = action(String(row.current_action), latest(row.updated_at, row.outcome_at, row.actioned_at));
  } else if (table === "inbox_items") {
    const state = text(row.response_state) || status;
    const stages: Record<string, LifecycleStage> = { needs_reply: "needs_reply", waiting_for_human: "waiting", no_reply_needed: "no_reply_needed", follow_up: "follow_up", nurture: "nurture", closed_or_lost: "lost", engaged: "engaged", converted: "converted", replied: "engaged", archived: "no_reply_needed", unread: "needs_reply" };
    currentStage = stages[state || ""] || "unknown";
    if (row.kind === "connection_accepted" && currentStage === "needs_reply") currentStage = "outreach_ready";
    nextAction = ({ needs_reply: "reply", outreach_ready: "first_message", follow_up: "follow_up", nurture: "review_nurture", engaged: "review_engagement" } as Partial<Record<LifecycleStage, string>>)[currentStage] || null;
    if (currentStage === "follow_up") nextDueDate = date(row.follow_up_at);
    if (date(row.last_replied_at)) lastAction = action("reply_sent", row.last_replied_at);
    if (date(row.response_updated_at) && (!lastAction?.at || String(date(row.response_updated_at)) > lastAction.at)) {
      // This is an observed state, not evidence that a draft was sent.
      lastAction = action(`response_state:${state || "unknown"}`, row.response_updated_at);
    }
  } else {
    const stage = text(row.stage);
    if (row.deal_stage === "won" || row.deal_stage === "converted" || row.call_outcome === "won") currentStage = "converted";
    else if (row.deal_stage === "lost" || row.call_outcome === "lost" || status === "lost" || row.reply_status === "not_interested") currentStage = "lost";
    else if (row.deal_stage === "meeting" || row.reply_status === "call_booked") currentStage = "meeting";
    else if (["engaged", "opportunity"].includes(String(row.deal_stage)) || ["positive", "interested", "engaged"].includes(String(row.reply_status))) currentStage = "engaged";
    else if (stage === "parked" || status === "parked") currentStage = "nurture";
    else if (status === "active") currentStage = stage === "connection" ? "outreach_ready" : ["day3_dm", "day10_insight", "day17_followup"].includes(stage || "") ? "follow_up" : "unknown";
    nextAction = ({ outreach_ready: "connection", follow_up: stage, engaged: "review_engagement", meeting: "review_meeting", nurture: "review_nurture" } as Partial<Record<LifecycleStage, string>>)[currentStage] || null;
    if (currentStage === "follow_up" && date(row.last_action_at)) nextDueDate = new Date(Date.parse(String(row.last_action_at)) + (stage === "day3_dm" ? 3 : 7) * 86400000).toISOString();
    if (currentStage === "meeting") nextDueDate = date(row.call_date);
    if (!["converted", "lost", "unknown"].includes(currentStage) && text(row.next_step)) {
      nextAction = text(row.next_step);
      nextDueDate = date(row.next_step_date);
    }
    if (date(row.last_action_at)) lastAction = action("outreach_marked_sent", row.last_action_at);
    if (date(row.replied_at) && (!lastAction?.at || String(date(row.replied_at)) > lastAction.at)) lastAction = action(`reply:${text(row.reply_status) || "recorded"}`, row.replied_at);
  }
  return { table, row, linkedin, email, fallback, name, company, currentStage, lastAction, nextAction, nextDueDate,
    channel: table === "growth_targets" ? "linkedin" : text(row.platform) || (linkedin ? "linkedin" : email ? "email" : null),
    source: text(row.source_engine) || text(row.source_type) || table,
    observedAt: latest(row.updated_at, row.response_updated_at, row.last_replied_at, row.last_action_at, row.replied_at, row.outcome_at, row.created_at_platform, row.created_at, row.inserted_at),
  };
}

// Explicit presentation precedence; never repairs conflicting source states.
const priority: Record<LifecycleStage, number> = { converted: 140, lost: 130, meeting: 120, needs_reply: 110, engaged: 100, nurture: 90, follow_up: 80, waiting: 70, no_reply_needed: 60, actioned: 50, outreach_ready: 40, reviewing: 30, dismissed: 20, new: 10, unknown: 0 };
const sourcePriority: Record<LifecycleTable, number> = { growth_targets: 3, inbox_items: 2, acquisition_items: 1 };
const rowKey = (p: Projection) => `${p.table}:${p.row.id}`;
function addAlias(index: Map<string, Set<string>>, alias: string | null, identity: string) {
  if (alias) index.set(alias, (index.get(alias) || new Set()).add(identity));
}
const unique = (values?: Set<string>) => values?.size === 1 ? [...values][0] : null;

export function buildContactLifecycle(organisationId: string, input: LifecycleInput) {
  if (!organisationId.trim()) throw new Error("Organisation is required.");
  const rows = (Object.keys(input) as LifecycleTable[]).flatMap(table => input[table]
    .filter(row => row.organisation_id === organisationId).map(row => project(table, row)));
  const emails = new Map<string, Set<string>>();
  for (const p of rows) if (p.linkedin) addAlias(emails, p.email, `linkedin:${p.linkedin}`);
  const strongIdentity = (p: Projection) => p.linkedin ? `linkedin:${p.linkedin}` : p.email ? unique(emails.get(p.email)) || `email:${p.email}` : null;
  const names = new Map<string, Set<string>>();
  for (const p of rows) {
    const key = strongIdentity(p);
    if (key) addAlias(names, p.fallback, key);
  }
  const groups = new Map<string, Projection[]>();
  for (const p of rows) {
    const key = strongIdentity(p) || (p.fallback ? unique(names.get(p.fallback)) || `person_org:${p.fallback}` : `record:${rowKey(p)}`);
    const group = groups.get(key) || [];
    group.push(p);
    groups.set(key, group);
  }
  return [...groups].sort(([a], [b]) => compare(a, b)).map(([identity, members]) => {
    members.sort((a, b) => priority[b.currentStage] - priority[a.currentStage]
      || compare(b.observedAt || "", a.observedAt || "") || sourcePriority[b.table] - sourcePriority[a.table] || compare(rowKey(a), rowKey(b)));
    const winner = members[0];
    const actions = members.flatMap(p => p.lastAction ? [p.lastAction] : []).sort((a, b) => compare(b.at || "", a.at || "") || compare(`${a.table}:${a.id}`, `${b.table}:${b.id}`));
    return { contactId: JSON.stringify([organisationId, identity]), identity, organisationId,
      name: members.find(p => p.name)?.name || null, company: members.find(p => p.company)?.company || null,
      currentStage: winner.currentStage, lastAction: actions[0] || null, nextAction: winner.nextAction,
      nextDueDate: winner.nextDueDate, channel: winner.channel, source: winner.source,
      records: members.map(p => ({ table: p.table, id: p.row.id, stage: p.currentStage, source: p.source })),
    };
  });
}
