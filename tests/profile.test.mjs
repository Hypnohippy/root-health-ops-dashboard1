import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const nodeRequire = createRequire(import.meta.url);
function load(file, mocks = {}, env = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(output, { exports: loaded.exports, module: loaded, require: name => name in mocks ? mocks[name] : nodeRequire(name), URL, TextEncoder, Buffer, console, process: { env } }, { filename: file });
  return loaded.exports;
}
const model = load("lib/brandGrowthProfile.ts");
const json = value => JSON.parse(JSON.stringify(value));

test("installed Supabase SSR adapter reads chunked cookies and verifies the user remotely", async () => {
  const { createServerClient, createChunks } = nodeRequire("@supabase/ssr");
  const session = JSON.stringify({ access_token: "fixture-token", refresh_token: "fixture-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "untrusted-cookie-id" } });
  const cookies = new Map(createChunks("sb-fixture-auth-token", session, 50).map(c => [c.name, c.value]));
  let requests = 0;
  const server = load("lib/supabaseServer.ts", {
    "next/headers": { cookies: async () => ({ get: name => cookies.has(name) ? { value: cookies.get(name) } : undefined }) },
    "@supabase/ssr": { createServerClient: (url, key, options) => createServerClient(url, key, {
      ...options, global: { fetch: async (url, options) => {
        requests++;
        assert.ok(String(url).endsWith("/auth/v1/user"));
        assert.equal(new Headers(options.headers).get("authorization"), "Bearer fixture-token");
        return new Response(JSON.stringify({ id: "verified-user", aud: "authenticated" }), { headers: { "Content-Type": "application/json" } });
      } },
    }) },
  }, { NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture" });
  assert.equal(await server.getCurrentUserId(), "verified-user");
  assert.equal(requests, 1);
  cookies.clear();
  assert.equal(await server.getCurrentUserId(), null);
});

test("session proxy forwards refreshed cookie chunks and removals to request and response", async () => {
  function cookieJar() {
    const jar = new Map();
    return { get: name => jar.get(name), getAll: () => [...jar.values()], set(name, value, options) {
      const cookie = typeof name === "object" ? name : { name, value, ...options };
      jar.set(cookie.name, cookie);
    } };
  }
  const request = { cookies: cookieJar() };
  request.cookies.set("session.0", "old");
  const proxy = load("lib/supabaseProxy.ts", {
    "next/server": { NextResponse: { next: () => ({ cookies: cookieJar() }) } },
    "@supabase/ssr": { createServerClient: (_url, _key, { cookies }) => ({ auth: { async getUser() {
      assert.equal(cookies.get("session.0"), "old");
      cookies.set("session.0", "new-first", { sameSite: "lax" });
      cookies.set("session.1", "new-second", { sameSite: "lax" });
      cookies.remove("obsolete", {});
    } } }) },
  }, { NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture" });
  const response = await proxy.updateSession(request);
  for (const name of ["session.0", "session.1"]) {
    assert.equal(response.cookies.get(name).value, request.cookies.get(name).value);
    assert.equal(response.cookies.get(name).path, "/");
  }
  assert.equal(response.cookies.get("obsolete").maxAge, 0);
});

test("profile validates types, URLs, lengths, growth mode and allowed keys", () => {
  for (const value of [null, [], {}, { organisation_id: "foreign" }, { userId: "owner" }, { businessName: 1 }, { businessName: "x".repeat(201) }, { website: "javascript:alert(1)" }, { destinationUrl: "https://user:password@example.com" }, { growthMode: "automatic" }, { logoUrl: "data:image/svg+xml;base64,PHN2Zz4=" }, { contactEmail: "bad" }]) {
    assert.throws(() => model.validateProfilePatch(value), model.ProfileValidationError);
  }
  assert.deepEqual(json(model.validateProfilePatch({ businessName: "  Example Co  ", website: "https://example.com", growthMode: "steady", cta: "" })), { businessName: "Example Co", website: "https://example.com", growthMode: "steady", cta: "" });
});
test("existing branding and empty fields normalize without cross-business defaults", () => {
  const profile = model.normaliseProfile({ website: "javascript:bad", businessName: "", audience: "Local customers" }, { businessName: "Existing brand" });
  assert.equal(profile.businessName, "");
  assert.equal(profile.website, "");
  const context = model.toGenerationProfile({ ...profile, customerProblems: "Time\n\nCost", priorityServices: "Service A\nService B", logoUrl: "private-image-data" });
  assert.deepEqual(json(context.customers.problems), ["Time", "Cost"]);
  assert.equal(JSON.stringify(context).includes("private-image-data"), false);
  assert.equal(/Root Health|therapy|therapist/i.test(JSON.stringify(context)), false);
});
test("legacy import only copies recognised brand fields and validates them", () => {
  const patch = model.legacyBrandPatch({ yourName: "Founder", organisationId: "foreign", businessDescription: "ignore", logoUrl: "data:image/png;base64,aGVsbG8=" });
  assert.deepEqual(Object.keys(patch).sort(), ["logoUrl", "yourName"]);
  assert.throws(() => model.legacyBrandPatch({ logoUrl: "javascript:bad" }));
});

function fixture({ user = "user-a", role = "owner", databaseError = false } = {}) {
  const events = [];
  const profiles = new Map();
  const db = {
    from(table) {
      const filters = {};
      let selected;
      const query = {
        select(columns) { selected = columns; return query; }, eq(k, v) { filters[k] = v; return query; }, limit() { return query; },
        async order() { return { data: [], error: null }; },
        async maybeSingle() {
          events.push({ table, selected, filters: { ...filters } });
          if (databaseError) return { data: null, error: { message: "Database unavailable" } };
          if (table === "organisations" && selected !== "id,name") return { data: null, error: { message: "Only id and name may be queried" } };
          return { data: table === "organisations" ? { id: "org-a", name: "Example organisation" } : profiles.get(filters.organisation_id) || null, error: null };
        },
        then(resolve) { return Promise.resolve({ data: !filters.organisation_id || filters.organisation_id === "org-a" ? [{ organisation_id: "org-a", role }] : [], error: null }).then(resolve); },
      };
      return query;
    },
    async rpc(name, args) {
      events.push({ rpc: name, args });
      profiles.set(args.p_organisation_id, { profile: { ...profiles.get(args.p_organisation_id)?.profile, ...args.p_patch }, updated_at: "2026-09-23T00:00:00Z" });
      return { error: null };
    },
  };
  const response = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } };
  const auth = load("lib/tenantAuth.ts", { "next/server": response, "@/lib/supabaseServer": { getCurrentUserId: async () => user }, "@/lib/supabaseAdmin": { supabaseAdmin: db } });
  const server = load("lib/organisationProfile.server.ts", { "@/lib/tenantAuth": auth, "@/lib/supabaseAdmin": { supabaseAdmin: db }, "@/lib/brandGrowthProfile": model });
  const api = load("app/api/organisation/profile/route.ts", { "next/server": response, "@/lib/tenantAuth": auth, "@/lib/brandGrowthProfile": model, "@/lib/organisationProfile.server": server });
  const req = (org = "org-a", body = { profile: { businessName: "Saved brand" } }) => ({ nextUrl: new URL(`https://example.test?organisationId=${org}`), text: async () => JSON.stringify(body) });
  const socialApi = load("app/api/social-accounts/route.ts", { "next/server": response, "@/lib/tenantAuth": auth, "../../../lib/supabaseAdmin": { supabaseAdmin: db } });
  return { api, req, events, server, socialApi };
}
test("profile loads with only organisation id/name and uses canonical profile branding", async () => {
  const f = fixture();
  const initial = await f.api.GET(f.req());
  assert.equal(initial.status, 200);
  assert.equal(initial.body.profile.businessName, "Example organisation");
  const social = await f.socialApi.GET(f.req());
  assert.equal(social.status, 200);
  assert.equal(social.body.organisation.name, "Example organisation");
  for (const key of ["logoUrl", "website", "brandTone"]) assert.equal(initial.body.profile[key], "");
  const profile = { businessName: "Saved business", logoUrl: "https://example.com/logo.png", website: "https://example.com", brandTone: "Friendly" };
  assert.equal((await f.api.PATCH(f.req("org-a", { profile }))).status, 200);
  const saved = await f.api.GET(f.req());
  assert.equal(saved.status, 200);
  for (const [key, value] of Object.entries(profile)) assert.equal(saved.body.profile[key], value);
  assert.ok(f.events.filter(e => e.table === "organisations").every(e => e.selected === "id,name" && e.filters.id === "org-a"));
});

test("profile GET/PATCH deny anonymous and foreign-tenant requests before profile access", async () => {
  for (const [settings, org, status] of [[{ user: null }, "org-a", 401], [{}, "org-b", 403]]) {
    const f = fixture(settings);
    assert.equal((await f.api.GET(f.req(org))).status, status);
    assert.equal((await f.api.PATCH(f.req(org))).status, status);
    assert.equal(f.events.length, 0);
  }
});
test("viewers may read but cannot save, and permissions are included for the editor", async () => {
  const f = fixture({ role: "viewer" });
  const result = await f.api.GET(f.req());
  assert.equal(result.body.canEdit, false);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal((await f.api.PATCH(f.req())).status, 403);
  assert.equal(f.events.some(e => e.rpc), false);
});
test("profile save/reload retains all fields, scopes queries, and cannot overwrite tenant identity", async () => {
  const f = fixture();
  const fields = { ...model.emptyProfile, businessName: "Independent bakery", businessDescription: "Fresh bread", audience: "Local families", growthMode: "expand", cta: "Visit the shop" };
  assert.equal((await f.api.PATCH(f.req("org-a", { profile: fields }))).status, 200);
  await f.api.PATCH(f.req("org-a", { profile: { yourName: "Alex" } }));
  const result = await f.api.GET(f.req());
  assert.equal(result.body.profile.businessDescription, "Fresh bread");
  assert.equal(result.body.profile.yourName, "Alex");
  assert.equal(result.body.brandPrimaryColor, "#10b981");
  assert.ok(f.events.filter(e => e.table === "organisation_profiles").every(e => e.filters.organisation_id === "org-a"));
  assert.equal((await f.api.PATCH(f.req("org-a", { profile: { organisation_id: "org-b" } }))).status, 400);
  assert.equal((await f.api.PATCH(f.req("org-a", { organisationId: "org-b", profile: { cta: "bad" } }))).status, 400);
  const context = await f.server.getOrganisationGenerationProfile("org-a");
  assert.equal(context.organisationId, "org-a");
  assert.equal(context.business.name, "Independent bakery");
});
test("malformed JSON, oversized bodies, database failures and unavailable migration fail clearly", async () => {
  const f = fixture();
  assert.equal((await f.api.PATCH({ ...f.req(), text: async () => "{" })).status, 400);
  assert.equal((await f.api.PATCH({ ...f.req(), text: async () => "a".repeat(1024 * 1024 + 1) })).status, 413);
  const unavailable = fixture({ databaseError: true });
  assert.equal((await unavailable.api.GET(unavailable.req())).status, 503);
});

test("SQL migration enforces RLS, role grants, atomic patch merging and organisation ownership", async () => {
  const db = new PGlite();
  const orgA = "11111111-1111-4111-8111-111111111111", orgB = "22222222-2222-4222-8222-222222222222";
  const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.organisations (id uuid primary key);
      create table public.organisation_members (organisation_id uuid, user_id uuid, role text);
      grant usage on schema public, auth to authenticated, service_role;
      grant select on public.organisation_members to authenticated, service_role;
      grant all on auth.users, public.organisations to service_role;
      insert into auth.users values ('${userA}'), ('${userB}');
      insert into public.organisations values ('${orgA}'), ('${orgB}');
      insert into public.organisation_members values ('${orgA}', '${userA}', 'owner'), ('${orgB}', '${userB}', 'viewer');
    `);
    await db.exec(fs.readFileSync("supabase/migrations/20260923090000_organisation_profiles.sql", "utf8"));
    await db.exec("set role service_role");
    const save = (org, patch, user) => db.query("select public.merge_organisation_profile($1, $2::jsonb, $3)", [org, JSON.stringify(patch), user]);
    await save(orgA, { businessName: "A", audience: "Families" }, userA);
    await save(orgA, { cta: "Book" }, userA);
    const saved = (await db.query("select profile from public.organisation_profiles where organisation_id=$1", [orgA])).rows[0].profile;
    assert.deepEqual(saved, { businessName: "A", audience: "Families", cta: "Book" });
    await assert.rejects(save(orgB, { businessName: "Cross-tenant" }, userA), /Insufficient organisation role/);
    await assert.rejects(save(orgB, { businessName: "Viewer" }, userB), /Insufficient organisation role/);
    await save(orgA, { cta: "" }, userA);
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
    assert.equal((await db.query("select * from public.organisation_profiles")).rows.length, 1);
    await assert.rejects(save(orgA, { cta: "Bypass" }, userA), /permission denied/);
    await assert.rejects(db.query("update public.organisation_profiles set profile='{}'"), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
    assert.equal((await db.query("select * from public.organisation_profiles")).rows.length, 0);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from public.organisation_profiles"), /permission denied/);
  } finally { await db.close(); }
});
