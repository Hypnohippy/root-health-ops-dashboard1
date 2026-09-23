import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function load(file, mocks = {}, env = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(output, {
    module: loadedModule, exports: loadedModule.exports, require: name => name in mocks ? mocks[name] : nodeRequire(name),
    process: { env }, Buffer, Date, URL, URLSearchParams, console: mocks.__console || console,
    fetch: mocks.__fetch || (() => { throw new Error("Unexpected provider request"); }),
  }, { filename: file });
  return loadedModule.exports;
}
const responseMock = { NextResponse: {
  json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }),
  redirect: url => ({ redirect: String(url), status: 302 }),
} };
function fixture({ user = "user-a", memberships = [{ organisation_id: "org-a", role: "owner" }], error = null } = {}) {
  const calls = [];
  const db = { from(table) {
    calls.push({ table });
    const filters = {};
    const query = {
      select() { return query; },
      eq(key, value) { filters[key] = value; calls.push({ key, value }); return query; },
      limit() { return query; },
      then(resolve) { return Promise.resolve({
        data: memberships.filter(m => !filters.organisation_id || m.organisation_id === filters.organisation_id), error,
      }).then(resolve); },
    };
    return query;
  } };
  const env = {};
  const auth = load("lib/tenantAuth.ts", {
    "next/server": responseMock,
    "@/lib/supabaseServer": { getCurrentUserId: async () => user },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
  }, env);
  return { auth, calls, env };
}

test("anonymous requests are rejected before querying data", async () => {
  const { auth, calls } = fixture({ user: null });
  await assert.rejects(auth.requireOrganisation("org-a"), e => e.status === 401);
  assert.equal(calls.length, 0);
});
test("a supplied foreign organisation is rejected", async () => {
  const { auth, calls } = fixture();
  await assert.rejects(auth.requireOrganisation("org-b"), e => e.status === 403);
  assert.ok(calls.some(c => c.key === "user_id" && c.value === "user-a"));
});
test("membership failure fails closed", async () => {
  await assert.rejects(fixture({ error: { message: "offline" } }).auth.requireOrganisation("org-a"), e => e.status === 503);
});
test("multiple memberships require explicit selection", async () => {
  const { auth } = fixture({ memberships: [{ organisation_id: "org-a", role: "owner" }, { organisation_id: "org-b", role: "admin" }] });
  await assert.rejects(auth.requireOrganisation(), e => e.status === 400);
  assert.equal((await auth.requireOrganisation("org-b")).organisationId, "org-b");
});
test("read-only members cannot publish or manage connections", async () => {
  for (const role of ["viewer", "member", "", null]) {
    const { auth } = fixture({ memberships: [{ organisation_id: "org-a", role }] });
    await assert.rejects(auth.requireOrganisation("org-a"), e => e.status === 403);
    assert.equal((await auth.requireOrganisation("org-a", false)).organisationId, "org-a");
  }
  for (const role of ["owner", "admin", "manager"]) {
    assert.equal((await fixture({ memberships: [{ organisation_id: "org-a", role }] }).auth.requireOrganisation()).organisationId, "org-a");
  }
});
test("cron authorization requires a configured matching secret, including development", async () => {
  const { auth, env } = fixture({ user: null });
  const req = token => ({ headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}) });
  assert.equal(auth.isCronAuthorized(req()), false);
  assert.equal(auth.isCronAuthorized(req("undefined")), false);
  env.CRON_SECRET = "test-secret";
  assert.equal(auth.isCronAuthorized(req("wrong")), false);
  assert.equal(auth.isCronAuthorized(req("test-secret")), true);
  await assert.rejects(auth.requirePublishingOrganisation(req("wrong"), "org-a"), e => e.status === 401);
  await assert.rejects(auth.requirePublishingOrganisation(req("test-secret"), ""), e => e.status === 400);
  assert.equal((await auth.requirePublishingOrganisation(req("test-secret"), "org-a")).organisationId, "org-a");
});

function oauthFixture() {
  const jar = new Map();
  const env = { OAUTH_STATE_SECRET: "test-state-secret-with-at-least-32-characters", NODE_ENV: "production" };
  let userId = "user-a", revoked = false;
  const { auth } = fixture();
  const oauth = load("lib/oauthState.ts", {
    "next/headers": { cookies: async () => ({
      set: (key, value, options) => jar.set(key, { value, options }), get: key => jar.get(key), delete: key => jar.delete(key),
    }) },
    "@/lib/tenantAuth": { AccessError: auth.AccessError, requireOrganisation: async organisationId => {
      if (revoked) throw new auth.AccessError("Membership revoked");
      return { userId, organisationId: organisationId || "org-a" };
    } },
  }, env);
  return { oauth, jar, env, setUser: value => { userId = value; }, revoke: () => { revoked = true; } };
}
test("OAuth state binds provider, user, organisation and a consumed HttpOnly browser nonce", async () => {
  const f = oauthFixture();
  const state = await f.oauth.createOAuthState("threads", "org-a");
  assert.equal(f.jar.get("oauth_threads_nonce").options.httpOnly, true);
  assert.equal(f.jar.get("oauth_threads_nonce").options.secure, true);
  assert.equal((await f.oauth.consumeOAuthState("threads", state)).organisationId, "org-a");
  await assert.rejects(f.oauth.consumeOAuthState("threads", state));
});
test("unsigned, tampered, wrong-provider and wrong-browser OAuth state is rejected", async () => {
  const f = oauthFixture();
  const state = await f.oauth.createOAuthState("tiktok", "org-a");
  const body = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString());
  body.organisationId = "org-b";
  await assert.rejects(f.oauth.consumeOAuthState("tiktok", Buffer.from(JSON.stringify(body)).toString("base64url") + "." + state.split(".")[1]));
  await assert.rejects(f.oauth.consumeOAuthState("tiktok", JSON.stringify(body)));
  await assert.rejects(f.oauth.consumeOAuthState("google", state));
  f.jar.clear();
  await assert.rejects(f.oauth.consumeOAuthState("tiktok", state));
});
test("OAuth rejects changed users, revoked membership and missing signing secrets", async () => {
  for (const change of [f => f.setUser("user-b"), f => f.revoke()]) {
    const f = oauthFixture();
    const state = await f.oauth.createOAuthState("linkedin", "org-a");
    change(f);
    await assert.rejects(f.oauth.consumeOAuthState("linkedin", state));
  }
  const f = oauthFixture(); delete f.env.OAUTH_STATE_SECRET;
  await assert.rejects(f.oauth.createOAuthState("google", "org-a"));
});
test("OAuth rejects validly signed expired and future-dated state", async () => {
  const { createHmac } = await import("node:crypto");
  for (const issuedAt of [Date.now() - 11 * 60 * 1000, Date.now() + 60000]) {
    const f = oauthFixture();
    const original = await f.oauth.createOAuthState("threads", "org-a");
    const value = JSON.parse(Buffer.from(original.split(".")[0], "base64url").toString());
    const body = Buffer.from(JSON.stringify({ ...value, issuedAt })).toString("base64url");
    const state = body + "." + createHmac("sha256", f.env.OAUTH_STATE_SECRET).update(body).digest("base64url");
    await assert.rejects(f.oauth.consumeOAuthState("threads", state));
  }
});
test("connection health distinguishes states and never serializes tokens", () => {
  const health = load("lib/connectionHealth.ts");
  const account = { platform: "threads", is_active: true, page_access_token: "secret-token", page_name: "Example", token_expires_at: null };
  assert.equal(health.connectionState(), "not_connected");
  assert.equal(health.connectionState(account), "connected");
  assert.equal(health.connectionState({ ...account, token_expires_at: "2000-01-01" }), "expired");
  assert.equal(health.connectionState({ ...account, token_expires_at: "bad" }), "reconnect_required");
  assert.equal(health.connectionState({ ...account, page_access_token: null }), "reconnect_required");
  assert.equal(health.connectionState({ ...account, is_active: false }), "reconnect_required");
  assert.equal(JSON.stringify(health.connectionHealth([account])).includes("secret-token"), false);
});
test("mutating routes deny a foreign tenant before database writes or provider calls", async () => {
  const { auth } = fixture();
  const body = { organisationId: "org-b", message: "hello", platforms: ["facebook"], id: "post-b", scheduledAt: "2030-01-01", startAt: "2030-01-01", items: [{ text: "hello" }] };
  const req = {
    url: "https://example.test/?organisationId=org-b", nextUrl: new URL("https://example.test/?organisationId=org-b"),
    json: async () => body, headers: new Headers(),
  };
  const db = { from: () => { throw new Error("Unexpected tenant data access"); } };
  for (const path of ["social/quick-blast", "social/dispatch", "social/schedule", "social/scheduled/import", "social/scheduled/update", "social/scheduled/delete", "scheduled/update", "scheduled/cancel", "schedule/update", "publish/now", "linkedin/post", "tiktok/post", "tiktok/status", "oauth/threads/manual-save", "oauth/linkedin/finish", "oauth/facebook/save-page", "oauth/facebook/connect-page", "responses/reply"]) {
    const file = `app/api/${path}/route.ts`;
    const source = fs.readFileSync(file, "utf8");
    const mocks = { "next/server": responseMock, "@/lib/tenantAuth": auth };
    for (const [, name] of source.matchAll(/from "([^"]*supabaseAdmin)"/g)) mocks[name] = { supabaseAdmin: db };
    const result = await load(file, mocks).POST(req);
    assert.equal(result.status, 403, path);
  }
});

test("OAuth callbacks reject unsigned state before exchanging codes", async () => {
  const f = oauthFixture();
  const unsafe = Buffer.from(JSON.stringify({ organisationId: "org-b" })).toString("base64url");
  const url = new URL(`https://example.test/callback?code=untrusted&state=${unsafe}`);
  const req = { url: url.toString(), nextUrl: url };
  const env = {
    THREADS_CLIENT_ID: "test", THREADS_CLIENT_SECRET: "test",
    LINKEDIN_CLIENT_ID: "test", LINKEDIN_CLIENT_SECRET: "test",
    GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", GOOGLE_REDIRECT_URI: "https://example.test/callback",
    TIKTOK_CLIENT_KEY: "test", TIKTOK_CLIENT_SECRET: "test", TIKTOK_REDIRECT_URI: "https://example.test/callback",
  };
  for (const provider of ["threads", "linkedin", "google", "tiktok", "facebook"]) {
    let providerCalls = 0, writes = 0;
    const result = await load(`app/api/oauth/${provider}/callback/route.ts`, {
      "next/server": responseMock, "@/lib/oauthState": f.oauth,
      "@/lib/tenantAuth": fixture().auth,
      "@/lib/supabaseAdmin": { supabaseAdmin: { from() { writes++; throw new Error("Unexpected write"); } } },
      googleapis: {},
      __fetch: () => { providerCalls++; throw new Error("Unexpected provider call"); },
    }, env).GET(req);
    assert.ok(result.redirect.includes("error="), provider);
    assert.equal(result.redirect.includes("connected=1"), false, provider);
    assert.equal(providerCalls, 0, provider);
    assert.equal(writes, 0, provider);
  }
});
test("scheduled dispatcher rejects requests when CRON_SECRET is missing or wrong", async () => {
  const req = { headers: new Headers(), nextUrl: new URL("https://example.test") };
  for (const env of [{}, { CRON_SECRET: "test" }]) {
    const result = await load("app/api/social/dispatch-scheduled/route.ts", {
      "next/server": responseMock,
      "../../../../lib/supabaseAdmin": { supabaseAdmin: { from() { throw new Error("Unexpected database access"); } } },
      "@/lib/tenantAuth": fixture().auth,
    }, env).GET(req);
    assert.equal(result.status, 401);
  }
});
test("connection-health API requires membership and only returns safe fields", async () => {
  const { auth } = fixture();
  const accounts = [{ platform: "facebook", is_active: true, page_access_token: "do-not-expose", page_name: "Page", token_expires_at: null }];
  const filters = [];
  const query = { select() { return query; }, eq(k,v) { filters.push([k,v]); return query; }, order: async () => ({ data: accounts, error: null }) };
  const api = load("app/api/social/connection-health/route.ts", {
    "next/server": responseMock, "@/lib/tenantAuth": auth,
    "@/lib/supabaseAdmin": { supabaseAdmin: { from: () => query } },
    "@/lib/connectionHealth": load("lib/connectionHealth.ts"),
  });
  const denied = await api.GET({ nextUrl: new URL("https://example.test?organisationId=org-b") });
  assert.equal(denied.status, 403);
  assert.equal(filters.length, 0);
  const result = await api.GET({ nextUrl: new URL("https://example.test?organisationId=org-a") });
  assert.equal(result.status, 200);
  assert.deepEqual(filters, [["organisation_id", "org-a"]]);
  assert.equal(JSON.stringify(result.body).includes("do-not-expose"), false);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
});


test("Threads reconnect retries transient long-token identity failure without storing the short token", async () => {
  for (const mode of ["fallback", "normal", "both_fail", "revoked", "exchange_fail", "state_fail", "membership_fail", "network"]) {
    const requests = [], writes = [], logs = [];
    const db = { from() {
      const query = {
        update(data) { writes.push(data); return query; },
        insert(data) { writes.push(data); return query; },
        select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle: async () => ({data:null,error:null}),
        then(resolve) { return Promise.resolve({error:null}).then(resolve); },
      }; return query;
    }};
    const api = load("app/api/oauth/threads/callback/route.ts", {
      "next/server": responseMock,
      "@/lib/oauthState": { consumeOAuthState: async () => { if(mode==="state_fail") throw Error("secret-state"); return {organisationId:"org-a"}; } },
      "@/lib/tenantAuth": { requireOrganisation: async id => { assert.equal(id,"org-a"); if(mode==="membership_fail") throw Error("secret-cookie"); } },
      "@/lib/supabaseAdmin": {supabaseAdmin:db},
      __console: {error: (...args)=>logs.push(args),warn: (...args)=>logs.push(args)},
      __fetch: async url => {
        requests.push(url);
        let json, status=200;
        if(url.includes("/oauth/access_token")) json={access_token:"secret-short",expires_in:3600};
        else if(!url.includes("/me?")) {
          if(mode==="exchange_fail") {status=400;json={error:{code:1,message:"secret-long"}};}
          else json={access_token:"secret-long",expires_in:5184000};
        } else if(url.includes("secret-long") && mode!=="normal" && mode!=="membership_fail") {
          if(mode==="network") throw Error("secret-long");
          status=400;json={error:{code:mode==="revoked"?190:1,type:"OAuthException",message:"secret-long"}};
        } else if(mode==="both_fail") {status=400;json={error:{code:1,message:"secret-short"}};}
        else json={id:"threads-user",username:"tester"};
        return {ok:status===200,status,json:async()=>json};
      },
    }, {THREADS_CLIENT_ID:"app",THREADS_CLIENT_SECRET:"secret-client",NEXT_PUBLIC_APP_URL:"https://app.example"});
    const result=await api.GET({nextUrl:new URL("https://app.example/api/oauth/threads/callback?code=secret-code&state=signed")});
    const success=["fallback","normal","exchange_fail","network"].includes(mode);
    assert.equal(result.redirect.includes("connected=1"),success,mode);
    const insert=writes.find(w=>w.page_access_token);
    if(success) {
      assert.equal(insert.organisation_id,"org-a");
      assert.equal(insert.page_id,"threads-user");
      assert.equal(insert.page_access_token,mode==="exchange_fail"?"secret-short":"secret-long");
      assert.ok(insert.token_expires_at);
    } else assert.equal(writes.length,0,mode);
    const identity=requests.filter(u=>u.includes("/me?"));
    if(["fallback","both_fail","network"].includes(mode)) {
      assert.equal(identity.length,2); assert.ok(identity[0].includes("secret-long")); assert.ok(identity[1].includes("secret-short"));
      assert.ok(logs.some(l=>l[1].stage==="identity" && l[1].tokenType==="long_lived"));
    }
    if(mode==="revoked") assert.equal(identity.length,1);
    if(mode==="state_fail") assert.equal(requests.length,0);
    assert.equal(JSON.stringify(logs).includes("secret-"),false);
    assert.equal(result.redirect.includes("secret-"),false);
  }
});
