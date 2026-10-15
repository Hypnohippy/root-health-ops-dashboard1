import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url),React=require("react"),renderer=require("react-test-renderer");globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,mocks={},globals={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Date,console,...globals,require:n=>n in mocks?mocks[n]:n.endsWith(".css")?{}:n.startsWith("@/")?load(n.replace("@/","")+".ts",mocks,globals):n.startsWith(".")?load(path.resolve(path.dirname(file),n)+".tsx",mocks,globals):require(n)});return mod.exports;}
for(const file of ["app/dashboard/connect/page.tsx","app/dashboard/connect/threads-manual/page.tsx"]){test(`${file}: all connection handlers and callbacks remain unchanged`,()=>{
 const current=fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),before=execFileSync("git",["show",`a403f95:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n");
 const logic=s=>s.slice(s.indexOf("export default"),s.indexOf('    <'+(s.includes('<main')?'main':'div')+' className="'+(s.includes('connect-workspace')?'connect-workspace ':'')+'min-h-screen'));assert.equal(logic(current),logic(before));
 const callbacks=s=>{const f=ts.createSourceFile("page.tsx",s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.getText(f)))out.push(n.initializer?.getText(f));ts.forEachChild(n,visit)}visit(f);return out};assert.deepEqual(callbacks(current),callbacks(before));
});}
test("Connect states, setup helper, provider restrictions and action implementations remain the frozen source of truth",()=>{
 for(const file of ["app/dashboard/connect/ChannelCard.tsx","app/dashboard/connect/ProviderSetupGuide.tsx","lib/connectionActions.ts","lib/connectionPresentation.ts","lib/channelCapabilities.ts","lib/providerSetup.ts"]){assert.equal(fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),execFileSync("git",["show",`a403f95:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n"));}
 const source=fs.readFileSync("app/dashboard/connect/page.tsx","utf8");assert.doesNotMatch(source,/RootCoach|Root Coach|root-coach/);assert.match(source,/BrandGrowthProfileEditor/);
});
test("Connect actual page retains stored states, helper copy, future catalogue and tenant-scoped read-only refresh",async()=>{
 const calls=[],org="tenant",C=load("app/dashboard/connect/page.tsx",{"../components/BrandGrowthProfileEditor":()=>React.createElement("p",null,"Existing Brand & Growth Profile"),"@/lib/connectionActions":{fetchConnectionHealth:async id=>{calls.push(id);return {connections:[{platform:"facebook",state:"connected",name:"Known Page",expiresAt:null},{platform:"linkedin",state:"expired",name:"Known Member",expiresAt:"2020-01-01"}],checkedAt:"2026-10-15T12:00:00Z"}},disconnectConnection:()=>{throw Error("No disconnect expected")}}},{window:{location:{search:"?organisationId=tenant"},addEventListener(){},removeEventListener(){}}}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(C))});assert.deepEqual(calls,[org]);
 const json=JSON.stringify(tree.toJSON());assert.match(json,/Known Page/);assert.match(json,/Your saved connection needs attention/);assert.match(json,/Advanced technical details/);assert.match(json,/Setup:/);assert.match(json,/Coming soon/);assert.match(json,/Existing Brand & Growth Profile/);assert.match(json,/not verified/);
 const connected=tree.root.findByProps({"aria-labelledby":"connected-channels"});assert.equal(connected.findAllByType("article").length,1);
 const counts=tree.root.findByProps({"aria-label":"Recorded connection overview"}).findAllByType("strong");assert.equal(counts[0].children.join(""),"1");
 const card=connected.findByType("article"),check=card.findAllByType("button").find(n=>n.children.join("")==="Check connection");await renderer.act(async()=>check.props.onClick());assert.deepEqual(calls,[org,org]);assert.match(JSON.stringify(tree.toJSON()),/does not test sending or publishing/);await renderer.act(async()=>tree.unmount());
});
test("Connect setup guidance retains authorisation URL, cancel action and unsupported fail-closed state",async()=>{
 const caps=load("lib/channelCapabilities.ts"),setup=load("lib/providerSetup.ts"),Card=load("app/dashboard/connect/ChannelCard.tsx").default;
 const health={platform:"instagram",state:"not_connected",name:null,expiresAt:null,setup:{...setup.buildProviderSetup("instagram","not_connected",null),state:"ready_to_connect",configuration:"present_not_verified",canConnect:true}};
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Card,{channel:caps.channelCatalog.find(c=>c.id==="instagram"),health,organisationId:"tenant",onDisconnect:async()=>{throw Error("No disconnect")},recheck:async()=>{}}))});
 const button=label=>tree.root.findAllByType("button").find(n=>n.children.join("")===label);await renderer.act(async()=>button("Connect").props.onClick());assert.match(JSON.stringify(tree.toJSON()),/Before opening/);assert.match(JSON.stringify(tree.toJSON()),/Facebook/);const link=tree.root.findByType("a");assert.equal(link.props.href,"/api/social/connect/start?provider=instagram&organisationId=tenant");await renderer.act(async()=>button("Cancel").props.onClick());assert.equal(tree.root.findAllByType("a").length,0);await renderer.act(async()=>tree.unmount());
 await renderer.act(async()=>{tree=renderer.create(React.createElement(Card,{channel:caps.channelCatalog.find(c=>c.id==="whatsapp"),health:{platform:"whatsapp",state:"not_connected",name:null,expiresAt:null},organisationId:"tenant",onDisconnect:async()=>{},recheck:async()=>{}}))});assert.match(JSON.stringify(tree.toJSON()),/Not supported yet/);assert.ok(tree.root.findAllByType("button").some(n=>n.props.disabled));await renderer.act(async()=>tree.unmount());
});
