import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const organisationId = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1";
const branch = "codex/google-calendar-inbound-discovery";
function load(file, dependencies = {}, env = {}) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, process: { env }, URL, Date, require: name => name in dependencies ? dependencies[name] : (() => { throw new Error(`Unexpected import: ${name}`); })() });
  return mod.exports;
}

function calendarConstants() {
  return { DIARY_CALENDAR_DIAGNOSTIC_ORGANISATION_ID: organisationId, DIARY_CALENDAR_DIAGNOSTIC_BRANCH: branch };
}

test("calendar diagnostic gate requires the exact Preview branch", () => {
  const helper = env => load("lib/diaryCalendarDiagnostic.server.ts", { "@/lib/diaryGoogleCalendar.server": calendarConstants() }, env);
  assert.equal(helper({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch }).isDiaryCalendarDiagnosticEnabled(), true);
  assert.equal(helper({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: branch }).isDiaryCalendarDiagnosticEnabled(), false);
  assert.equal(helper({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/linkedin-first-message-engine" }).isDiaryCalendarDiagnosticEnabled(), false);
  assert.equal(helper({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }).isDiaryCalendarDiagnosticEnabled(), false);
});

test("Calendar diagnostic endpoint requires target organisation and operator role and performs only a scoped GET read", async () => {
  const enabledHelper = load("lib/diaryCalendarDiagnostic.server.ts", { "@/lib/diaryGoogleCalendar.server": calendarConstants() }, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch });
  const calls = [];
  const route = load("app/api/diary/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: init.headers || {} }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: (handler, options) => { assert.equal(options.write, false, "authenticated membership is resolved without turning the GET into a write"); return (request, tenant) => handler(request, tenant); } },
    "@/lib/diary.server": { readDiary: async (...args) => { calls.push(args); return { calendarDiagnostic: { readOnly: true, accountEmail: "david@fuelgeist.co.uk" } }; } },
    "@/lib/diaryAppointments": { addDateDays: date => date, validDate: () => true },
    "@/lib/tenantAuth": { isWriteRole: role => ["owner", "admin", "manager"].includes(role) },
    "@/lib/diaryCalendarDiagnostic.server": enabledHelper,
  });
  const request = { url: `https://app.test/api/diary?organisationId=${organisationId}&calendarDiagnostic=1` };
  const denied = await route.GET(request, { organisationId, role: "member" });
  assert.equal(denied.status, 403); assert.equal(calls.length, 0);
  const wrongTenant = await route.GET(request, { organisationId: "other-org", role: "owner" });
  assert.equal(wrongTenant.status, 404); assert.equal(calls.length, 0);
  const allowed = await route.GET(request, { organisationId, role: "owner" });
  assert.equal(allowed.status, 200); assert.deepEqual(allowed.body, { readOnly: true, accountEmail: "david@fuelgeist.co.uk" });
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify({ from: "2026-11-17", to: "2026-11-18" }));
  assert.equal(JSON.stringify(calls[0][2]), JSON.stringify({ calendarDiagnostic: true }));
  assert.match(allowed.headers["Cache-Control"], /no-store/);
});

test("calendar diagnostic route returns not found outside the exact Preview branch", async () => {
  const disabledHelper = load("lib/diaryCalendarDiagnostic.server.ts", { "@/lib/diaryGoogleCalendar.server": calendarConstants() }, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: branch });
  const route = load("app/api/diary/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: handler => (request, tenant) => handler(request, tenant) },
    "@/lib/diary.server": { readDiary: async () => { throw new Error("must not read"); } },
    "@/lib/diaryAppointments": { addDateDays: date => date, validDate: () => true },
    "@/lib/tenantAuth": { isWriteRole: () => true },
    "@/lib/diaryCalendarDiagnostic.server": disabledHelper,
  });
  const response = await route.GET({ url: `https://app.test/api/diary?organisationId=${organisationId}&calendarDiagnostic=1` }, { organisationId, role: "owner" });
  assert.equal(response.status, 404);
});
