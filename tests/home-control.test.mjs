import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
function load(file, deps = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, URL, URLSearchParams, require: name => { assert.ok(name in deps, `Unexpected dependency ${name}`); return deps[name]; } });
  return mod.exports;
}
const engine = load("lib/engineState.ts"), outreach = load("lib/growthOutreach.ts"), health = load("lib/connectionHealth.ts");
const lifecycle = load("lib/contactLifecycle.ts", { "@/lib/engineState": engine, "@/lib/growthOutreach": outreach });
const home = load("lib/homeControl.ts", { "@/lib/contactLifecycle": lifecycle, "@/lib/connectionHealth": health });
const command = load("lib/commandCentre.ts", { "@/lib/growthOutreach": outreach });
const responses = load("lib/responseLifecycle.ts", { "@/lib/contactLifecycle": lifecycle });
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = Date.parse("2026-09-25T12:00:00Z"), recent = "2026-09-24T12:00:00Z";
const row = (id, fields = {}) => ({ id, organisation_id: A, ...fields });
const empty = () => ({ acquisition_items: [], inbox_items: [], growth_targets: [], scheduled_posts: [], social_accounts: [] });
const run = changes => home.buildHomeControl(A, { ...empty(), ...changes }, now);
const current = result => result.items.filter(i => i.group !== "done");

test("contact lifecycle deduplicates current work and separates recent receipts from future manual cadence", () => {
  const result = run({ inbox_items: [row("acceptance", { platform: "linkedin", kind: "connection_accepted", status: "replied", contacted_at: recent, linkedin_identity: "linkedin.com/in/test", author_name: "Contact", inserted_at: recent })], growth_targets: [row("target", { target_name: "Contact", linkedin_identity: "linkedin.com/in/test", stage: "day3_dm", status: "active", last_action_at: recent })] });
  assert.equal(current(result).length, 1); assert.equal(current(result)[0].group, "in_hand");
  assert.match(current(result)[0].owner, /Your team/); assert.doesNotMatch(current(result)[0].owner, /automatic/i);
  assert.equal(current(result)[0].nextDueDate, "2026-09-27T12:00:00.000Z");
  assert.equal(current(result)[0].operationalState, "scheduled");
  assert.equal(result.items.filter(i => i.group === "done").length, 1);
  assert.equal(result.groups.reduce((n, g) => n + g.count, 0), 2);
  for (const group of result.groups) assert.equal(group.count, result.items.filter(i => i.group === group.key).length);
});

test("human decisions use advanced lifecycle; acknowledgements, sent mail and nurture are not manufactured human backlog", () => {
  const result = run({ inbox_items: [
    row("reply", { platform: "email", status: "needs_reply", response_state: "needs_reply", author_name: "Human reply" }),
    row("ack", { platform: "email", status: "needs_reply", email_classification: "auto_acknowledgement" }),
    row("sent", { platform: "email", status: "replied", response_state: "engaged", email_delivery_status: "sent", email_sent_at: recent }),
    row("first", { platform: "linkedin", kind: "connection_accepted", status: "needs_reply", inserted_at: recent }),
    row("old", { platform: "linkedin", kind: "connection_accepted", status: "needs_reply", linkedin_identity: "linkedin.com/in/closed" }),
  ], growth_targets: [row("closed", { linkedin_identity: "linkedin.com/in/closed", status: "active", stage: "connection", deal_stage: "lost" }), row("warm", { stage: "parked", reply_status: "interested" }), row("parked", { stage: "parked", status: "parked" }), row("meeting", { deal_stage: "meeting" })] });
  const active = current(result);
  assert.equal(active.filter(i => i.group === "human").length, 4);
  assert.equal(active.filter(i => i.group === "in_hand").length, 3);
  assert.ok(active.filter(i => i.group === "human").every(i => i.humanReason === "by_design"));
  assert.equal(active.some(i => i.stage === "lost"), false);
  assert.ok(active.find(i => i.name === "Human reply").workflowHref.includes("itemId=reply"));
});

test("dispatch awaiting acknowledgement is in hand, whereas failed approval delivery offers safe manual fallback", () => {
  const result = run({ inbox_items: [row("pending", { platform: "email", status: "needs_reply", email_delivery_status: "approved", email_reply_draft: "Prepared approved reply" }), row("failed", { platform: "email", status: "needs_reply", email_delivery_status: "failed", email_reply_draft: "Prepared reply", response_updated_at: recent })] });
  assert.equal(current(result).find(i => i.workflowHref.includes("itemId=pending")).group, "in_hand");
  const failed = result.items.find(i => i.group === "blocked");
  assert.equal(failed.humanReason, "automation_failed"); assert.equal(failed.prepared, "Prepared reply");
  assert.match(failed.fallback.remaining, /Confirm provider delivery/);
});

test("source engine schedules are recorded intent; due manual growth work requires a human", () => {
  const result = run({ acquisition_items: [row("engine", { source_engine: "root_health_b2b", source_record_id: "stable", status: "new", engine_observed_at: recent, engine_state: { status: "sent", channel: "email", follow_up_status: "scheduled", next_follow_up_at: "2026-09-25T10:00:00Z", last_outbound_at: "2026-09-20T10:00:00Z" } })], growth_targets: [row("manual", { status: "active", stage: "day3_dm", last_action_at: "2026-09-20T10:00:00Z" })] });
  assert.equal(current(result).filter(i => i.group === "human").length, 1);
  const automated = current(result).find(i => i.group === "in_hand");
  assert.match(automated.owner, /root_health_b2b/); assert.match(automated.why, /not independently confirmed/);
});

test("partial publishing and recorded auth/credit failures expose completed and remaining work without leaking credentials", () => {
  const result = run({ scheduled_posts: [row("partial", { status: "failed", message: "Prepared post", platforms: ["facebook", "linkedin"], error_info: { error: "TOKEN-SECRET credits unavailable", results: [{ platform: "facebook", ok: true, token: "TOKEN-SECRET" }, { platform: "linkedin", ok: false, error: "TOKEN-SECRET" }] } }), row("approval", { status: "scheduled", message: "Review", meta: { approvals: { state: "pending" } } }), row("scheduled", { status: "scheduled", scheduled_for: "2026-09-27T12:00:00Z" }), row("posted", { status: "posted", posted_at: recent }), row("old-post", { status: "posted", posted_at: "2025-01-01" })], social_accounts: [row("auth", { platform: "facebook", page_name: "Saved page", is_active: true, page_access_token: "TOKEN-SECRET", token_expires_at: "2026-09-20T12:00:00Z" }), row("foreign", { organisation_id: B, platform: "linkedin", is_active: false, page_access_token: "FOREIGN-TOKEN" })] });
  assert.equal(result.items.filter(i => i.group === "blocked").length, 2);
  assert.equal(result.items.filter(i => i.group === "done").length, 1);
  const failed = result.items.find(i => i.id === "post:partial");
  assert.match(failed.fallback.completed, /facebook/); assert.match(failed.fallback.remaining, /linkedin/);
  assert.doesNotMatch(JSON.stringify(result), /TOKEN-SECRET|FOREIGN-TOKEN|foreign/);
  assert.equal(result.items.some(i => i.stage === "not_connected"), false);
});

test("all control drill-downs identify actual records and preserve tenant selection", () => {
  const result = run({ inbox_items: [row("one", { status: "needs_reply", platform: "email" }), row("secret", { organisation_id: B, status: "needs_reply", author_name: "FOREIGN PERSON" })] });
  for (const item of result.items) {
    const url = new URL(item.href, "https://ops.example");
    assert.equal(url.searchParams.get("organisationId"), A); assert.equal(url.searchParams.get("item"), item.id);
    assert.equal(url.searchParams.get("group"), item.group); assert.equal(new URL(item.workflowHref, "https://ops.example").searchParams.get("organisationId"), A);
  }
  assert.doesNotMatch(JSON.stringify(result), /FOREIGN PERSON/);
});

test("bounces and redirects require takeover while explicit source processing stays in hand", () => {
  const result = run({ inbox_items: [row("bounce", { platform: "email", email_classification: "bounce", response_state: "closed_or_lost" }), row("redirect", { platform: "email", email_classification: "redirect", response_state: "needs_reply" })], acquisition_items: [row("processing", { status: "new", source_engine: "root_health_personal", source_record_id: "stable", engine_observed_at: recent, engine_state: { status: "processing" } })] });
  assert.equal(current(result).filter(i => i.group === "blocked").length, 2);
  const processing = current(result).find(i => i.group === "in_hand");
  assert.ok(processing); assert.match(processing.why, /processing/);
  assert.equal(processing.operationalState, "running");
  assert.ok(current(result).filter(i => i.group === "blocked").every(i => i.humanReason === "automation_failed"));
  assert.ok(current(result).filter(i => i.group === "blocked").every(i => i.operationalState === "blocked"));
});

test("operational labels preserve all six states without introducing execution state", () => {
  const result = run({ inbox_items: [row("waiting", { platform: "email", email_classification: "auto_acknowledgement", status: "needs_reply" }), row("human", { platform: "email", status: "needs_reply" })], scheduled_posts: [row("running", { status: "publishing" }), row("scheduled", { status: "scheduled" }), row("completed", { status: "posted", posted_at: recent }), row("blocked", { status: "failed" })] });
  assert.deepEqual([...new Set(result.items.map(item => item.operationalState))].sort(), ["blocked", "completed", "human_action_required", "running", "scheduled", "waiting"]);
});

test("focused record list APIs authorize first and retain tenant filters", async () => {
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const server = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
  for (const file of ["app/api/growth/acquisition/route.ts", "app/api/schedule/list/route.ts"]) {
    for (const allowed of [true, false]) {
      const filters = []; let authorized = false, reads = 0;
      const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, range: async () => ({ data: [], count: 0 }), limit: async () => ({ data: [] }) };
      const admin = { from() { assert.ok(authorized); reads++; return query; } };
      const auth = { requireOrganisation: async requested => { assert.equal(requested, A); if (!allowed) throw Error("DENIED"); authorized = true; return { organisationId: A }; }, accessErrorResponse: error => error.message === "DENIED" ? { status: 403 } : null };
      const route = load(file, { "next/server": server, "@/lib/tenantAuth": auth, "@/lib/supabaseAdmin": { supabaseAdmin: admin }, "../../../../lib/supabaseAdmin": { supabaseAdmin: admin }, "@/lib/growthIngestion.server": { statuses: ["new"], uuid: /^[a-f0-9-]{36}$/ } });
      const url = new URL(`https://ops.example/api/list?organisationId=${A}&itemId=${id}`);
      const result = await route.GET({ url: url.href, nextUrl: url });
      assert.equal(result.status, allowed ? 200 : 403);
      if (allowed) assert.deepEqual(filters, [["organisation_id", A], ["id", id]]); else assert.equal(reads, 0);
    }
  }
  const route = load("app/api/responses/list/route.ts", { "next/server": server, "@/lib/tenantAuth": { requireOrganisation: async () => ({ organisationId: A }), accessErrorResponse: () => null }, "@/lib/responseLifecycle": responses, "@/lib/lifecycleSnapshot.server": { readLifecycleInput: async tenant => { assert.equal(tenant, A); return { ...empty(), inbox_items: [row(id, { status: "needs_reply", inserted_at: "2020-01-01" }), row("newer", { status: "needs_reply", inserted_at: recent }), row(id, { organisation_id: B, author_name: "FOREIGN" })] }; } } });
  const result = await route.GET(new Request(`https://ops.example/api/list?organisationId=${A}&itemId=${id}&limit=1`));
  assert.equal(result.body.items.length, 1); assert.equal(result.body.items[0].id, id); assert.doesNotMatch(JSON.stringify(result), /FOREIGN/);
  const filters = [];
  const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, then(resolve) { resolve({ data: [] }); } };
  const pipeline = load("app/api/growth/pipeline/route.ts", { "next/server": server, "@/lib/tenantRoute.server": { withTenantRoute: handler => req => handler(req, { organisationId: A }) }, "@/lib/supabaseAdmin": { supabaseAdmin: { from: () => query } } });
  await pipeline.GET(new Request(`https://ops.example/api/growth/pipeline?targetId=${id}`));
  assert.deepEqual(filters, [["organisation_id", A], ["id", id]]);
});

test("Home API authorizes before reads, pages all records and fails closed without zero counts", async () => {
  for (const access of [false, true]) {
    const reads = [];
    let fail = false;
    const admin = { from(table) { const q = { select() { return q; }, eq(k, v) { assert.equal(k, "organisation_id"); assert.equal(v, A); return q; }, order() { return q; }, async range(start, end) {
      reads.push([table, start, end]); if (fail) return { data: null, error: new Error("PRIVATE DB ERROR") };
      return { data: table === "scheduled_posts" && start === 0 ? Array.from({ length: 500 }, (_, i) => row(`post${i}`, { status: "scheduled" })) : [], error: null };
    } }; return q; } };
    const route = load("app/api/home/attention/route.ts", { "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } },
      "@/lib/tenantAuth": { requireOrganisation: async requested => { assert.equal(requested, A); if (!access) throw Error("DENIED"); return { organisationId: A }; }, accessErrorResponse: error => error.message === "DENIED" ? { status: 403 } : null },
      "@/lib/supabaseAdmin": { supabaseAdmin: admin }, "@/lib/lifecycleSnapshot.server": { readLifecycleInput: async tenant => { assert.equal(tenant, A); reads.push(["lifecycle"]); return { acquisition_items: [], inbox_items: [], growth_targets: [] }; } },
      "@/lib/homeControl": home, "@/lib/connectionHealth": health, "@/lib/commandCentre": command, "@/lib/responseLifecycle": responses });
    const result = await route.GET(new Request(`https://ops.example/api/home/attention?organisationId=${A}`));
    assert.equal(result.status, access ? 200 : 403);
    if (!access) { assert.equal(reads.length, 0); continue; }
    assert.ok(reads.some(r => r[0] === "scheduled_posts" && r[1] === 500));
    assert.equal(result.body.control.groups.find(g => g.key === "in_hand").count, 500);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
    fail = true; const error = await route.GET(new Request(`https://ops.example/api/home/attention?organisationId=${A}`));
    assert.equal(error.status, 503); assert.equal(error.body.counts, undefined); assert.doesNotMatch(JSON.stringify(error), /PRIVATE DB ERROR/);
  }
});

test("Home renders operational detail and manual fallback while retaining existing cards and routes", () => {
  const view = load("app/dashboard/ControlOverview.tsx", { "react": React, "react/jsx-runtime": jsx, "next/link": { default: props => jsx.jsx("a", props) }, "@/lib/homeControl": home });
  const result = run({ inbox_items: [row("failed", { platform: "email", status: "needs_reply", email_delivery_status: "failed", email_reply_draft: "Prepared reply" })] });
  const markup = renderToStaticMarkup(jsx.jsx(view.ControlRecord, { item: result.items[0], expanded: true }));
  for (const text of ["Manual fallback", "Already completed", "Remaining", "Prepared reply", "Human needed because", "Source", "Owner"]) assert.ok(markup.includes(text), text);
  const overview = renderToStaticMarkup(jsx.jsx(view.default, { control: result }));
  for (const label of ["Done / recently handled", "In hand / scheduled", "Needs human", "Blocked / fallback"]) assert.ok(overview.includes(label));
  const page = fs.readFileSync("app/dashboard/page.tsx", "utf8");
  assert.equal((page.match(/key:"/g) || []).length, 10);
  for (const route of ["/dashboard/publishing", "/dashboard/growth/acquisition", "/dashboard/responses", "/dashboard/growth/pipeline", "/dashboard/connect", "/dashboard/approvals"]) assert.ok(page.includes(route));
  assert.match(page, /Counts are unavailable/); assert.match(page, /AbortController/); assert.doesNotMatch(page, /method:\s*["']POST/);
});
