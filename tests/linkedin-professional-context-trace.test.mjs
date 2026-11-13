import test from "node:test";
import assert from "node:assert/strict";
import { loadTruthModule } from "./relationship-truth-loader.mjs";

const org = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1";
const foreignOrg = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ids = ["9a14f3db-5dd7-4c43-94f9-7388cbf41bb2", "2048e384-5466-4782-b104-6e303372b762", "58af563b-5722-4210-8bfe-ec6a0561e9a6", "0f7b10bb-4f5c-4707-bd58-c0eb5afc482c"];
const targetId = "22222222-2222-4222-8222-222222222222";
const headline = "Chartered FCIPD HR Consultant & HR Director | Employment Law, Employee Relations, Change Management, HR Strategy, International HR";
const { linkedInProfessionalContextTraceEnabled: enabled, buildLinkedInProfessionalContextTrace: buildTrace } = loadTruthModule("lib/linkedinProfessionalContextTrace.server.ts");
const { linkedInOutreachQueue: queue } = loadTruthModule("lib/linkedinOutreach.ts");
const { enrichLinkedInOutreachDisplay: enrich } = loadTruthModule("lib/linkedinOutreachDisplay.ts");
const { linkedInFirstMessageFamily: family, linkedInDayZeroMessage: dayZero } = loadTruthModule("lib/linkedinDayZero.ts");

function rows() {
  const accepted = (id, name, profile, role, company = null) => ({ id, organisation_id: org, author_name: name, platform: "linkedin", kind: "connection_accepted", linkedin_identity: profile, permalink: `https://www.${profile}`, status: "needs_reply", response_state: "needs_reply", created_at_platform: new Date(Date.now() - 60_000).toISOString(), raw: { ...(role ? { headline: role } : {}), ...(company ? { company } : {}), canonical_profile_url: profile, ignored_private_secret: "do-not-return" } });
  const inbox = [
    accepted(ids[0], "Paul", "uk.linkedin.com/in/paulmcgrathuk", headline),
    accepted(ids[1], "Gabriela", "linkedin.com/in/gabriela-gligorea-5036a329", "HR Generalist"),
    accepted(ids[2], "Louise", "linkedin.com/in/hrconsultancywilts", "Multi Award Winning HR | Outsourced HR for UK SMEs | TUPE Expert | HR Consultant Wiltshire"),
    accepted(ids[3], "Vicky Smith", "linkedin.com/in/vicky-smith-fcipd-6131abb6", null),
  ];
  const growth = {
    id: targetId, organisation_id: org, target_name: "Paul", linkedin_identity: "linkedin.com/in/paulmcgrathuk",
    status: "active", stage: "connection", record_type: "b2b_lead", updated_at: new Date().toISOString(), raw: { private_token: "must-not-leak" }, metadata: {},
  };
  const foreign = accepted("foreign-paul-row", "Foreign Paul", "linkedin.com/in/paulmcgrathuk", "Foreign tenant fake title");
  foreign.organisation_id = foreignOrg;
  return { inbox_items: inbox, growth_targets: [growth], acquisition_items: [], foreign };
}

function contextFor(input, ledger = []) {
  return { input: { lifecycle: input, founder: [], workspaces: [], links: [], founderActivities: [], emailMessages: [], linkedinMessages: [], activities: [], tasks: [], acquisitionEvents: [], responseEvents: [] },
    policy: { organisationId: org, founderAllowed: false, asOf: new Date().toISOString() }, ledger };
}

function keepSeparate(inboxId, targetId) {
  const alias = "linkedin.com/in/paulmcgrathuk";
  return { id: "separate-paul", organisation_id: org, source_ref_a: { table: "inbox_items", id: inboxId }, source_ref_b: { table: "growth_targets", id: targetId },
    decision: "keep_separate", reviewed_evidence_ids: [`inbox_items:${inboxId}`, `growth_targets:${targetId}`], evidence_summary: "Exact profile records intentionally remain separate.",
    actor_user_id: "reviewer", created_at: "2026-11-12T12:00:00.000Z", decided_at: "2026-11-12T12:00:00.000Z", revision: 1, note: null, supersedes_decision_id: null,
    candidate_revision: "fixture", alias_bindings: { a: [{ type: "linkedin", value: alias }], b: [{ type: "linkedin", value: alias }] }, founder_only: false, idempotency_key: "keep-separate-paul" };
}

test("temporary trace is disabled by default and only enabled for its exact org with an explicit server flag", () => {
  assert.equal(enabled(org, {}), false);
  assert.equal(enabled(org, { LINKEDIN_PROFESSIONAL_CONTEXT_TRACE_ENABLED: "false" }), false);
  assert.equal(enabled(foreignOrg, { LINKEDIN_PROFESSIONAL_CONTEXT_TRACE_ENABLED: "true" }), false);
  assert.equal(enabled(org, { LINKEDIN_PROFESSIONAL_CONTEXT_TRACE_ENABLED: "true" }), true);
});

test("real queue construction exposes the accepted-row/action-row mismatch and display rejection without changing behavior", () => {
  const data = rows(), input = { inbox_items: data.inbox_items, growth_targets: data.growth_targets, acquisition_items: data.acquisition_items };
  const queued = queue(org, input, Date.now(), "all", [], Infinity).items.find(item => item.contactId === JSON.stringify([org, "linkedin:linkedin.com/in/paulmcgrathuk"]));
  assert.ok(queued, "Paul should be present in the synthetic current-lifecycle queue");
  assert.equal(queued.table, "growth_targets", "growth target is selected as the action record");
  assert.equal(queued.id, targetId);
  assert.equal(queued.context.role, headline, "queue obtains role from the exact-profile accepted row");

  const ledger = [keepSeparate(ids[0], queued.id)];
  const traces = [];
  const displayed = enrich([queued], contextFor(input, ledger), traces)[0];
  assert.equal(displayed.context.role, null, "the current ambiguity path anchors only to the action row");
  assert.equal(family(displayed.context), "general");
  assert.equal(traces[0].path, "ambiguous_identity_group_anchored_to_action_record");
  assert.equal(traces[0].actionRecord.table, "growth_targets");
  assert.equal(traces[0].anchor.id, queued.id);
  assert.equal(traces[0].anchor.roleCandidates.length, 0);
  assert.match(traces[0].anchor.rejection, /no professional facts/);

  const trace = buildTrace(input, org, [queued], [displayed], traces, { contactId: queued.contactId, message: dayZero(displayed.context) });
  const paul = trace.records.find(record => record.inboxId === ids[0]);
  assert.equal(paul.source.headline, headline);
  assert.equal(paul.identity.normalisedIdentity, "linkedin.com/in/paulmcgrathuk");
  assert.equal(paul.identity.exact, true);
  assert.equal(paul.recipientContext.role, headline);
  assert.equal(paul.queue.actionRecord.isAcceptedInbox, false);
  assert.equal(paul.queue.context.role, headline);
  assert.equal(paul.display.anchor.roleCandidates.length, 0);
  assert.equal(paul.finalApi.context.role, null);
  assert.equal(paul.finalApi.angle, "General");
  assert.equal(paul.generation.family, "general");
  assert.match(paul.generation.message, /I’m looking at how organisations can understand workforce wellbeing more continuously/);
  assert.deepEqual([...trace.records.map(record => record.inboxId)], ids);
});

test("exact-identity evidence, conflicts, General fallback, tenant boundary and data minimisation are visible without leaking raw payloads", () => {
  const data = rows();
  data.growth_targets = [];
  data.acquisition_items = [
    { id: "acq-paul", organisation_id: org, source_url: "https://www.linkedin.com/in/paulmcgrathuk", metadata: { headline: "Chartered FCIPD HR Consultant & HR…", private_key: "must-not-leak" } },
    { id: "foreign-acq", organisation_id: foreignOrg, source_url: "https://linkedin.com/in/paulmcgrathuk", metadata: { headline: "Foreign tenant title" } },
  ];
  const input = { inbox_items: data.inbox_items, growth_targets: [], acquisition_items: data.acquisition_items };
  const queueItems = queue(org, input, Date.now(), "all", [], Infinity).items;
  const trace = buildTrace(input, org, queueItems, queueItems, [], { contactId: queueItems[0]?.contactId || "", message: "Synthetic draft" });
  const paul = trace.records.find(record => record.inboxId === ids[0]);
  assert.ok(paul.matchingEvidence.some(source => source.id === "acq-paul"));
  assert.ok(paul.matchingEvidence.every(source => source.id !== "foreign-acq"));
  const vicky = trace.records.find(record => record.inboxId === ids[3]);
  assert.equal(vicky.source.headline, null);
  assert.equal(vicky.finalApi?.context.role ?? null, null);
  assert.equal(family({ role: vicky.source.roleTitle, company: vicky.source.company }), "general");
  const json = JSON.stringify(trace);
  assert.doesNotMatch(json, /must-not-leak|private_token|private_key|raw_payload|authorization|access_token/i);
  assert.ok(trace.records.every(record => ids.includes(record.inboxId)));
});

function routeFixture({ authorised = true, tenantOrg = org, traceEnabled = true } = {}) {
  const data = rows(), input = { inbox_items: data.inbox_items, growth_targets: data.growth_targets, acquisition_items: data.acquisition_items };
  const calls = { sourceReads: 0, revisions: 0, writes: 0, sends: 0, provider: 0 };
  const displayModule = { linkedInOutreachDisplay: async (tenant, items, traces) => enrich(items, contextFor(input, [keepSeparate(ids[0], targetId)]), traces) };
  const traceModule = loadTruthModule("lib/linkedinProfessionalContextTrace.server.ts");
  const route = loadTruthModule("app/api/growth/linkedin-console/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: handler => request => authorised ? handler(request, { organisationId: tenantOrg, userId: "test-operator", role: "owner" }) : { status: 401, body: { success: false, error: "Not signed in." } } },
    "@/lib/operationalRetention.server": { readProactiveRetention: async () => new Set() },
    "@/lib/supabaseAdmin": { supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { calls.revisions++; return { data: { revision: "1" }, error: null }; } }) }), insert: () => { calls.writes++; throw Error("unexpected write"); }, update: () => { calls.writes++; throw Error("unexpected write"); }, delete: () => { calls.writes++; throw Error("unexpected write"); }, upsert: () => { calls.writes++; throw Error("unexpected write"); } }) } },
    "@/lib/lifecycleSnapshot.server": { readLifecycleInput: async () => { calls.sourceReads++; return input; } },
    "@/lib/outreachSelfIdentity.server": { readOutreachSelfIdentity: async () => ({ names: [], emails: [], linkedinProfiles: [], linkedinAccountIds: [] }) },
    "@/lib/linkedinOutreachDisplay.server": displayModule,
    "@/lib/linkedinSendReconciliation.server": { reconcileLinkedInSend: () => { calls.sends++; throw Error("send path must not be invoked"); } },
    "@/lib/organisationProfile.server": { getOrganisationGenerationProfile: () => { calls.provider++; throw Error("provider path must not be invoked for first-message generation"); } },
    "@/lib/linkedinProfessionalContextTrace.server": { ...traceModule, linkedInProfessionalContextTraceEnabled: currentOrg => traceEnabled && currentOrg === org },
  });
  return { route, calls, input };
}

test("unauthenticated requests are rejected before lifecycle reads; foreign org receives no trace", async () => {
  const denied = routeFixture({ authorised: false });
  const response = await denied.route.GET({ url: `https://fixture.invalid/api/growth/linkedin-console?organisationId=${org}` });
  assert.equal(response.status, 401);
  assert.equal(denied.calls.sourceReads, 0);
  assert.equal(denied.calls.revisions, 0);

  const foreign = routeFixture({ tenantOrg: foreignOrg });
  const foreignResponse = await foreign.route.GET({ url: `https://fixture.invalid/api/growth/linkedin-console?organisationId=${foreignOrg}` });
  assert.equal(foreignResponse.status, 200);
  assert.equal(foreignResponse.body.professionalContextTrace, undefined);
  assert.equal(foreignResponse.body.organisationId, foreignOrg);
});

test("authenticated allowlisted GET and generation POST expose trace while remaining read-only and draft-only", async () => {
  const f = routeFixture();
  const get = await f.route.GET({ url: `https://fixture.invalid/api/growth/linkedin-console?view=all&organisationId=${org}` });
  assert.equal(get.status, 200);
  assert.deepEqual([...get.body.professionalContextTrace.allowedInboxIds], ids);
  assert.deepEqual([...get.body.professionalContextTrace.records.map(record => record.inboxId)], ids);
  const paul = get.body.professionalContextTrace.records.find(record => record.inboxId === ids[0]);
  assert.equal(paul.queue.actionRecord.table, "growth_targets");
  assert.equal(paul.finalApi.context.role, null);
  const post = await f.route.POST({ json: async () => ({ action: "generate", table: "growth_targets", id: targetId, revision: "1", variant: 0, organisationId: org }) });
  assert.equal(post.status, 200);
  assert.match(post.body.message, /I’m looking at how organisations can understand workforce wellbeing more continuously/);
  assert.equal(post.body.professionalContextTrace.records.find(record => record.inboxId === ids[0]).generation.family, "general");
  assert.equal(f.calls.writes, 0);
  assert.equal(f.calls.sends, 0);
  assert.equal(f.calls.provider, 0);
});
