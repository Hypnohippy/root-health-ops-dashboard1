import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
function load(file, deps = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { module: mod, exports: mod.exports, URL, process: { env: {} }, require: name => { assert.ok(name in deps, name); return deps[name]; }, ...globals });
  return mod.exports;
}
const caps = load("lib/channelCapabilities.ts");
const setup = load("lib/providerSetup.ts", { "@/lib/channelCapabilities": caps });
const config = load("lib/providerSetup.server.ts");
test("all catalog channels have a safe setup journey without invented operational verification", () => {
  for (const c of caps.channelCatalog) {
    const result = setup.buildProviderSetup(c.id, "connected", true);
    assert.ok(result.customerStep && result.limitation && result.recheck && result.fallback);
    assert.match(result.recheck, /Unverified capabilities stay unverified/);
    assert.equal(caps.assessConnectionCapabilities(c.id, "connected").operationallyVerified, false);
  }
  for (const c of ["youtube", "x", "bluesky", "pinterest", "whatsapp", "reddit", "website", "calendar", "outlook"]) {
    assert.equal(setup.buildProviderSetup(c, "not_connected", null).state, "unsupported");
    assert.equal(setup.buildProviderSetup(c, "not_connected", null).canConnect, false);
  }
});
test("configuration, credentials and permissions are distinct and unknown is never ready", () => {
  for (const c of ["facebook", "instagram", "linkedin", "threads", "tiktok"]) {
    for (const absent of [false, null]) { const r = setup.buildProviderSetup(c, "not_connected", absent); assert.equal(r.canConnect, false); assert.equal(r.state, "credentials_required"); }
    assert.equal(setup.buildProviderSetup(c, "not_connected", true).state, "ready_to_connect");
    assert.notEqual(setup.buildProviderSetup(c, "connected", true).state, "ready_to_connect");
    assert.match(setup.buildProviderSetup(c, "expired", true).connected, /reconnect/);
  }
  assert.equal(setup.buildProviderSetup("google", "connected", true).state, "manual_only");
  assert.equal(setup.buildProviderSetup("tiktok", "connected", true).state, "manual_only");
  assert.equal(setup.buildProviderSetup("email", "connected", true).canConnect, false);
});
test("server readiness requires app credentials, callback configuration and OAuth state signing", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://ops.example", LINKEDIN_CLIENT_ID: "PUBLIC-ID", LINKEDIN_CLIENT_SECRET: "SECRET", OAUTH_STATE_SECRET: "x".repeat(32) };
  assert.equal(config.providerConfigured("linkedin", env), true);
  for (const key of Object.keys(env)) assert.equal(config.providerConfigured("linkedin", { ...env, [key]: " " }), false);
  assert.equal(config.providerConfigured("linkedin", { ...env, NEXT_PUBLIC_APP_URL: "https://secret:credential@ops.example" }), false);
  assert.equal(config.providerConfigured("linkedin", { ...env, NEXT_PUBLIC_APP_URL: "" }, "https://ops.example"), true);
  assert.equal(config.providerConfigured("tiktok", env), false);
  assert.equal(config.providerConfigured("email", env), null);
  assert.equal(typeof config.providerConfigured("linkedin", env), "boolean");
});
test("guide exposes plain next steps, manual completion limits and no secret entry", () => {
  const Guide = load("app/dashboard/connect/ProviderSetupGuide.tsx", { react: React, "react/jsx-runtime": jsx, "@/lib/providerSetup": setup }).default;
  const html = renderToStaticMarkup(React.createElement(Guide, { platform: "tiktok", health: { state: "connected", setup: setup.buildProviderSetup("tiktok", "connected", true) }, recheck: async () => {} }));
  for (const label of ["Continue setup", "Already connected", "Open provider", "Recheck setup", "not a published video", "No secret is collected here"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /type="password"|<input/);
});
test("health recheck is tenant scoped, secret free and does not call providers", async () => {
  let reads = 0;
  const q = { select() { return q; }, eq(k, v) { assert.equal(k, "organisation_id"); assert.equal(v, "tenant-a"); return q; }, order: async () => ({ data: [{ platform: "linkedin", is_active: true, page_access_token: "PRIVATE-TOKEN", page_name: "Member", token_expires_at: null }] }) };
  const route = load("app/api/social/connection-health/route.ts", { "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } }, "@/lib/tenantAuth": { requireOrganisation: async requested => { if (requested !== "tenant-a") throw Error("denied"); return { organisationId: requested }; }, accessErrorResponse: e => e.message === "denied" ? { status: 403 } : null }, "@/lib/supabaseAdmin": { supabaseAdmin: { from() { reads++; return q; } } }, "@/lib/channelCapabilities": caps, "@/lib/connectionHealth": load("lib/connectionHealth.ts"), "@/lib/providerSetup": setup, "@/lib/providerSetup.server": config }, { fetch() { throw Error("No provider call expected"); } });
  for (let n = 0; n < 2; n++) { const r = await route.GET({ nextUrl: new URL("https://ops.example/?organisationId=tenant-a") }); assert.equal(r.status, 200); assert.doesNotMatch(JSON.stringify(r), /PRIVATE-TOKEN/); assert.equal(r.body.checkType, "stored_configuration_and_capabilities"); assert.equal(r.headers["Cache-Control"], "private, no-store"); assert.equal(r.body.connections.find(c => c.platform === "linkedin").operationallyVerified, false); }
  assert.equal(reads, 2);
  assert.equal((await route.GET({ nextUrl: new URL("https://ops.example/?organisationId=tenant-b") })).status, 403);
  assert.equal(reads, 2);
});
