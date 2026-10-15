import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url),React=require("react"),renderer=require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const file="app/dashboard/sequences/page.tsx",current=fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),baseline=execFileSync("git",["show",`e690e84:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n");
test("Campaign presentation preserves every existing state, generator, approval and handoff handler",()=>{
 const beforeReturn=s=>s.slice(s.indexOf("export default"),s.indexOf('    <div className="'+(s.includes('campaigns-workspace')?'campaigns-workspace ':'')+'min-h-screen'));
 assert.equal(beforeReturn(current),beforeReturn(baseline));
 const callbacks=s=>{const f=ts.createSourceFile("page.tsx",s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.getText(f)))out.push(n.initializer?.getText(f));ts.forEachChild(n,visit)}visit(f);return out};assert.deepEqual(callbacks(current),callbacks(baseline));
});
test("Campaign state cards use exact stored statuses, retain unknowns and never infer running or completion from generated assets",async()=>{
 const calls=[],rows=[{id:"draft",name:"Recorded draft",status:"draft"},{id:"work",name:"Recorded work",status:"in_progress"},{id:"done",name:"Recorded completion",status:"completed"},{id:"unknown",name:"Unclassified",status:"other"}].map(s=>({...s,organisation_id:"tenant",goal:null,audience:null,notes:null,created_at:"2026-10-01T12:00:00Z"}));
 const read=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url==="/api/social-accounts"?{organisationId:"tenant"}:{sequences:rows}}};
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(current,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,console,Date,require:n=>n.endsWith(".css")?{}:n==="@/lib/tenantFetch"?{tenantFetch:read}:require(n),fetch:read});
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(mod.exports.default))});
 assert.deepEqual(calls.map(c=>c.url),["/api/social-accounts","/api/sequences?organisationId=tenant"]);assert.ok(calls.every(c=>!c.opts?.method||c.opts.method==="GET"));
 const briefing=tree.root.findByProps({"aria-label":"Recorded campaign states"});assert.deepEqual(briefing.findAllByType("strong").map(n=>n.children.join("")),["1","1","1"]);
 assert.equal(tree.root.findAll(n=>n.props["data-campaign-status"]==="other").length,1);assert.match(JSON.stringify(tree.toJSON()),/This status does not imply live delivery or publication/);await renderer.act(async()=>tree.unmount());
});
