import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, deps = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, URL, URLSearchParams, console, require: name => { assert.ok(name in deps, name); return deps[name]; }, ...globals });
  return mod.exports;
}
const caps = load("lib/channelCapabilities.ts");
const engine = load("lib/socialCommentOpportunity.ts", { "@/lib/channelCapabilities": caps });
const profile = { business: { description: "Training for independent cafe owners" }, customers: { audience: "cafe owners", problems: ["staff retention"], desiredOutcomes: [], questions: [] }, offer: { primary: "staff training", priorityServices: [] }, voice: { excludedTopics: [] }, growthMode: "steady" };
const item = { id: "a", organisation_id: "tenant-a", platform: "facebook", kind: "comment", external_id: "comment1", post_id: "post1", status: "needs_reply", text: "How do cafe owners improve staff retention?", post_text: "Practical training", permalink: "https://www.facebook.com/example/posts/123", raw: { id: "comment1", _rootops_source: "official_comment_pull" } };
const lifecycle = { canDraft: true, currentStage: "needs_reply" };
const assess = (row = item, p = profile, state = lifecycle, siblings = [], safety = {}) => engine.socialCommentOpportunity(row, p, state, "connected", siblings, safety);
test("official public comments use explicit profile fit and retain conversation evidence", () => {
  for (const platform of ["facebook", "instagram"]) {
    const r = assess({ ...item, platform, permalink: platform === "instagram" ? "https://instagram.com/p/post1/" : item.permalink });
    assert.equal(r.eligible, true); assert.equal(r.route, "manual_action"); assert.equal(r.fallbackKind, "missing_capability");
    assert.equal(r.conversation, item.text); assert.ok(r.evidence.matchedProfileTerms.includes("retention"));
  }
  assert.equal(assess({ ...item, text: "Nice photo", post_text: "" }).eligible, false);
});
test("capability route requires both verified operation and available reply; native-only remains distinct", () => {
  assert.equal(engine.publicReplyRoute(true, { state: "available" }, true).route, "approved_reply");
  assert.equal(engine.publicReplyRoute(true, { state: "available" }, false).route, "manual_action");
  assert.equal(engine.publicReplyRoute(true, { state: "not_implemented" }, false).fallbackKind, "manual_by_design");
  assert.equal(engine.publicReplyRoute(false, { state: "available" }, true).fallbackKind, "human_review");
});
test("Personal and health context fail closed on every required safety field", () => {
  const p = { ...profile, business: { description: "Health staff training" } };
  const safety = { public_context: true, consumer_outreach: false, health_targeting: false, verified_direct_discussion: true };
  assert.equal(assess(item, p).eligible, false);
  for (const key of Object.keys(safety)) { const incomplete = { ...safety }; delete incomplete[key]; assert.equal(assess(item, p, lifecycle, [], incomplete).eligible, false); }
  assert.equal(assess(item, p, lifecycle, [], safety).eligible, true);
  assert.equal(assess({ ...item, text: "How can cafe owners treat my depression?" }, p, lifecycle, [], safety).eligible, false);
  assert.equal(assess(item, { ...profile, voice: { excludedTopics: ["retention"] } }).eligible, false);
});
test("DMs, unverifiable sources, consumer outreach and unsafe drafts cannot become opportunities", () => {
  for (const patch of [{ kind: "dm" }, { raw: {} }, { permalink: "https://facebook.com/profile" }, { permalink: "https://facebook.com.evil.test/example/posts/1" }, { platform: "linkedin" }]) assert.equal(assess({ ...item, ...patch }).eligible, false);
  assert.equal(assess({ ...item, source_engine: "root_health_personal" }, profile, lifecycle, [], { public_context: true, consumer_outreach: true, health_targeting: false, verified_direct_discussion: true }).eligible, false);
  for (const draft of ["DM us for help", "Send a private message", "DM me for help", "You have depression", "Book now", "Try https://example.com"]) assert.equal(engine.safePublicDraft(draft), false);
  assert.equal(engine.safePublicDraft("Which part of staff onboarding is hardest to keep consistent?"), true);
});
test("thread dedupe preserves handled state, current lifecycle and tenant boundaries", () => {
  const second = { ...item, id: "b", external_id: "comment2", raw: { ...item.raw, id: "comment2" } };
  assert.equal(assess(second, profile, lifecycle, [item, second]).eligible, false);
  assert.equal(assess(second, profile, lifecycle, [{ ...item, status: "replied" }, second]).eligible, false);
  assert.equal(assess(second, profile, lifecycle, [{ ...item, status: "replied", organisation_id: "tenant-b" }, second]).eligible, true);
  for (const patch of [{ status: "replied" }, { status: "archived" }, { last_reply_text: "Already replied" }]) assert.equal(assess({ ...item, ...patch }).eligible, false);
  assert.equal(assess(item, profile, { canDraft: false, currentStage: "lost" }).eligible, false);
});
test("official polling uses tenant-keyed insert-only dedupe so handled comments cannot resurrect", async () => {
  const records = new Map([["comment1", { status: "replied", raw: { preserved: true } }]]);
  let optionsSeen;
  const q = { select() { return q; }, eq(key, value) { if (key === "organisation_id") assert.equal(value, "tenant-a"); return q; }, then(resolve) { resolve({ data: [{ platform: "instagram", page_id: "ig", page_access_token: "secret" }] }); }, upsert(rows, options) { optionsSeen = options; for (const row of rows) { assert.equal(row.organisation_id, "tenant-a"); if (!records.has(row.external_id)) records.set(row.external_id, row); } return Promise.resolve({ error: null }); } };
  const route = load("app/api/responses/pull/route.ts", { "next/server": { NextResponse: { json: body => body } }, "../../../../lib/supabaseAdmin": { supabaseAdmin: { from: () => q } }, "@/lib/linkedinActivityCoverage": {}, "@/lib/tenantAuth": { requireOrganisation: async () => ({ organisationId: "tenant-a" }), accessErrorResponse: () => null } }, { fetch: async url => ({ ok: true, json: async () => ({ data: url.includes("/media?") ? [{ id: "post1", permalink: "https://instagram.com/p/post1/" }] : [{ id: "comment1", text: "old" }, { id: "comment2", text: "new" }] }) }) });
  for (let i = 0; i < 2; i++) await route.POST({ json: async () => ({ organisationId: "tenant-a" }) });
  assert.equal(optionsSeen.ignoreDuplicates, true); assert.equal(optionsSeen.onConflict, "organisation_id,platform,external_id");
  assert.equal(records.size, 2); assert.equal(records.get("comment1").status, "replied"); assert.equal(records.get("comment2").raw._rootops_source, "official_comment_pull");
});
test("reply endpoint rejects missing capability and cross-tenant requests before any provider action", async () => {
  for (const denied of [false, true]) {
    let reads = 0;
    const q = { select() { return q; }, eq(key, value) { if (key === "organisation_id") assert.equal(value, "tenant-a"); return q; }, maybeSingle: async () => ({ data: { id: "a" } }) };
    const route = load("app/api/responses/reply/route.ts", { "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } }, "../../../../lib/supabaseAdmin": { supabaseAdmin: { from() { reads++; return q; } } }, "@/lib/tenantAuth": { requireOrganisation: async () => { if (denied) throw Error("denied"); return { organisationId: "tenant-a" }; }, accessErrorResponse: e => e.message === "denied" ? { status: 403 } : null }, "@/lib/organisationProfile.server": { getOrganisationGenerationProfile: async () => profile }, "@/lib/responseContactContext.server": { getResponseContactContext: async () => ({ lifecycle, socialOpportunity: assess() }) }, "@/lib/socialCommentOpportunity": engine }, { fetch: () => { throw Error("No send permitted"); } });
    assert.equal((await route.POST({ json: async () => ({ organisationId: "tenant-a", platform: "facebook", externalId: "comment1", message: "Which onboarding step needs attention?" }) })).status, denied ? 403 : 409);
    if (denied) assert.equal(reads, 0);
  }
});

test("AI uses public evidence, rejects unsafe output and rechecks eligibility without sending", async () => {
  for (const mode of ["safe", "unsafe", "changed", "blocked"]) {
    let reads = 0, calls = 0;
    const opportunity = assess();
    const route = load("app/api/ai/root-coach/route.ts", {
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
      "@/lib/tenantRoute.server": { withTenantRoute: fn => req => fn(req, { organisationId: "tenant-a", profile, messages: [] }) },
      "@/lib/responseContactContext.server": { getResponseContactContext: async org => { assert.equal(org, "tenant-a"); reads++; return { lifecycle, socialOpportunity: { ...opportunity, eligible: mode !== "blocked" && !(mode === "changed" && reads > 1) } }; } },
      "@/lib/responseContactContext": { responseDraftRules: () => [] },
      "@/lib/socialCommentOpportunity": engine,
    }, { process: { env: { OPENAI_API_KEY: "fixture" } }, fetch: async (url, options) => { calls++; assert.equal(url, "https://api.openai.com/v1/chat/completions"); const prompt = JSON.parse(options.body); assert.match(prompt.messages.find(m => m.role === "system").content, /No CV recital/); assert.match(JSON.stringify(prompt), /cafe owners improve staff retention/); return { ok: true, json: async () => ({ choices: [{ message: { content: mode === "unsafe" ? "DM me for help" : "Which part of onboarding is hardest to keep consistent?" } }] }) }; } });
    const result = await route.POST({ json: async () => ({ context: "responses_lifecycle_draft_v1", inboxItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) });
    assert.equal(result.status, mode === "safe" ? 200 : 409); assert.equal(calls, mode === "blocked" ? 0 : 1);
  }
});
