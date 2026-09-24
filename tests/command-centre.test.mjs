import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, require: (id) => id.includes("growthOutreach") ? { isGrowthTargetDue: (t, now) => t.stage === "connection" || (now - Date.parse(t.last_action_at)) / 86400000 >= 3 } : {} }, { filename: file });
  return mod.exports;
}

test("command centre classifies due, waiting and commercial outcomes without combining them", () => {
  const { growthAttentionCounts } = load("lib/commandCentre.ts");
  const counts = growthAttentionCounts([
    { stage: "connection", status: "active" },
    { stage: "day3_dm", status: "active", last_action_at: "2026-09-23T12:00:00Z" },
    { stage: "parked", status: "active", reply_status: "interested" },
    { stage: "parked", status: "active", deal_stage: "won" },
  ], Date.parse("2026-09-24T12:00:00Z"));
  assert.deepEqual({ ...counts }, { followupsDue: 1, waiting: 1, warmOpportunities: 1, meetingsOrConversions: 1 });
});

test("Home loads tenant-scoped live counts and links to filtered work", () => {
  const home = fs.readFileSync("app/dashboard/page.tsx", "utf8");
  const api = fs.readFileSync("app/api/home/attention/route.ts", "utf8");
  assert.match(home, /api\/home\/attention/);
  assert.match(home, /responses\?platform=linkedin&kind=connection_accepted&status=needs_reply/);
  assert.match(home, /acquisition\?status=new/);
  assert.match(api, /requireOrganisation/);
  for (const table of ["acquisition_items", "inbox_items", "growth_targets", "scheduled_posts", "social_accounts"]) assert.match(api, new RegExp(table));
});

test("Quick Blast remains available under Publishing and navigation exposes the operational model", () => {
  const publishing = fs.readFileSync("app/dashboard/publishing/page.tsx", "utf8");
  const nav = fs.readFileSync("app/dashboard/ClientDashboardLayout.tsx", "utf8");
  assert.match(publishing, /Quick Blast/);
  for (const label of ["Acquisition", "Responses", "Campaigns", "Publishing", "Growth", "Resources", "Connect"]) assert.match(nav, new RegExp(`label: "${label}"`));
});

test("LinkedIn Gmail worker is isolated, retryable and never sends email or LinkedIn messages", () => {
  const script = fs.readFileSync("docs/b2b-phase4d-apps-script.gs", "utf8");
  const worker = script.slice(script.indexOf("const LINKEDIN_ACCEPTANCE_OPS_URL_"));
  assert.match(worker, /api\/growth\/linkedin-connections\/ingest/);
  assert.match(worker, /OPS_ORGANISATION_ID/);
  assert.match(worker, /OPS_INGESTION_SECRET/);
  assert.match(worker, /addLabel/);
  assert.doesNotMatch(worker, /GmailApp\.sendEmail|sendMessage\(|rootSendEmailV63_/);
});
