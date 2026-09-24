import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const localRequire = createRequire(import.meta.url);

function loadTs(file) {
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const coverage = loadTs("lib/linkedinActivityCoverage.ts");

test("current LinkedIn scopes do not claim relationship-event read access", () => {
  const summary = coverage.linkedinActivityCoverageSummary();
  assert.deepEqual(Array.from(summary.currentScopes), ["openid", "profile", "email", "w_member_social"]);
  assert.equal(summary.hasRelationshipEventCoverage, false);
  assert.equal(summary.capabilities.every(item => item.availableWithCurrentAccess === false), true);
});

test("every requested event is classified with a safe fallback", () => {
  const summary = coverage.linkedinActivityCoverageSummary();
  assert.deepEqual(Array.from(summary.capabilities, item => item.event), [
    "accepted_connection_invitations", "accepted_follow_invitations", "new_followers", "profile_follows",
    "direct_messages", "comments_replies", "connection_requests_received", "reactions",
  ]);
  assert.equal(summary.capabilities.every(item => ["A", "B", "C"].includes(item.classification) && item.fallback), true);
});

test("accepted invitation reconciliation is explicitly blocked on partner approval", () => {
  const reconciliation = coverage.linkedinActivityCoverageSummary().acceptedInvitationReconciliation;
  assert.equal(reconciliation.availableWithCurrentAccess, false);
  assert.equal(reconciliation.classification, "B");
  assert.match(reconciliation.endpoint, /states=ACCEPTED/);
  assert.match(reconciliation.requiredAccess, /partner approval/i);
});

test("coverage API is tenant authorized and never returns access tokens", () => {
  const route = fs.readFileSync("app/api/linkedin/activity-coverage/route.ts", "utf8");
  assert.match(route, /requireOrganisation/);
  assert.doesNotMatch(route, /page_access_token|client_secret|LINKEDIN_CLIENT_SECRET/);
});

test("manual response pull enforces tenant write access and reports LinkedIn approval boundary", () => {
  const route = fs.readFileSync("app/api/responses/pull/route.ts", "utf8");
  assert.match(route, /requireOrganisation\(requestedOrganisationId, true\)/);
  assert.match(route, /additional_linkedin_approval_required/);
  assert.match(route, /linkedinActivityCoverageSummary/);
});

test("audit forbids scraping and preserves human-reviewed messaging", () => {
  const doc = fs.readFileSync("docs/phase-4k-linkedin-activity-coverage.md", "utf8");
  assert.match(doc, /No unsupported polling, browser scraping, notification scraping/);
  assert.match(doc, /human-reviewed Copy\/Open LinkedIn/);
  assert.match(doc, /current app does not have that permission/i);
});
