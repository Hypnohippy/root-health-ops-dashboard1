import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(file, dependencies = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, URL, require: name => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; }, ...globals }, { filename: file });
  return mod.exports;
}
const outreach = load("lib/growthOutreach.ts");
const lifecycle = load("lib/contactLifecycle.ts", { "@/lib/growthOutreach": outreach });
const presentation = load("lib/responseLifecycle.ts", { "@/lib/contactLifecycle": lifecycle });
const context = load("lib/responseContactContext.ts");
const Card = load("app/dashboard/responses/ResponseLifecycleDetails.tsx", { "react/jsx-runtime": jsx }).default;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = Date.parse("2026-09-25T12:00:00Z");
const base = { organisation_id: A, linkedin_identity: "linkedin.com/in/contact" };
const item = (platform, fields = {}) => ({ ...base, id: ID, platform, kind: platform === "linkedin" ? "connection_accepted" : platform === "email" ? "email_reply" : "comment", status: "needs_reply", response_state: "needs_reply", author_name: "Contact", text: "Original event", created_at_platform: "2026-09-01", ...fields });
const target = (fields = {}) => ({ ...base, id: "target", target_name: "Contact", status: "active", stage: "connection", ...fields });
const input = (inbox_items, growth_targets = [], acquisition_items = []) => ({ inbox_items, growth_targets, acquisition_items });
const project = data => presentation.responseLifecycleMap(A, data, NOW).get(ID);

test("LinkedIn acceptance reflects contacted, due, engaged, parked and commercial lifecycle", () => {
  assert.equal(project(input([item("linkedin")])).label, "First message opportunity");
  const contacted = project(input([item("linkedin", { status: "replied", contacted_at: "2026-09-24T12:00:00Z" })]));
  assert.equal(contacted.label, "Contacted / follow-up scheduled");
  assert.equal(contacted.canMarkContacted, false); assert.equal(contacted.draftOnRequest, true);
  assert.equal(contacted.nextDueDate, "2026-09-27T12:00:00.000Z");
  for (const [fields, expected] of [
    [{ stage: "day3_dm", last_action_at: "2026-09-20" }, "Follow-up due"],
    [{ stage: "connection", last_action_at: "2026-09-24" }, "Contacted / follow-up scheduled"],
    [{ reply_status: "interested" }, "Engaged"], [{ stage: "parked" }, "Nurture"],
    [{ deal_stage: "meeting" }, "Meeting"], [{ deal_stage: "converted" }, "Converted"], [{ deal_stage: "lost" }, "Closed / lost"],
  ]) {
    const state = project(input([item("linkedin")], [target(fields)]));
    assert.equal(state.label, expected); assert.equal(state.canMarkContacted, false);
    assert.ok(renderToStaticMarkup(Card({ lifecycle: state })).includes(expected));
    assert.notEqual(context.interactionTypeFor(item("linkedin"), state), "linkedin_connection_first_message");
  }
});

test("email sent and acknowledgements wait, human reply wins over pending cadence", () => {
  const sent = project(input([item("email", { response_state: "engaged", status: "replied", email_delivery_status: "sent", email_sent_at: "2026-09-24" })]));
  assert.equal(sent.label, "Waiting"); assert.equal(sent.canDraft, false);
  const ack = project(input([item("email", { email_classification: "auto_acknowledgement", created_at_platform: "2026-09-24" })], [target({ stage: "day3_dm", last_action_at: "2026-09-20" })]));
  assert.equal(ack.label, "Waiting"); assert.equal(ack.canDraft, false); assert.equal(ack.nextDueDate, null);
  const human = item("email", { email_classification: "question", text: "Can you explain?", created_at_platform: "2026-09-24" });
  const state = project(input([human], [target({ stage: "day3_dm", last_action_at: "2026-09-20" })]));
  assert.equal(state.label, "Needs reply"); assert.equal(state.nextDueDate, null);
  assert.equal(context.interactionTypeFor(human, state), "email_reply");
  const follow = project(input([item("email", { response_state: "follow_up", follow_up_at: "2026-09-25" })]));
  assert.equal(follow.label, "Follow-up due"); assert.equal(context.interactionTypeFor(item("email"), follow), "followup");
});

test("email bounce and redirect expose review actions without overriding advanced lifecycle", () => {
  const bounce = item("email", { email_classification: "bounce", response_state: "closed_or_lost" });
  const blocked = project(input([bounce]));
  assert.equal(blocked.label, "Delivery issue / blocked");
  assert.equal(blocked.canDraft, false); assert.equal(blocked.humanActionRequired, true);
  assert.equal(project(input([bounce], [target({ deal_stage: "converted" })])).label, "Converted");
  const redirect = item("email", { email_classification: "redirect", response_state: "follow_up" });
  const review = project(input([redirect]));
  assert.equal(review.nextAction, "Review referral or redirect instructions");
  assert.equal(review.canDraft, false); assert.equal(review.humanActionRequired, true);
  assert.equal(project(input([redirect], [target({ deal_stage: "meeting" })])).label, "Meeting");
});

test("social events show current advanced state and never prompt outreach for closed contacts", () => {
  for (const platform of ["facebook", "instagram", "email"]) {
    const response = item(platform);
    for (const [fields, expected] of [[{ deal_stage: "meeting" }, "Meeting"], [{ deal_stage: "lost" }, "Closed / lost"], [{ deal_stage: "converted" }, "Converted"]]) {
      const state = project(input([response], [target(fields)]));
      assert.equal(state.label, expected);
      assert.ok(renderToStaticMarkup(Card({ lifecycle: state })).includes(expected));
      assert.equal(state.canDraft, expected === "Meeting");
      if (expected === "Meeting") {
        assert.equal(state.nextAction, "Respond to the current reply");
        assert.equal(context.interactionTypeFor(response, state), platform === "email" ? "email_reply" : "social_reply");
      }
    }
  }
  const replied = item("facebook", { status: "replied", last_replied_at: "2026-09-24" });
  const state = project(input([replied]));
  assert.equal(state.label, "Engaged"); assert.equal(state.humanActionRequired, false);
  assert.equal(context.interactionTypeFor(replied, state), "relationship_message");
  assert.equal(project(input([item("facebook", { status: "archived", response_state: null })])).label, "No action due");
});

test("old acceptance routes to the current human reply instead of drafting an outreach follow-up", () => {
  const old = item("linkedin");
  const current = item("linkedin", { id: "reply", kind: "dm", text: "Please tell me more", created_at_platform: "2026-09-24" });
  const map = presentation.responseLifecycleMap(A, input([old, current], [target({ stage: "day3_dm", last_action_at: "2026-09-20" })]), NOW);
  assert.equal(map.get(ID).label, "Needs reply"); assert.equal(map.get(ID).canDraft, false); assert.equal(map.get(ID).actionItemId, "reply");
  assert.equal(map.get("reply").canDraft, true);
  assert.equal(context.interactionTypeFor(current, map.get("reply")), "linkedin_reply");
});

test("partner acquisition evidence uses existing projection; unknown channels do not invent drafting rules", () => {
  const partner = { ...base, id: "partner", record_type: "partner_opportunity", status: "converted" };
  assert.equal(project(input([item("email")], [], [partner])).label, "Converted");
  assert.equal(project(input([item("vapi")])).canDraft, false);
  assert.equal(presentation.responseLifecycleMap(A, input([item("email", { organisation_id: "other" })])).size, 0);
});

function aiFixture(state, { changed = false, missing = false } = {}) {
  const prompts = [];
  let reads = 0;
  const contact = { lifecycle: state, interactionType: state.currentStage === "needs_reply" ? "email_reply" : "relationship_message", messageType: "Current conversation", objective: "Respect the current lifecycle." };
  const api = load("app/api/ai/root-coach/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: handler => req => handler(req, { organisationId: A, profile: {}, messages: [] }) },
    "@/lib/responseContactContext.server": { getResponseContactContext: async tenant => { assert.equal(tenant, A); reads++; if (missing) throw Error("unavailable"); return reads > 1 && changed ? { ...contact, lifecycle: { ...state, currentStage: "lost", canDraft: false } } : contact; } },
    "@/lib/responseContactContext": context,
  }, { process: { env: { OPENAI_API_KEY: "fixture" } }, fetch: async (_url, options) => { prompts.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: "Current-stage message" } }] }) }; } });
  return { prompts, run: (extra = {}) => api.POST({ json: async () => ({ context: "responses_lifecycle_draft_v1", inboxItemId: ID, ...extra }) }) };
}

test("AI blocks terminal, waiting and obsolete events before provider calls and requires an explicit request", async () => {
  const states = [
    project(input([item("email", { response_state: "closed_or_lost" })])),
    project(input([item("email", { response_state: "waiting_for_human" })])),
    project(input([item("linkedin")], [target({ deal_stage: "converted" })])),
  ];
  for (const state of states) {
    const f = aiFixture(state);
    assert.equal((await f.run({ requestedLifecycleDraft: true })).status, 409); assert.equal(f.prompts.length, 0);
  }
  const pending = project(input([item("linkedin", { status: "replied", contacted_at: "2026-09-24" })]));
  const f = aiFixture(pending);
  assert.equal((await f.run()).status, 409); assert.equal(f.prompts.length, 0);
  assert.equal((await f.run({ requestedLifecycleDraft: true })).status, 200);
  assert.match(JSON.stringify(f.prompts[0]), /unified current lifecycle is authoritative/i);
});

test("AI uses verified current stage, rejects missing identity and discards a draft if state changes", async () => {
  const state = project(input([item("email", { email_classification: "question" })]));
  const f = aiFixture(state);
  assert.equal((await f.run({ inboxItemId: null })).status, 400); assert.equal(f.prompts.length, 0);
  assert.equal((await f.run()).status, 200);
  const prompt = JSON.stringify(f.prompts[0]);
  assert.match(prompt, /verified lifecycle stage needs_reply/); assert.match(prompt, /email_reply/);
  assert.equal((await aiFixture(state, { changed: true }).run()).status, 409);
  assert.equal((await aiFixture(state, { missing: true }).run()).status, 503);
});

test("list and context share lifecycle projection, UI refreshes recorded actions and has no event-based draft fallback", () => {
  const list = fs.readFileSync("app/api/responses/list/route.ts", "utf8");
  const server = fs.readFileSync("lib/responseContactContext.server.ts", "utf8");
  const ui = fs.readFileSync("app/dashboard/responses/page.tsx", "utf8");
  assert.match(list, /responseLifecycleMap\(verified.organisationId, input\)/);
  assert.match(server, /presentResponseLifecycle\(contact, item\)/);
  assert.match(ui, /customerStatus = .*lifecycle\?\.label/);
  assert.match(ui, /selected.lifecycle\?\.canMarkContacted/);
  assert.match(ui, /await load\(\);\s*setAiStatus\("Marked as contacted/);
  assert.doesNotMatch(ui, /draftReplyLocal|contactAwareFallback|setReplyDraft\(fallback\)|responses_linkedin_first_message/);
});

test("server list and drafting context return the same advanced lifecycle across channels", async () => {
  const profile = { customers: { audience: "", problems: [] }, offer: { priorityServices: [] } };
  for (const platform of ["linkedin", "email", "facebook"]) {
    const data = input([item(platform)], [target({ deal_stage: "lost" })]);
    const dependencies = {
      "@/lib/lifecycleSnapshot.server": { readLifecycleInput: async id => { assert.equal(id, A); return data; } },
      "@/lib/contactLifecycle": lifecycle,
      "@/lib/responseLifecycle": presentation,
      "@/lib/responseContactContext": context,
      "@/lib/supabaseAdmin": { supabaseAdmin: { from: () => { throw Error("Unexpected extra table read"); } } },
    };
    const server = load("lib/responseContactContext.server.ts", dependencies);
    const briefing = await server.getResponseContactContext(A, ID, profile);
    assert.equal(briefing.currentStage, "Closed / lost"); assert.equal(briefing.interactionType, "no_action");
    const list = load("app/api/responses/list/route.ts", {
      ...dependencies,
      "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
      "@/lib/tenantAuth": { requireOrganisation: async (id, write) => { assert.equal(id, A); assert.equal(write, false); return { organisationId: A }; }, accessErrorResponse: () => null },
    });
    const result = await list.GET({ url: `https://ops.example/api/responses/list?organisationId=${A}` });
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(result.body.items[0].lifecycle)), JSON.parse(JSON.stringify(briefing.lifecycle)));
  }
});
