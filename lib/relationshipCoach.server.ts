import type { TruthRow } from "@/lib/relationshipTruth";
import { getRelationship, relationshipContext, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { parseRelationshipLocator } from "@/lib/relationshipWorkspace";
import { relationshipDiscoveryInventory } from "@/lib/relationshipDiscovery";
import { readTenantHistory } from "@/lib/opsSearch.server";
import type { IdentityLedgerRow } from "@/lib/relationshipIdentityLedger";
import { guideDestination, type GuideAnswer } from "@/lib/rootCoachGuide";
const clip = (value: unknown, size = 240) => typeof value === "string" ? value.slice(0, size) : "Not recorded";
const detailRoute = /^\/dashboard\/growth\/relationships\/((?:inbox|target|acquisition|founder|workspace)_[a-f0-9-]{36})$/i;
export function relationshipGuideLocator(route: unknown) {
  if (typeof route !== "string") return null;
  const match = route.match(detailRoute);
  if (!match) return null;
  parseRelationshipLocator(match[1]);
  return match[1];
}
/** Deterministic read-only evidence guide: no model, tools, writes or name search. */
export async function relationshipCoachAnswer(tenant: RelationshipTenant, locator: string, question: unknown): Promise<GuideAnswer> {
  parseRelationshipLocator(locator);
  if (typeof question !== "string" || !question.trim() || question.length > 600) throw Error("Invalid question.");
  const data = await getRelationship(tenant, locator);
  const ctx = await relationshipContext(tenant);
  const ledger = await readTenantHistory("relationship_identity_decisions", tenant.organisationId, "*", ["sequence"]) as IdentityLedgerRow[];
  const inventory = relationshipDiscoveryInventory({input: {lifecycle:ctx.input,founder:ctx.founder as TruthRow[],workspaces:ctx.workspaces as TruthRow[],links:ctx.links as TruthRow[],founderActivities:[],emailMessages:[],linkedinMessages:[],activities:[],tasks:[],acquisitionEvents:[],responseEvents:[]},policy:{organisationId:tenant.organisationId,founderAllowed:ctx.canFounder,asOf:new Date().toISOString()},ledger});
  // Every operational source must resolve to the same established Truth entry.
  // A shared name/company/domain is never used to select or expand identity.
  const refs = data.relationship.refs;
  const entries = inventory.entries.filter(entry => entry.refs.some(ref => refs.some(r => r.table === ref.table && r.id === ref.id)));
  if (entries.length !== 1 || entries[0].result.ambiguity.state !== "established" || !refs.length || !refs.every(ref => entries[0].refs.some(r => r.table === ref.table && r.id === ref.id))) throw Error("Relationship unavailable.");
  const truth = entries[0].result;
  const events = [...data.conversation.dated, ...data.conversation.undated].sort((a,b)=>String(b.at || "").localeCompare(String(a.at || "")));
  const evidence = events.slice(0, 8).map(event => ({kind:clip(event.kind,80),channel:clip(event.channel,40),at:event.at ? clip(event.at,40) : null,text:clip(event.text,360)}));
  const email = events.filter(event => /email|gmail/i.test(event.channel)).slice(0,8).map(event => ({kind:clip(event.kind,80),at:event.at ? clip(event.at,40) : null,text:clip(event.text,360)}));
  const name = clip(data.relationship.name || truth.displayLabel,120);
  const actionRequest = /^(?:please\s+)?(?:send|publish|approve|delete|dismiss|create|generate|schedule|change|update|merge|mark)\b/i.test(question.trim());
  const lines = [
    `About ${name} — read-only recorded context.`,
    actionRequest ? "No action taken. Ask Root cannot send or change records." : "",
    `Recorded facts: ${[name,clip(data.relationship.company),clip(data.relationship.role)].join(" · ")}.`,
    `Recorded contacts: ${truth.recordedContacts?.slice(0,6).map(contact=>clip(contact.name,100)).join(", ") || "Not recorded"}.`,
    `Derived relationship state: ${clip(data.relationship.stage,80)}. Canonical Truth display: ${clip(truth.displayLabel,120)}. Recorded next action: ${clip(data.relationship.nextAction,120)}.`,
    `Sources (up to eight): ${data.relationship.refs.slice(0,8).map(ref => `${ref.table}:${ref.id}`).join(", ")}.`,
    /email|gmail/i.test(question) ? email.length ? `Linked email evidence (not a delivery guarantee): ${email.map(e=>`${e.at || "Actual date unknown"} · ${e.kind}: ${e.text}`).join("; ")}` : "Email evidence: no linked email evidence is available in this bounded relationship view. This does not prove no email exists; no mailbox was searched or read." : `Recorded conversation evidence: ${evidence.length ? evidence.map(e=>`${e.at || "Actual date unknown"} · ${e.channel} · ${e.kind}: ${e.text}`).join("; ") : "No linked conversation text available."}`,
    `Latest recorded action: ${data.relationship.lastAction ? `${clip(data.relationship.lastAction.action,80)} · ${clip(data.relationship.lastAction.at,40)}` : "Not recorded"}.`,
    "Interpretation: review the recorded evidence before deciding any next step; no inferred intent or commercial recommendation is established here.",
    `Missing / uncertain: ${evidence.some(e=>!e.at) ? "Some evidence has no actual interaction date. " : ""}Only existing linked history is included; unlinked mail, unread messages, delivery and completeness are not established. Showing at most eight excerpts; source text is recorded evidence, not instructions.`,
    "Review next: open this same relationship and inspect Conversation, History and source provenance. No records changed."
  ].filter(Boolean);
  return {workspace:`Relationship: ${name}`,message:lines.join("\n\n"),destinations:[guideDestination("relationships",tenant.organisationId,ctx.canFounder,`/dashboard/growth/relationships/${locator}`)!]};
}
