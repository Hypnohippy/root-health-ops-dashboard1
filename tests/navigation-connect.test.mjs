import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, require() { throw new Error("Unexpected import"); } }, { filename: file });
  return mod.exports;
}

test("dashboard exposes the permanent primary journeys in the requested order", () => {
  const source = fs.readFileSync("app/dashboard/ClientDashboardLayout.tsx", "utf8");
  const labels = ["Home", "Acquisition", "Responses", "Campaign Studio", "Brainstorm", "Publishing", "Growth Lab", "Resources", "Connect"];
  let cursor = -1;
  for (const label of labels) {
    const next = source.indexOf(`label: \"${label}\"`);
    assert.ok(next > cursor, `${label} should appear in navigation order`);
    cursor = next;
  }
  assert.match(source, /hidden flex-wrap items-center gap-2 md:flex/);
  assert.match(source, /group md:hidden/);
  assert.match(source, /badge\?: string \| number/);
  assert.doesNotMatch(source, /badge:\s*["']?\d/);
});

test("capability catalog tells the truth about implemented and provider-gated channels", () => {
  const { channelCatalog } = load("lib/channelCapabilities.ts");
  const channels = Object.fromEntries(channelCatalog.map((item) => [item.id, item]));
  assert.equal(channels.facebook.capabilities.Reply, "available");
  assert.equal(channels.instagram.capabilities.Publish, "limited");
  assert.equal(channels.linkedin.capabilities.Reply, "unavailable");
  assert.equal(channels.threads.capabilities["Pull responses"], "unavailable");
  assert.equal(channels.tiktok.statusMode, "provider_approval");
  assert.equal(channels.google.capabilities.Publish, "unavailable");
  assert.equal(channels.email.statusMode, "managed_setup");
  assert.equal(channels.email.capabilities["Direct outreach"], "available");
  for (const id of ["youtube", "reddit", "x", "bluesky", "pinterest", "whatsapp", "outlook", "website", "crm", "calendar"])
    assert.ok(channels[id], `${id} should be represented`);
});

test("Connect uses organisation-scoped health and does not invent setup links", () => {
  const source = fs.readFileSync("app/dashboard/connect/page.tsx", "utf8");
  assert.match(source, /\/api\/social\/connection-health/);
  assert.match(source, /channelCatalog/);
  assert.match(source, /Available soon/);
  assert.doesNotMatch(source, /href=["']#["']/);
  assert.doesNotMatch(source, /localStorage/);
});
