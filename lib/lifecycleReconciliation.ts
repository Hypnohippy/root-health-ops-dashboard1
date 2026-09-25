import { buildContactLifecycle, lifecycleLinkedInIdentity, type LifecycleInput, type LifecycleRow, type LifecycleStage } from "@/lib/contactLifecycle";
import { nextGrowthStage } from "@/lib/growthOutreach";

export type LifecycleRepair = { table: "growth_targets" | "inbox_items"; id: string | null; patch: Record<string, unknown>; rule: string };
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const commercial = new Set<LifecycleStage>(["meeting", "converted", "lost"]);
const protectedStages = new Set<LifecycleStage>([...commercial, "engaged", "needs_reply", "nurture", "dismissed", "no_reply_needed"]);
const cadence = ["connection", "day3_dm", "day10_insight", "day17_followup", "parked"];
const humanClasses = new Set(["human_positive", "human_neutral", "human_negative", "question"]);
const automaticClasses = new Set(["auto_acknowledgement", "waiting_for_human", "out_of_office"]);
function conflictingProfiles(row: LifecycleRow) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  const raw = row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {};
  const rawMetadata = raw.metadata && typeof raw.metadata === "object" ? raw.metadata as Record<string, unknown> : {};
  const profiles = [row.linkedin_identity, row.linkedin_url, row.source_url, metadata.linkedin_url, metadata.profile_url,
    raw.profile_url, rawMetadata.profile_url, rawMetadata.linkedin_url,
    row.kind === "connection_accepted" ? row.permalink : null,
  ].map(lifecycleLinkedInIdentity).filter(Boolean);
  return new Set(profiles).size > 1;
}

/** Repairs use source evidence, not a numeric progression through display stages.
 * Commercial/engaged/manual nurture are protected from cadence. Human replies
 * suspend cadence; an acknowledgement can never downgrade a recorded human reply.
 */
export function planLifecycleReconciliation(organisationId: string, input: LifecycleInput) {
  const contacts = buildContactLifecycle(organisationId, input);
  const repairs: LifecycleRepair[] = [];
  let skippedAmbiguousContacts = 0;
  let duplicatesAvoided = 0;
  const index = new Map(Object.entries(input).flatMap(([table, rows]) => rows
    .filter(r => r.organisation_id === organisationId).map(r => [`${table}:${r.id}`, r] as const)));
  const add = (table: LifecycleRepair["table"], row: LifecycleRow, patch: Record<string, unknown>, rule: string) => {
    const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => {
      if (key.endsWith("_at")) return date(row[key]) !== date(value);
      return (row[key] ?? null) !== value;
    }));
    if (Object.keys(changed).length) {
      if (row.id === "__new__") Object.assign(repairs.find(r => r.table === "growth_targets" && r.id === null && r.patch.linkedin_identity === row.linkedin_identity)!.patch, changed);
      else repairs.push({ table, id: row.id, patch: changed, rule });
    }
  };
  for (const contact of contacts) {
    const records = contact.records.map(ref => ({ ...ref, row: index.get(`${ref.table}:${ref.id}`)! }));
    const targets = records.filter(r => r.table === "growth_targets");
    const inbox = records.filter(r => r.table === "inbox_items").map(r => r.row);
    // Never turn a display-only name/company association into an automatic write.
    const strong = records.every(ref => {
      const isolated = buildContactLifecycle(organisationId, { acquisition_items: [], inbox_items: [], growth_targets: [], [ref.table]: [ref.row] })[0];
      return isolated?.identity === contact.identity && /^(linkedin:|email:)/.test(isolated.identity);
    });
    if (!strong || targets.length > 1 || records.some(ref => conflictingProfiles(ref.row))) { skippedAmbiguousContacts++; continue; }
    let target = targets[0]?.row;
    const targetStage = targets[0]?.stage;
    const accepted = inbox.filter(r => r.platform === "linkedin" && r.kind === "connection_accepted" && r.status !== "archived");
    const contacted = accepted.filter(r => r.status === "replied");
    // Old Mark Contacted has no trustworthy time: do not invent a send date.
    if (contacted.some(r => !date(r.contacted_at) && !date(r.last_replied_at))) { skippedAmbiguousContacts++; continue; }
    const contactedAt = contacted.map(r => date(r.contacted_at) || date(r.last_replied_at)).sort().at(-1) || null;
    const human = inbox.filter(r => r.kind !== "connection_accepted" && (
      (r.platform === "email" && humanClasses.has(String(r.email_classification))) ||
      (r.platform === "linkedin" && r.kind === "dm" && text(r.text) && date(r.created_at_platform))
    ));
    const automatic = inbox.filter(r => r.platform === "email" && automaticClasses.has(String(r.email_classification)));
    const hasHuman = human.length > 0 || target?.reply_status === "engaged" || records.some(r => r.stage === "engaged" && r.row.kind !== "connection_accepted" && !automatic.includes(r.row));
    const advanced = records.find(r => commercial.has(r.stage))?.stage;
    const protectCadence = records.some(r => protectedStages.has(r.stage)
      && !(contacted.includes(r.row) && r.stage === "engaged")
      && !(automatic.includes(r.row) && r.stage === "needs_reply"));

    if (!target && accepted.length && !protectCadence) {
      const identity = contact.identity.replace(/^linkedin:/, "");
      if (!lifecycleLinkedInIdentity(identity) || !contact.name) { skippedAmbiguousContacts++; continue; }
      target = { id: "__new__", organisation_id: organisationId, target_name: contact.name, company: contact.company,
        linkedin_identity: identity, linkedin_url: `https://${identity}`, stage: contactedAt ? nextGrowthStage("connection") : "connection",
        status: "active", last_action_at: contactedAt, source_type: "lifecycle_connection_accepted", source_record_id: accepted.map(r => r.id).sort()[0] };
      repairs.push({ table: "growth_targets", id: null, patch: Object.fromEntries(Object.entries(target).filter(([key]) => !["id", "organisation_id"].includes(key))), rule: "accepted_connection" });
    } else if (target && accepted.length) duplicatesAvoided++;

    if (target?.id) {
      if (advanced) {
        // Each valid commercial state is absorbing; conflicting outcomes need judgement.
        if (!commercial.has(targetStage!)) add("growth_targets", target, { deal_stage: advanced === "converted" ? "converted" : advanced, status: "parked" }, "commercial_progress");
        else add("growth_targets", target, { status: "parked" }, "suspend_commercial_cadence");
      } else if (hasHuman) {
        const latestHuman = human.map(r => date(r.created_at_platform)).filter((v): v is string => !!v).sort().at(-1);
        add("growth_targets", target, { status: "parked",
          ...(["positive", "interested", "engaged"].includes(String(target.reply_status)) ? {} : { reply_status: "engaged" }),
          ...(latestHuman && (!date(target.replied_at) || latestHuman > date(target.replied_at)!) ? { replied_at: latestHuman } : {}),
        }, "human_reply");
      } else if (records.some(r => r.stage === "nurture") || target.stage === "parked") {
        add("growth_targets", target, { stage: "parked", status: "parked" }, "sequence_complete_or_nurture");
      } else if (automatic.length && !protectCadence) {
        // Keep the existing cadence position, but remove it from active follow-up queues.
        add("growth_targets", target, { status: "waiting" }, "automatic_acknowledgement");
      } else if (contactedAt && !protectCadence && (!targetStage || ["outreach_ready", "follow_up", "waiting"].includes(targetStage)) && target.stage === cadence[0] && (!date(target.last_action_at) || date(target.last_action_at)! <= contactedAt)) {
        add("growth_targets", target, { stage: nextGrowthStage("connection"), status: "active", last_action_at: contactedAt }, "marked_contacted");
      }
    }
    for (const item of inbox) {
      const stage = records.find(r => r.row === item)!.stage;
      if (commercial.has(stage) || stage === "nurture") continue;
      if (hasHuman || advanced) {
        const patch: Record<string, unknown> = { follow_up_at: null };
        if (automatic.includes(item) && ["needs_reply", "follow_up", "waiting"].includes(stage)) patch.response_state = "waiting_for_human";
        if (human.includes(item) && !["engaged", "no_reply_needed"].includes(stage) && item.status !== "replied") patch.response_state = "needs_reply";
        // Acceptance notifications are not inbound human replies.
        if (accepted.includes(item) && ["outreach_ready", "waiting", "follow_up"].includes(stage)) patch.response_state = "no_reply_needed";
        add("inbox_items", item, patch, "cancel_pending_follow_up");
      } else if (automatic.includes(item) && (!protectedStages.has(stage) || stage === "needs_reply")) {
        add("inbox_items", item, { response_state: "waiting_for_human", follow_up_at: null }, "automatic_acknowledgement");
      } else if (contacted.includes(item) && ["outreach_ready", "engaged", "waiting", "follow_up"].includes(stage)) {
        add("inbox_items", item, { response_state: "waiting_for_human" }, "marked_contacted");
      }
    }
  }
  return { contactsInspected: contacts.length, skippedAmbiguousContacts, duplicatesAvoided, repairs };
}
