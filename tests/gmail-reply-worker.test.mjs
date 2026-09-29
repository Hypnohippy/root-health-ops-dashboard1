import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("docs/b2b-gmail-reply-intake.gs", "utf8");
function message(overrides = {}) {
  return { getId: () => "incoming-1", getFrom: () => "Buyer <buyer@example.com>",
    getTo: () => "Root <enquiries@roothealth.app>", getCc: () => "", getDate: () => new Date(),
    getHeader: () => "<original@example.com>", getPlainBody: () => "Could you send pricing?",
    getSubject: () => "Re: services", isDraft: () => false, isInTrash: () => false, ...overrides };
}
function harness(messages, responseFactory, properties = {}, threadOverrides = {}) {
  const calls = [], logs = [], stored = new Set();
  const props = { OPS_GMAIL_REPLY_INTAKE_ENABLED: "true", OPS_ORGANISATION_ID: "78fa2ac8-e7b6-4b9b-9604-035723ece6b1", OPS_INGESTION_SECRET: "s".repeat(40),
    OPS_GMAIL_REPLY_VERIFIED_IDENTITY: JSON.stringify({ version: 1, organisationId: "78fa2ac8-e7b6-4b9b-9604-035723ece6b1", account: "operator@example.com", ownAddresses: ["operator@example.com", "enquiries@roothealth.app", "other-alias@example.com"] }), ...properties };
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key], setProperty: (key, value) => { props[key] = value; }, deleteProperty: key => { delete props[key]; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => "operator@example.com" }) },
    GmailApp: { getAliases: () => ["enquiries@roothealth.app"], search(query, start, count) {
      assert.equal(query, "to:enquiries@roothealth.app newer_than:14d -in:spam -in:trash");
      assert.equal(start, 0); assert.equal(count, 50);
      return [{ getId: () => "thread-1", getMessages: () => messages, isInSpam: () => false, isInTrash: () => false, ...threadOverrides }];
    } },
    Utilities: { newBlob: text => ({ getBytes: () => Buffer.from(text) }) },
    Logger: { log: text => logs.push(text) },
    UrlFetchApp: { fetch(url, options) {
      assert.equal(url, "https://roothealthops.com/api/responses/email/ingest");
      assert.equal(options.headers.Authorization, `Bearer ${"s".repeat(40)}`);
      assert.equal(options.followRedirects, false);
      const payload = JSON.parse(options.payload); calls.push(payload);
      if (responseFactory) return responseFactory(calls.length);
      const id = payload.records[0].message_id, duplicate = stored.has(id); stored.add(id);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, received: 1, inserted: duplicate ? 0 : 1, duplicates: duplicate ? 1 : 0 }) };
    } },
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { ctx, calls, logs, props };
}

test("forwards genuine replies with original IDs and trusts receiver dedupe on repeat runs", () => {
  const { ctx, calls, logs } = harness([message()]);
  assert.equal(ctx.runOpsGmailReplyIntake().forwarded, 1);
  assert.equal(ctx.runOpsGmailReplyIntake().duplicate, 1);
  assert.equal(calls[0].records[0].message_id, "incoming-1");
  assert.equal(calls[0].records[0].thread_id, "thread-1");
  assert.equal(calls[0].records[0].in_reply_to, "<original@example.com>");
  assert.equal(calls[0].source_engine, "root_health_b2b");
  assert.doesNotMatch(logs.join("\n"), /Could you send pricing|buyer@example|ssssssss/);
});

test("production intake never calls aliases, including for self-mail exclusion", () => {
  const { ctx, calls } = harness([
    message(), message({ getId: () => "self-1", getFrom: () => "operator@example.com" }),
    message({ getId: () => "self-2", getFrom: () => "enquiries@roothealth.app" }),
    message({ getId: () => "self-3", getFrom: () => "other-alias@example.com" }),
  ]);
  let aliasCalls = 0;
  ctx.GmailApp.getAliases = () => { aliasCalls++; throw Error("premium gmail quota"); };
  const result = ctx.runOpsGmailReplyIntake();
  assert.equal(result.ok, true);
  assert.equal(result.forwarded, 1);
  assert.equal(result.skipped, 3);
  assert.equal(calls.length, 1);
  assert.equal(aliasCalls, 0);
});

test("safe test verifies Root mailbox live and stores all addresses without secrets", () => {
  const { ctx, props } = harness([], () => ({ getResponseCode: () => 400, getContentText: () => '{"error":"Invalid email response field."}' }));
  let aliasCalls = 0;
  ctx.GmailApp.getAliases = () => { aliasCalls++; return ["enquiries@roothealth.app", "second@example.com"]; };
  assert.equal(ctx.testOpsGmailReplyIntakeSafe().ok, true);
  assert.equal(aliasCalls, 1);
  const verified = JSON.parse(props.OPS_GMAIL_REPLY_VERIFIED_IDENTITY);
  assert.deepEqual(verified.ownAddresses, ["operator@example.com", "enquiries@roothealth.app", "second@example.com"]);
  assert.equal(verified.account, "operator@example.com");
  assert.equal(verified.organisationId, props.OPS_ORGANISATION_ID);
  assert.doesNotMatch(props.OPS_GMAIL_REPLY_VERIFIED_IDENTITY, /ssssssss|secret/i);
  ctx.GmailApp.getAliases = () => ["second@example.com"];
  assert.equal(ctx.testOpsGmailReplyIntakeSafe().ok, false);
  assert.equal(props.OPS_GMAIL_REPLY_VERIFIED_IDENTITY, undefined);
});

test("missing, malformed or wrong-account/org verification fails before Gmail work", () => {
  for (const cached of [undefined, "not-json", "null", JSON.stringify({ version: 1, account: "other@example.com" }),
    JSON.stringify({ version: 1, account: "operator@example.com", organisationId: "other-org", ownAddresses: ["operator@example.com", "enquiries@roothealth.app"] })]) {
    const { ctx, calls } = harness([], null, { OPS_GMAIL_REPLY_VERIFIED_IDENTITY: cached });
    let gmailCalls = 0;
    ctx.GmailApp = new Proxy({}, { get() { gmailCalls++; throw Error("must fail before Gmail"); } });
    assert.equal(ctx.runOpsGmailReplyIntake().ok, false);
    assert.equal(gmailCalls, 0);
    assert.equal(calls.length, 0);
  }
});

test("failed receiver or alias verification invalidates previous cached identity", () => {
  for (const quotaFailure of [false, true]) {
    const { ctx, props } = harness([], () => ({ getResponseCode: () => 403, getContentText: () => '{}' }));
    if (quotaFailure) ctx.GmailApp.getAliases = () => { throw Error("premium gmail quota"); };
    assert.equal(ctx.testOpsGmailReplyIntakeSafe().ok, false);
    assert.equal(props.OPS_GMAIL_REPLY_VERIFIED_IDENTITY, undefined);
  }
});

test("skips own mail, drafts, old mail, foreign recipients and notifications without reply evidence", () => {
  const variants = [
    { getFrom: () => "enquiries@roothealth.app" }, { getFrom: () => "operator@example.com" }, { getFrom: () => "other-alias@example.com" },
    { isDraft: () => true }, { isInTrash: () => true },
    { getDate: () => new Date("2000-01-01") }, { getTo: () => "other@example.com" }, { getHeader: () => "" }, { getHeader: () => "not a message ID" },
  ];
  for (const overrides of variants) {
    const { ctx, calls } = harness([message(overrides)]);
    assert.equal(ctx.runOpsGmailReplyIntake().skipped, 1);
    assert.equal(calls.length, 0);
  }
});

test("excludes spam and trash threads even if Gmail search returned them", () => {
  for (const property of ["isInSpam", "isInTrash"]) {
    const { ctx, calls } = harness([message()], null, {}, { [property]: () => true });
    assert.equal(ctx.runOpsGmailReplyIntake().skipped, 1);
    assert.equal(calls.length, 0);
  }
});

test("disabled bridge never reads Gmail or calls the receiver; configuration failures stay contained", () => {
  const disabled = harness([], null, { OPS_GMAIL_REPLY_INTAKE_ENABLED: "false" });
  disabled.ctx.GmailApp = new Proxy({}, { get() { throw Error("must not access Gmail"); } });
  assert.equal(disabled.ctx.runOpsGmailReplyIntake().enabled, false);
  assert.equal(disabled.calls.length, 0);
  for (const props of [{ OPS_ORGANISATION_ID: "wrong-tenant" }, { OPS_INGESTION_SECRET: "" }]) {
    const { ctx, calls } = harness([message()], null, props);
    assert.equal(ctx.runOpsGmailReplyIntake().ok, false);
    assert.equal(calls.length, 0);
  }
});

test("safe test verifies authenticated validation without scanning mail or posting message data", () => {
  const { ctx, calls } = harness([], () => ({ getResponseCode: () => 400, getContentText: () => '{"error":"Invalid email response field."}' }));
  ctx.GmailApp.search = () => { throw Error("must not scan mail"); };
  assert.equal(ctx.testOpsGmailReplyIntakeSafe().ok, true);
  assert.deepEqual(calls[0].records, [{}]);
  for (const status of [200, 302, 403, 503]) {
    const bad = harness([], () => ({ getResponseCode: () => status, getContentText: () => '{"error":"Invalid email response field."}' }));
    assert.equal(bad.ctx.testOpsGmailReplyIntakeSafe().ok, false);
  }
});

test("bounds message work and reports partial coverage without logging contents", () => {
  const messages = Array.from({ length: 101 }, (_, index) => message({ getId: () => `m-${index}` }));
  const { ctx, logs } = harness(messages);
  const result = ctx.runOpsGmailReplyIntake();
  assert.equal(result.scanned, 100);
  assert.equal(result.forwarded, 100);
  assert.equal(result.scanLimitReached, true);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /buyer@example|Could you|incoming|ssssssss/);
});

test("mailbox and thread read failures return failure counts without throwing into the caller", () => {
  const { ctx } = harness([]);
  ctx.GmailApp.search = () => { throw Error("private provider diagnostic"); };
  assert.equal(ctx.runOpsGmailReplyIntake().failed, 1);
  const broken = harness([], null, {}, { getMessages: () => { throw Error("private message data"); } });
  assert.equal(broken.ctx.runOpsGmailReplyIntake().failed, 1);
  assert.doesNotMatch(broken.logs.join(""), /private/);
});

test("documented hook preserves original call order and contains bridge failure", () => {
  const deployment = fs.readFileSync("docs/gmail-reply-worker-findings.md", "utf8").match(/```js\r?\n([\s\S]*?)```/)[1];
  const { ctx } = harness([], null, { OPS_INGESTION_SECRET: "" });
  const calls = [];
  const names = ["rebuildFollowUpQueueFromGmail", "classifyInboundReplies", "sendWarmReplyActions", "processNotNowReentries_", "sendDueRootFollowUps"];
  for (const name of names) ctx[name] = () => calls.push(name);
  ctx.log_ = () => calls.push("existing-error-log");
  const intake = ctx.runOpsGmailReplyIntake;
  ctx.runOpsGmailReplyIntake = () => { calls.push("bridge"); return intake(); };
  vm.runInContext(deployment, ctx);
  ctx.scheduledConversationEngine();
  assert.deepEqual(calls, [...names, "bridge"]);
});

test("failed posts and invalid acknowledgements remain retryable without suppressing later replies", () => {
  for (const status of [503, 200]) {
    const { ctx, calls } = harness([message()], () => ({ getResponseCode: () => status, getContentText: () => '{"success":true}' }));
    assert.equal(ctx.runOpsGmailReplyIntake().failed, 1);
    assert.equal(ctx.runOpsGmailReplyIntake().failed, 1);
    assert.equal(calls.length, 2);
  }
});

test("does not truncate oversized messages or post empty replies", () => {
  for (const body of ["", "x".repeat(50001)]) {
    const { ctx, calls } = harness([message({ getPlainBody: () => body })]);
    assert.equal(ctx.runOpsGmailReplyIntake().failed, 1);
    assert.equal(calls.length, 0);
  }
});
