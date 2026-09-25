import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies = {}) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, URL, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } }, { filename: file });
  return mod.exports;
}
const model = load("lib/contactLifecycle.ts", { "@/lib/engineState": load("lib/engineState.ts"), "@/lib/growthOutreach": load("lib/growthOutreach.ts") });
const row = (id, fields = {}) => ({ id, organisation_id: "tenant-a", ...fields });
const build = (input) => JSON.parse(JSON.stringify(model.buildContactLifecycle("tenant-a", { acquisition_items: [], inbox_items: [], growth_targets: [], ...input })));

test("canonical LinkedIn identity accepts profile variants only", () => {
  for (const url of ["https://www.linkedin.com/in/Jane/?trk=x#top", "linkedin.com/comm/in/jane", "https://uk.linkedin.com/in/JANE", "https://linkedin.com/in/%6aane"]) assert.equal(model.lifecycleLinkedInIdentity(url), "linkedin.com/in/jane");
  for (const url of ["https://linkedin.com.evil.test/in/jane", "https://evil.test/in/jane", "https://linkedin.com/company/acme", "https://linkedin.com/feed/update/123", "Jane", "https://linkedin.com/in/%zz"]) assert.equal(model.lifecycleLinkedInIdentity(url), null);
});

test("all three sources resolve to one contact by LinkedIn then email then person and organisation", () => {
  const input = {
    acquisition_items: [row("a", { person: " Jane Doe ", company: "ACME  LTD", source_url: "https://linkedin.com/comm/in/Jane", metadata: { email: "Jane@Example.com" }, status: "accepted" })],
    inbox_items: [row("i", { sender_email: " jane@example.com ", platform: "email", response_state: "needs_reply" })],
    growth_targets: [row("g", { target_name: "jane doe", company: "Acme Ltd", status: "active", stage: "day3_dm", last_action_at: "2026-09-20T10:00:00Z" })],
  };
  const original = JSON.stringify(input);
  const [contact] = build(input);
  assert.equal(build(input).length, 1);
  assert.equal(contact.identity, "linkedin:linkedin.com/in/jane");
  assert.equal(contact.currentStage, "needs_reply");
  assert.equal(contact.nextAction, "reply");
  assert.equal(contact.channel, "email");
  assert.equal(contact.lastAction.action, "outreach_marked_sent");
  assert.equal(contact.records.length, 3);
  assert.equal(JSON.stringify(input), original);
});

test("conflicting strong identities, ambiguous aliases, missing identity and tenants stay separate", () => {
  const strong = ["one", "two"].map(id => row(id, { target_name: "Jane", company: "Acme", linkedin_url: `https://linkedin.com/in/${id}`, email: "shared@example.com" }));
  const contacts = build({ growth_targets: strong, inbox_items: [row("email", { sender_email: "shared@example.com" }), row("name", { author_name: "Jane", raw: { company: "Acme" } }), row("empty1"), row("empty2"), row("foreign", { organisation_id: "tenant-b", sender_email: "foreign@example.com" })] });
  assert.equal(contacts.length, 6);
  assert.equal(contacts.some(c => c.identity.includes("foreign")), false);
  assert.equal(contacts.filter(c => c.identity.startsWith("record:")).length, 2);
  assert.equal(build({ growth_targets: [row("a", { target_name: "Jane", company: "A" }), row("b", { target_name: "Jane", company: "B" })] }).length, 2);
  assert.equal(build({ growth_targets: [row("a", { target_name: "Jane", company: "A", email: "a@example.com" }), row("b", { target_name: "Jane", company: "A", email: "b@example.com" })] }).length, 2);
  assert.throws(() => model.buildContactLifecycle(" ", {}), /Organisation/);
});

test("acquisition and response state mappings are exhaustive", () => {
  const acquisition = { new: "new", reviewing: "reviewing", accepted: "outreach_ready", actioned: "actioned", engaged: "engaged", converted: "converted", nurture: "nurture", lost: "lost", dismissed: "dismissed" };
  for (const [status, expected] of Object.entries(acquisition)) assert.equal(build({ acquisition_items: [row("a", { status })] })[0].currentStage, expected);
  const inbox = { needs_reply: "needs_reply", waiting_for_human: "waiting", no_reply_needed: "no_reply_needed", follow_up: "follow_up", nurture: "nurture", closed_or_lost: "lost", engaged: "engaged", converted: "converted" };
  for (const [response_state, expected] of Object.entries(inbox)) assert.equal(build({ inbox_items: [row("i", { response_state })] })[0].currentStage, expected);
  assert.equal(build({ inbox_items: [row("i", { kind: "connection_accepted", status: "needs_reply" })] })[0].nextAction, "first_message");
});

test("growth mapping derives only existing cadence and honours explicit next steps", () => {
  for (const [stage, expected] of [["day3_dm", "2026-09-23"], ["day10_insight", "2026-09-27"], ["day17_followup", "2026-09-27"]]) {
    const [contact] = build({ growth_targets: [row("g", { stage, status: "active", last_action_at: "2026-09-20T00:00:00Z" })] });
    assert.equal(contact.currentStage, "follow_up");
    assert.equal(contact.nextAction, stage);
    assert.equal(contact.nextDueDate, `${expected}T00:00:00.000Z`);
  }
  for (const fields of [{}, { last_action_at: "invalid" }]) assert.equal(build({ growth_targets: [row("g", { stage: "day3_dm", status: "active", ...fields })] })[0].nextDueDate, null);
  for (const [fields, expected] of [[{ stage: "connection", status: "active" }, "outreach_ready"], [{ stage: "parked" }, "nurture"], [{ reply_status: "positive" }, "engaged"], [{ deal_stage: "opportunity" }, "engaged"], [{ reply_status: "call_booked" }, "meeting"], [{ deal_stage: "won" }, "converted"], [{ call_outcome: "lost" }, "lost"], [{ stage: "future_state" }, "unknown"]]) assert.equal(build({ growth_targets: [row("g", fields)] })[0].currentStage, expected);
  const [contact] = build({ growth_targets: [row("g", { deal_stage: "meeting", next_step: "Send proposal", next_step_date: "2026-09-30", call_date: "2026-09-24" })] });
  assert.equal(contact.nextAction, "Send proposal");
  assert.equal(contact.nextDueDate, "2026-09-30T00:00:00.000Z");
});

test("terminal precedence, dates, last action and ties are deterministic", () => {
  const input = { inbox_items: [row("i", { sender_email: "a@example.com", response_state: "follow_up", follow_up_at: "2026-10-01", last_replied_at: "2026-09-20", response_updated_at: "2026-09-21", email_delivery_status: "draft" })], acquisition_items: [row("a", { metadata: { email: "a@example.com" }, status: "converted", current_action: "mark_converted", updated_at: "2026-09-22" })] };
  const [contact] = build(input);
  assert.equal(contact.currentStage, "converted");
  assert.equal(contact.nextAction, null);
  assert.equal(contact.nextDueDate, null);
  assert.equal(contact.lastAction.action, "mark_converted");
  const [inbox] = build({ inbox_items: input.inbox_items });
  assert.equal(inbox.nextDueDate, "2026-10-01T00:00:00.000Z");
  assert.equal(inbox.lastAction.action, "response_state:follow_up");
  const rows = [row("z", { email: "x@example.com", stage: "connection", status: "active" }), row("a", { email: "x@example.com", stage: "connection", status: "active" })];
  assert.deepEqual(build({ growth_targets: rows }), build({ growth_targets: [...rows].reverse() }));
});

test("GET authenticates, scopes and pages every read; failures never return partial results", async () => {
  const calls = [];
  let authorised = true;
  let fail = false;
  const dependencies = {
    "next/server": { NextResponse: { json: (body, options) => ({ body, options }) } },
    "@/lib/contactLifecycle": model,
    "@/lib/tenantRoute.server": { withTenantRoute: (handler, options) => {
      assert.equal(options.write, false); assert.equal(options.generation, false);
      return req => { if (!authorised) throw new Error("denied"); return handler(req, { organisationId: "tenant-a" }); };
    } },
    "@/lib/supabaseAdmin": { supabaseAdmin: { from: table => {
      const query = { select: () => query, eq: (key, value) => { assert.equal(key, "organisation_id"); assert.equal(value, "tenant-a"); return query; }, order: key => { assert.equal(key, "id"); return query; }, range: async (start, end) => {
        calls.push({ table, start, end });
        if (fail) return { error: new Error("database unavailable") };
        return { data: table === "acquisition_items" && start === 0 ? Array.from({ length: 500 }, (_, i) => row(String(i), { person: `Person ${i}`, company: "Acme" })) : [] };
      } };
      return query;
    } } },
  };
  dependencies["@/lib/lifecycleSnapshot.server"] = load("lib/lifecycleSnapshot.server.ts", dependencies);
  const route = load("app/api/growth/lifecycle/route.ts", dependencies);
  const result = await route.GET({});
  assert.equal(result.body.data.length, 500);
  assert.equal(calls.length, 4);
  assert.ok(calls.some(c => c.start === 500));
  assert.equal(result.options.headers["Cache-Control"], "private, no-store");
  fail = true;
  await assert.rejects(route.GET({}), /database unavailable/);
  authorised = false;
  const before = calls.length;
  assert.throws(() => route.GET({}), /denied/);
  assert.equal(calls.length, before);
});
