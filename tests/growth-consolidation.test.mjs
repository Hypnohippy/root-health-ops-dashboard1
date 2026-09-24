import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const nodeRequire=createRequire(import.meta.url);

function load(file) {
  const mod={exports:{}};
  const output=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(output,{module:mod,exports:mod.exports,require:nodeRequire,URL},{filename:file});return mod.exports;
}
const outreach=load("lib/growthOutreach.ts");
const profile={business:{name:"North Street Bakery",geography:"Leeds"},customers:{audience:"independent café owners",problems:[]},offer:{priorityServices:[]}};

test("existing cadence is shared and due timing is preserved",()=>{
  const now=Date.parse("2026-09-24T12:00:00Z");
  assert.equal(outreach.isGrowthTargetDue({stage:"connection",last_action_at:null},now),true);
  assert.equal(outreach.isGrowthTargetDue({stage:"day3_dm",last_action_at:"2026-09-22T12:00:00Z"},now),false);
  assert.equal(outreach.isGrowthTargetDue({stage:"day3_dm",last_action_at:"2026-09-21T12:00:00Z"},now),true);
  assert.deepEqual(["connection","day3_dm","day10_insight","day17_followup"].map(outreach.nextGrowthStage),["day3_dm","day10_insight","day17_followup","parked"]);
});

test("fallback drafts use real contact and Growth Profile context without the retired generic phrase",()=>{
  const target={target_name:"Priya Shah",company:"Acme",role_title:"People Director",stage:"day3_dm"};
  const draft=outreach.contextualOutreachDraft(target,profile);
  assert.match(draft,/Priya/);assert.match(draft,/independent café owners/);
  assert.doesNotMatch(draft,/I noticed your work in your field|Thanks for connecting/i);
});

test("LinkedIn identity canonicalisation deduplicates tracking variants",()=>{
  assert.equal(outreach.canonicalLinkedInProfile("https://www.linkedin.com/in/Priya-Shah/?trk=email"),outreach.canonicalLinkedInProfile("https://linkedin.com/in/priya-shah#top"));
});

test("Phase 4G intake separates Responses, Acquisition and existing cadence without auto-send",()=>{
  const ingest=fs.readFileSync("app/api/growth/linkedin-connections/ingest/route.ts","utf8");
  const promote=fs.readFileSync("app/api/growth/acquisition/[id]/start-outreach/route.ts","utf8");
  assert.match(ingest,/from\("inbox_items"\)/);assert.match(ingest,/from\("acquisition_items"\)/);
  assert.match(promote,/from\("growth_targets"\)/);assert.match(promote,/linkedin_identity/);
  assert.doesNotMatch(ingest+promote,/sendMessage|api\.linkedin\.com|linkedin.*fetch\(/i);
});

test("mark-sent resolves the tenant-owned stage instead of trusting a client stage",()=>{
  const source=fs.readFileSync("app/api/growth/mark-sent/route.ts","utf8");
  assert.match(source,/select\("id,stage"\).*organisation_id/);
  assert.doesNotMatch(source,/const \{ id, stage \} = await req\.json/);
});
