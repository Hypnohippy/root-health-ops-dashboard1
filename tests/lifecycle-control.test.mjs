import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function load(file, dependencies, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, ...globals });
  return mod.exports;
}
function fixture(fetchResponse, component = "LifecycleReconciliationControl") {
  const calls = [], state = [];
  let cursor = 0;
  const react = {
    useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    useRef: initial => { const i = cursor++; return state[i] ||= { current: initial }; },
  };
  const tenant = load("lib/tenantFetch.ts", {}, {
    URL, URLSearchParams, window: { location: { origin: "https://ops.example", search: "?organisationId=tenant-a" } },
    fetch: async (url, options) => { calls.push({ url, options }); return fetchResponse(); },
  });
  const Control = load(`app/dashboard/growth/${component}.tsx`, { react, "react/jsx-runtime": jsx, "@/lib/tenantFetch": tenant, "./LifecycleContactLookup": () => null }).default;
  const render = () => { cursor = 0; return Control(); };
  const nodes = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const button = () => nodes(render()).find(n => n.type === "button");
  return { calls, render, button, nodes };
}
const summary = { contactsInspected: 10, repairsApplied: 2, skippedAmbiguousContacts: 1, duplicatesAvoided: 3, errors: [] };

test("manual control sends one authenticated tenant POST, prevents duplicate clicks and shows summary", async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const f = fixture(() => pending);
  assert.equal(f.calls.length, 0);
  assert.equal(f.button().props.children, "Run lifecycle reconciliation");
  const first = f.button().props.onClick();
  await f.button().props.onClick();
  assert.equal(f.button().props.disabled, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "/api/growth/lifecycle/reconcile?organisationId=tenant-a");
  assert.equal(f.calls[0].options.method, "POST");
  assert.equal(f.calls[0].options.credentials, "same-origin");
  resolve({ ok: true, status: 200, json: async () => summary });
  await first;
  assert.equal(f.button().props.disabled, false);
  assert.deepEqual(f.nodes(f.render()).filter(n => n.type === "dd").map(n => n.props.children), [10, 2, 1, 3, "None"]);
});

test("lookup uses canonical profile identity ahead of names, returns candidates safely and isolates tenants", async () => {
  const outreach = load("lib/growthOutreach.ts", {});
  const model = load("lib/contactLifecycle.ts", { "@/lib/growthOutreach": outreach }, { URL });
  const rows = [
    { id: "nick", organisation_id: "tenant-a", target_name: "Nick", linkedin_identity: "linkedin.com/in/nick-fahy-54778a1", stage: "day3_dm", status: "active", source_type: "acceptance", source_record_id: "source-1", notes: "private unrelated notes" },
    { id: "legacy", organisation_id: "tenant-a", target_name: "Dips Kang", linkedin_url: "https://www.linkedin.com/in/dips-kang/?trk=mail", stage: "connection", status: "active" },
    { id: "imposter", organisation_id: "tenant-a", target_name: "linkedin.com/in/nick-fahy-54778a1", linkedin_identity: "linkedin.com/in/other" },
    { id: "foreign", organisation_id: "tenant-b", target_name: "Dips Kang", linkedin_identity: "linkedin.com/in/dips-kang" },
  ];
  let reads = 0;
  const route = load("app/api/growth/lifecycle/lookup/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: (handler, options) => { assert.equal(options.write, false); assert.equal(options.generation, false); return req => handler(req, { organisationId: "tenant-a" }); } },
    "@/lib/lifecycleSnapshot.server": { readLifecycleInput: async tenant => { assert.equal(tenant, "tenant-a"); reads++; return { growth_targets: rows }; } },
    "@/lib/contactLifecycle": model,
  }, { URL });
  const lookup = q => route.GET({ url: `https://ops.example/api/growth/lifecycle/lookup?q=${encodeURIComponent(q)}` });
  const nick = await lookup("https://www.linkedin.com/comm/in/NICK-FAHY-54778a1/?trk=mail");
  assert.equal(nick.body.matches.length, 1); assert.equal(nick.body.matches[0].id, "nick");
  assert.equal(nick.body.matchType, "linkedin"); assert.equal(nick.headers["Cache-Control"], "private, no-store");
  assert.equal(nick.body.matches[0].source_record_id, "source-1"); assert.equal("notes" in nick.body.matches[0], false);
  assert.equal((await lookup("linkedin.com/in/dips-kang")).body.matches[0].id, "legacy");
  assert.equal((await lookup("  DIPS   Kang ")).body.matches.length, 1);
  assert.equal((await lookup("Dips")).body.matchType, "name");
  assert.equal((await lookup("linkedin.com/in/not-found")).body.exists, false);
  const before = reads;
  for (const invalid of ["", "https://linkedin.com/company/acme", "https://evil.test/in/nick", "x".repeat(301)]) assert.equal((await lookup(invalid)).status, 400);
  assert.equal(reads, before);
});

test("lookup UI makes only a tenant-authenticated GET and labels name candidates", async () => {
  const target = { id: "dips", target_name: "Dips Kang", linkedin_identity: "linkedin.com/in/dips", linkedin_url: null, stage: "connection", status: "active", source_type: "acceptance", source_record_id: "abc" };
  const f = fixture(() => ({ ok: true, json: async () => ({ exists: true, matchType: "name", matches: [target] }) }), "LifecycleContactLookup");
  assert.equal(f.calls.length, 0);
  f.nodes(f.render()).find(n => n.type === "input").props.onChange({ target: { value: "Dips Kang" } });
  await f.nodes(f.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "/api/growth/lifecycle/lookup?q=Dips+Kang&organisationId=tenant-a");
  assert.equal(f.calls[0].options.method, "GET"); assert.equal(f.calls[0].options.credentials, "same-origin");
  const rendered = JSON.stringify(f.render());
  for (const expected of ["identity not verified", "Dips Kang", "linkedin.com/in/dips", "connection", "active", "acceptance", "abc"]) assert.ok(rendered.includes(expected));
  f.nodes(f.render()).find(n => n.type === "input").props.onChange({ target: { value: "Nick" } });
  assert.equal(JSON.stringify(f.render()).includes("Dips Kang"), false);
});

test("shows exact returned errors and handles authorization, malformed responses and network failure without retry", async () => {
  for (const [response, expected] of [
    [{ ok: false, status: 503, json: async () => ({ ...summary, errors: ["Concurrent changes prevented reconciliation; retry later."] }) }, "Concurrent changes prevented reconciliation; retry later."],
    [{ ok: false, status: 403, json: async () => ({ error: "Insufficient organisation role." }) }, "Insufficient organisation role."],
    [{ ok: true, status: 200, json: async () => ({}) }, "Unexpected reconciliation response"],
    [null, "No automatic retry was made"],
  ]) {
    const f = fixture(() => { if (!response) throw Error("network"); return response; });
    await f.button().props.onClick();
    assert.ok(JSON.stringify(f.render()).includes(expected));
    assert.equal(f.calls.length, 1);
    assert.equal(f.button().props.disabled, false);
  }
});
