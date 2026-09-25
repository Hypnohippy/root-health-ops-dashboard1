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
function fixture(fetchResponse) {
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
  const Control = load("app/dashboard/growth/LifecycleReconciliationControl.tsx", { react, "react/jsx-runtime": jsx, "@/lib/tenantFetch": tenant }).default;
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
