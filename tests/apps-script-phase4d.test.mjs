import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadAppsScript() {
  const context = vm.createContext({
    Logger: { log() {} },
    JSON, Date, String, Object, Array, RegExp, Error,
  });
  vm.runInContext(fs.readFileSync("docs/b2b-phase4d-apps-script.gs", "utf8"), context);
  return context;
}

test("acknowledgement failure after Gmail delivery remains sent and duplicate retries only acknowledgement", () => {
  const script = loadAppsScript();
  const records = new Map();
  let gmailCalls = 0;
  let acknowledgementCalls = 0;
  const instruction = {
    organisationId: "78fa2ac8-e7b6-4b9b-9604-035723ece6b1",
    sourceEngine: "root_health_b2b",
    responseItemId: "11111111-1111-4111-8111-111111111111",
    sendRequestId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    recipient: "buyer@example.com", subject: "Re: enquiry",
    approvedBody: "Exact approved body", bodyHash: "sha256-placeholder", gmailThreadId: null,
  };
  const deps = {
    read: key => records.get(key) || null,
    write: (key, value) => records.set(key, structuredClone(value)),
    send: received => { gmailCalls++; assert.equal(received.approvedBody, "Exact approved body"); return { gmailMessageId: "gmail-sent-1", gmailThreadId: "thread-1" }; },
    ack: () => { acknowledgementCalls++; if (acknowledgementCalls === 1) throw new Error("Ops unavailable"); },
    now: () => "2026-09-24T12:00:00.000Z",
  };

  const first = script.processPhase4DInstruction_(instruction, deps);
  assert.equal(first.status, "sent");
  assert.equal(first.acknowledgement_status, "ack_pending");
  assert.equal(records.get(instruction.idempotencyKey).deliveryStatus, "sent");
  assert.equal(records.get(instruction.idempotencyKey).approvedBody, undefined);
  assert.equal(records.get(instruction.idempotencyKey).bodyHash, "sha256-placeholder");

  const duplicate = script.processPhase4DInstruction_(instruction, deps);
  assert.equal(duplicate.status, "sent");
  assert.equal(duplicate.acknowledgement_status, "acknowledged");
  assert.equal(gmailCalls, 1);
  assert.equal(acknowledgementCalls, 2);
});

test("pre-delivery Gmail failure is retryable only with matching recipient, subject and body hash", () => {
  const script = loadAppsScript();
  const records = new Map();
  let attempts = 0;
  const instruction = {
    organisationId: "78fa2ac8-e7b6-4b9b-9604-035723ece6b1", sourceEngine: "root_health_b2b",
    responseItemId: "11111111-1111-4111-8111-111111111111", sendRequestId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "22222222-2222-4222-8222-222222222222", recipient: "buyer@example.com",
    subject: "Re: enquiry", approvedBody: "Exact approved body", bodyHash: "matching-hash", gmailThreadId: null,
  };
  const deps = {
    read: key => records.get(key) || null,
    write: (key, value) => records.set(key, structuredClone(value)),
    send: () => { attempts++; if (attempts === 1) throw new Error("Gmail rejected before delivery"); return { gmailMessageId: "m2", gmailThreadId: "t2" }; },
    ack() {}, now: () => "2026-09-24T12:00:00.000Z",
  };
  assert.equal(script.processPhase4DInstruction_(instruction, deps).status, "failed");
  assert.equal(script.processPhase4DInstruction_(instruction, deps).status, "sent");
  assert.equal(attempts, 2);
  assert.throws(() => script.processPhase4DInstruction_({ ...instruction, bodyHash: "different-hash" }, deps), /RETRY_MISMATCH/);
  assert.equal(attempts, 2);
});
