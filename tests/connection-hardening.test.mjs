import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, deps = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, URL, URLSearchParams, process: { env: {} }, console, require: name => { assert.ok(name in deps, name); return deps[name]; }, ...globals });
  return mod.exports;
}
const caps = load("lib/channelCapabilities.ts");
test("unknown and recorded expiry never establish operational validity", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  for (const [expiry, expected, reconnect] of [[null, "unknown", false], ["invalid", "invalid", true], ["2026-09-25", "expired", true], ["2026-09-27", "recorded_future", false]]) {
    const result = caps.assessConnectionCapabilities("facebook", "connected", expiry, now);
    assert.equal(result.expiryStatus, expected);
    assert.equal(result.reconnectRequired, reconnect);
    assert.equal(result.operationallyVerified, false);
    assert.equal(result.capabilities.Publish.state, reconnect ? "reconnect_required" : "not_verified");
  }
  assert.match(caps.assessConnectionCapabilities("facebook", "connected").expiryExplanation, /does not mean.*never expires/);
  assert.equal(caps.assessConnectionCapabilities("email", "connected").expiryStatus, "managed_by_engine");
  assert.equal(caps.assessConnectionCapabilities("facebook", "not_connected").expiryStatus, "not_applicable");
});
const health = load("lib/connectionHealth.ts");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const server = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
test("credential presence cannot establish a supported channel's operational capability", () => {
  for (const platform of ["facebook", "instagram", "linkedin", "threads", "tiktok", "google", "email"]) {
    const result = caps.assessConnectionCapabilities(platform, "connected");
    assert.equal(result.operationallyVerified, false);
    assert.ok(Object.values(result.capabilities).every(c => c.state !== "available"));
  }
  assert.equal(caps.assessConnectionCapabilities("facebook", "connected").capabilities.Reply.state, "not_verified");
  assert.equal(caps.assessConnectionCapabilities("instagram", "connected").capabilities.Reply.state, "not_verified");
  assert.equal(caps.assessConnectionCapabilities("linkedin", "connected").capabilities["Pull responses"].state, "provider_approval_required");
  assert.equal(caps.assessConnectionCapabilities("google", "connected").capabilities.Publish.state, "not_implemented");
  assert.equal(caps.assessConnectionCapabilities("email", "connected").credentialStatus, "configuration_present");
  assert.equal(caps.assessConnectionCapabilities("tiktok", "connected").capabilities.Publish.state, "not_verified");
});
test("expired credentials require reconnect while unsupported adapters stay unavailable", () => {
  for (const state of ["expired", "reconnect_required"]) {
    const result = caps.assessConnectionCapabilities("instagram", state);
    assert.equal(result.reconnectRequired, true); assert.equal(result.capabilities.Publish.state, "reconnect_required");
  }
  assert.equal(caps.assessConnectionCapabilities("threads", "not_connected").capabilities.Publish.state, "not_connected");
  assert.equal(caps.assessConnectionCapabilities("threads", "connected").capabilities.Reply.state, "not_implemented");
});
test("health API retains tenant authorization, with no provider calls or secret leakage", async () => {
  for (const allowed of [true, false]) {
    let reads = 0;
    const q = { select() { return q; }, eq(k, v) { assert.equal(k, "organisation_id"); assert.equal(v, A); return q; }, order: async () => ({ data: [{ platform: "facebook", is_active: true, page_access_token: "PRIVATE-TOKEN", token_expires_at: null, page_name: "Page" }] }) };
    const route = load("app/api/social/connection-health/route.ts", { "next/server": server, "@/lib/connectionHealth": health, "@/lib/channelCapabilities": caps, "@/lib/providerSetup": load("lib/providerSetup.ts", { "@/lib/channelCapabilities": caps }), "@/lib/providerSetup.server": load("lib/providerSetup.server.ts"), "@/lib/supabaseAdmin": { supabaseAdmin: { from() { reads++; return q; } } }, "@/lib/tenantAuth": { requireOrganisation: async requested => { assert.equal(requested, A); if (!allowed) throw Error("denied"); return { organisationId: A }; }, accessErrorResponse: e => e.message === "denied" ? { status: 403 } : null } }, { fetch() { throw Error("No provider calls permitted"); }, process: { env: { B2B_ENGINE_ENDPOINTS: JSON.stringify([{ organisation_id: A, source_engine: "root_health_b2b", url: "https://engine.example", secret: "PRIVATE-SECRET" }]), GROWTH_INGESTION_KEYS: JSON.stringify([{ organisation_id: A, source_engines: ["root_health_b2b"], secret: "PRIVATE-SECRET" }]) } } });
    const result = await route.GET({ nextUrl: new URL(`https://ops.example/api/social/connection-health?organisationId=${A}`) });
    assert.equal(result.status, allowed ? 200 : 403);
    if (!allowed) { assert.equal(reads, 0); continue; }
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
    assert.equal(result.body.connections.find(c => c.platform === "facebook").expiryStatus, "unknown");
    const email = result.body.connections.find(c => c.platform === "email");
    assert.equal(email.credentialStatus, "configuration_present"); assert.equal(email.operationallyVerified, false);
  }
});
test("TikTok outcomes distinguish explicit inbox handoff from Direct Post processing", () => {
  const model = load("lib/tiktokPosting.ts");
  const draft = model.tikTokOutcome({status:"SEND_TO_USER_INBOX"},"draft");
  assert.equal(draft.published,false); assert.equal(draft.manualCompletionRequired,true);
  const direct = model.tikTokOutcome({status:"PROCESSING_UPLOAD"},"direct");
  assert.equal(direct.published,false); assert.equal(direct.manualCompletionRequired,false); assert.equal(direct.pending,true);
});

test("TikTok publish ID never substitutes for an actual provider post ID", () => {
  const model = load("lib/tiktokPosting.ts");
  const complete = model.tikTokOutcome({status:"PUBLISH_COMPLETE"},"direct");
  assert.equal(complete.published,true); assert.equal(complete.postedId,null);
  assert.equal(model.tikTokOutcome({status:"PUBLISH_COMPLETE",publicaly_available_post_id:["actual-post"]},"direct").postedId,"actual-post");
});
