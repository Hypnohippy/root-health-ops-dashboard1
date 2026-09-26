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
  assert.equal(caps.assessConnectionCapabilities("tiktok", "connected").capabilities.Publish.state, "manual_completion_required");
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
    const route = load("app/api/social/connection-health/route.ts", { "next/server": server, "@/lib/connectionHealth": health, "@/lib/channelCapabilities": caps, "@/lib/supabaseAdmin": { supabaseAdmin: { from() { reads++; return q; } } }, "@/lib/tenantAuth": { requireOrganisation: async requested => { assert.equal(requested, A); if (!allowed) throw Error("denied"); return { organisationId: A }; }, accessErrorResponse: e => e.message === "denied" ? { status: 403 } : null } }, { fetch() { throw Error("No provider calls permitted"); }, process: { env: { B2B_ENGINE_ENDPOINTS: JSON.stringify([{ organisation_id: A, source_engine: "root_health_b2b", url: "https://engine.example", secret: "PRIVATE-SECRET" }]), GROWTH_INGESTION_KEYS: JSON.stringify([{ organisation_id: A, source_engines: ["root_health_b2b"], secret: "PRIVATE-SECRET" }]) } } });
    const result = await route.GET({ nextUrl: new URL(`https://ops.example/api/social/connection-health?organisationId=${A}`) });
    assert.equal(result.status, allowed ? 200 : 403);
    if (!allowed) { assert.equal(reads, 0); continue; }
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
    const email = result.body.connections.find(c => c.platform === "email");
    assert.equal(email.credentialStatus, "configuration_present"); assert.equal(email.operationallyVerified, false);
  }
});
test("TikTok inbox upload cannot mark a scheduled item posted and a retry reuses the receipt", async () => {
  let uploads = 0, saved;
  const row = { id: "post", organisation_id: A, message: "Draft", platforms: ["tiktok"], status: "scheduled", meta: { video_url: "https://media.example/video.mp4" } };
  const q = { select() { return q; }, eq(k, v) { if (k === "organisation_id") assert.equal(v, A); return q; }, maybeSingle: async () => ({ data: row }), update(value) { saved = value; return q; }, then(resolve) { Object.assign(row, saved); resolve({ error: null }); } };
  const route = load("app/api/publish/now/route.ts", { "next/server": server, "../../../../lib/supabaseAdmin": { supabaseAdmin: { from: () => q } }, "@/lib/tenantAuth": { requirePublishingOrganisation: async () => ({ organisationId: A }), accessErrorResponse: () => null, publishingHeaders: () => ({}) } }, { fetch: async url => { assert.match(url, /\/api\/tiktok\/post$/); uploads++; return { ok: true, status: 200, json: async () => ({ ok: true, publishId: "upload-123", published: false, manualCompletionRequired: true }) }; } });
  const req = { url: `https://ops.example/api/publish/now?organisationId=${A}`, nextUrl: new URL("https://ops.example"), json: async () => ({ id: "post", platforms: ["tiktok"] }) };
  const first = await route.POST(req);
  assert.equal(first.body.success, false); assert.equal(saved.status, "failed"); assert.equal(saved.posted_at, null);
  assert.equal(saved.meta.tiktok_inbox_upload.publishId, "upload-123"); assert.equal(first.body.results[0].manualCompletionRequired, true);
  row.meta.tiktok_inbox_upload.completedPlatforms = ["facebook"];
  const retry = { ...req, json: async () => ({ id: "post", platforms: ["facebook", "tiktok"] }) };
  await route.POST(retry); assert.equal(uploads, 1); assert.match(saved.error_info.error, /no duplicate upload/);
});

test("TikTok reports publication only on a confirmed provider completion status", async () => {
  for (const providerStatus of ["SEND_TO_USER_INBOX", "PROCESSING_UPLOAD", "FAILED", "PUBLISH_COMPLETE"]) {
    const q = { select() { return q; }, eq(k, v) { if (k === "organisation_id") assert.equal(v, A); return q; }, limit() { return q; }, maybeSingle: async () => ({ data: { page_access_token: "TOKEN", meta: {} } }) };
    const route = load("app/api/tiktok/post/route.ts", { "next/server": server, "../../../../lib/supabaseAdmin": { supabaseAdmin: { from: () => q } }, "@/lib/tenantAuth": { requirePublishingOrganisation: async () => ({ organisationId: A }), accessErrorResponse: () => null } }, { fetch: async url => {
      if (url === "https://media.example/video.mp4") return { ok: true, headers: { get: () => "video/mp4" }, arrayBuffer: async () => new ArrayBuffer(4) };
      if (url.endsWith("/inbox/video/init/")) return { ok: true, status: 200, json: async () => ({ data: { publish_id: "upload-id", upload_url: "https://upload.example" } }) };
      if (url === "https://upload.example") return { ok: true, status: 200 };
      assert.ok(url.endsWith("/status/fetch/")); return { ok: true, status: 200, json: async () => ({ error: { code: "ok" }, data: { status: providerStatus } }) };
    } });
    const response = await route.POST({ json: async () => ({ organisationId: A, message: "Caption", videoUrl: "https://media.example/video.mp4" }) });
    assert.equal(response.body.published, providerStatus === "PUBLISH_COMPLETE");
    assert.equal(response.body.postedId, providerStatus === "PUBLISH_COMPLETE" ? "upload-id" : null);
    assert.equal(response.body.publishId, "upload-id");
  }
});
