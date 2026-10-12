import { lifecycleIdentityKeys, type LifecycleInput, type LifecycleRow } from "@/lib/contactLifecycle";
import { verifiedLinkedInProfile } from "@/lib/linkedinCaptureProfile";
import { emptyOutreachSelfIdentity, isOutreachSelfContact, type OutreachSelfIdentity } from "@/lib/outreachSelfIdentity";
import { explicitTestRecord } from "@/lib/acquisitionPresentation";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const stopped = (r: LifecycleRow) => [r.status, r.response_state, r.deal_stage, r.reply_status, object(r.engine_state).status, object(r.engine_state).deal_stage].some(v => ["dismissed", "lost", "closed", "closed_or_lost", "converted", "meeting", "engaged", "replied", "archived"].includes(text(v)));

export function invitationCategory(row: LifecycleRow) {
  const m = object(row.metadata), supplied = text(m.recipient_category);
  if (/^partner(?:_|$)|referrer|introducer/.test(supplied)) return "Partner / referrer";
  if (/hr.*(?:agency|consult)|outsourced/.test(supplied)) return "HR consultancy / agency";
  if (/education|college|training/.test(supplied)) return "College / education";
  if (/care|health|nursing/.test(supplied)) return "Care / health";
  if (/hr|people|buyer/.test(supplied)) return "HR / People";
  const role = text(m.headline || m.role_title || row.role_title);
  if (/\bHR\b.*(?:consult|agency)|outsourced.*\bHR\b/i.test(role)) return "HR consultancy / agency";
  if (/college|education|training provider/i.test(role)) return "College / education";
  if (/nursing|care|health leadership/i.test(role)) return "Care / health";
  if (/partnership|referrer|introducer/i.test(role)) return "Partner / referrer";
  if (/\bHR\b|human resources|people/i.test(role)) return "HR / People";
  return "Other strategic contact";
}

export function invitationProfile(row: LifecycleRow) {
  const m = object(row.metadata), engine = object(row.engine_state);
  const profiles = [row.source_url, m.profile_url, m.linkedin_url, row.linkedin_url, row.linkedin_identity, engine.linkedin_identity]
    .map(v => typeof v === "string" ? verifiedLinkedInProfile(v.startsWith("linkedin.com/") ? `https://${v}` : v) : null).filter((v): v is string => !!v);
  return new Set(profiles).size === 1 ? profiles[0] : null;
}

function eligibleSource(row: LifecycleRow) {
  const m = object(row.metadata), safety = object(m.safety);
  if (explicitTestRecord({ metadata: m }) || row.source_engine === "root_health_personal" || m.health_targeting === true || safety.health_targeting === true || m.consumer_outreach === true || safety.consumer_outreach === true) return false;
  // Explicit professional source qualification, never inferred from wellbeing words.
  return m.manual_connection_allowed === true || ["linkedin_connection_recommendation", "linkedin_connection_network"].includes(text(row.source_engine)) ||
    m.public_research === true && /^(?:partner|hr|people|buyer|education|college|care|health|strategic)/.test(text(m.recipient_category));
}

export function invitationHistory(row: LifecycleRow) {
  const history = object(object(row.metadata).linkedin_invitation).history;
  return Array.isArray(history) ? history.map(object) : [];
}
function sentReceipt(row: LifecycleRow) {
  return invitationHistory(row).filter(r => r.action === "invitation_sent" && text(r.key) && text(r.actor) && text(r.evidence) && Number.isFinite(Date.parse(text(r.invitation_sent_at))))
    .sort((a, b) => text(b.invitation_sent_at).localeCompare(text(a.invitation_sent_at)))[0] || null;
}

export function linkedInInvitationQueue(organisationId: string, input: LifecycleInput, self: OutreachSelfIdentity = emptyOutreachSelfIdentity()) {
  const scoped = Object.fromEntries(Object.entries(input).map(([table, rows]) => [table, rows.filter(r => r.organisation_id === organisationId)])) as LifecycleInput;
  const groups = new Map<string, LifecycleRow[]>();
  for (const row of scoped.acquisition_items) {
    const profile = invitationProfile(row);
    if (!profile || !eligibleSource(row) || !text(row.person) || isOutreachSelfContact([{ ...row, linkedin_url: profile }], self)) continue;
    groups.set(profile, [...(groups.get(profile) || []), row]);
  }
  return [...groups].map(([profile, members]) => {
    const identity = `linkedin:${profile.replace("https://www.", "")}`;
    const matches = (table: keyof LifecycleInput) => scoped[table].filter(r => {
      const raw = object(r.raw), m = object(r.metadata);
      return lifecycleIdentityKeys(table, r).includes(identity) || [r.linkedin_url, r.linkedin_identity, r.platform === "linkedin" ? r.permalink : null, raw.profile_url, object(raw.metadata).profile_url, m.profile_url, m.linkedin_url]
        .some(v => typeof v === "string" && verifiedLinkedInProfile(v.startsWith("linkedin.com/") ? `https://${v}` : v) === profile);
    });
    const inbox = matches("inbox_items"), targets = matches("growth_targets"), acquisitions = matches("acquisition_items");
    const acceptance = inbox.find(r => r.platform === "linkedin" && r.kind === "connection_accepted");
    const pending = members.map(r => ({ row: r, receipt: sentReceipt(r) })).filter(r => r.receipt)
      .sort((a, b) => text(b.receipt?.invitation_sent_at).localeCompare(text(a.receipt?.invitation_sent_at)))[0];
    const row = pending?.row || [...members].sort((a, b) => text(a.created_at).localeCompare(text(b.created_at)) || a.id.localeCompare(b.id))[0];
    const meta = object(row.metadata);
    const stoppedRelationship = [...inbox, ...targets, ...acquisitions].some(stopped);
    const known = inbox.length > 0 || targets.length > 0 || acquisitions.some(r => r.linkedin_conversation_active || r.linkedin_previously_contacted || r.contacted_at || r.first_outbound_at || r.manual_completion || r.actioned_at || object(r.engine_state).last_outbound_at || object(r.metadata).acceptance_verified === true || object(r.metadata).is_connected === true);
    const state = acceptance ? "accepted" : stoppedRelationship ? "excluded" : known ? "known" : pending ? "pending" : "to_connect";
    return { id: row.id, identity, profile, name: text(row.person), role: text(meta.headline || meta.role_title || row.role_title), company: text(row.company || meta.company),
      category: invitationCategory(row), reason: text(row.reason || row.signal), context: text(row.signal || row.evidence), source: text(row.source_engine),
      provenance: members.map(m => ({ id: m.id, source: text(m.source_engine), sourceRecordId: text(m.source_record_id), sourceUrl: text(m.source_url) })),
      state, invitationSentAt: text(pending?.receipt?.invitation_sent_at) || null, saved: invitationHistory(row).some(r => r.action === "save"),
      acceptedConnectionId: acceptance?.id || null, existingRecord: acceptance ? { table: "inbox_items", id: acceptance.id } : inbox[0] ? { table: "inbox_items", id: inbox[0].id } : targets[0] ? { table: "growth_targets", id: targets[0].id } : null,
      version: text(row.updated_at), sourceDetails: meta,
    };
  });
}
export type LinkedInInvitationItem = ReturnType<typeof linkedInInvitationQueue>[number];

export function planInvitationReceipt(row: LifecycleRow, action: "invitation_sent" | "save" | "dismiss", actor: string, key: string, confirmed: boolean, now = new Date()) {
  const history = invitationHistory(row);
  const previous = history.find(r => r.key === key);
  if (previous) { if (previous.action !== action) throw Error("Request key already used for another action."); return { duplicate: true, metadata: object(row.metadata) }; }
  if (action === "invitation_sent" && !confirmed) throw Error("Explicitly confirm you sent the invitation manually on LinkedIn.");
  if (action === "invitation_sent" && sentReceipt(row)) return { duplicate: true, metadata: object(row.metadata) };
  if (!actor || !key || !Number.isFinite(now.getTime())) throw Error("Valid human confirmation is required.");
  const receipt = { action, actor, key, confirmed_at: now.toISOString(), ...(action === "invitation_sent" ? { invitation_sent_at: now.toISOString() } : {}),
    evidence: action === "invitation_sent" ? "User explicitly confirmed a manually sent LinkedIn connection invitation; not acceptance or an outbound message" : "Explicit user decision in LinkedIn To connect" };
  return { duplicate: false, metadata: { ...object(row.metadata), linkedin_invitation: { ...object(object(row.metadata).linkedin_invitation), history: [...history, receipt] } } };
}

export function safeConnectionNote(note: string, name: string) {
  const first = name.trim().split(/\s+/)[0];
  return !!first && note.length <= 200 && note.length >= 20 && note.startsWith(`Hi ${first},`) && /connect/i.test(note) &&
    !/[?]|thanks for connecting|good to be connected|as (?:we )?discussed|meeting|book a|\bcall\b|\bdemo\b/i.test(note);
}
