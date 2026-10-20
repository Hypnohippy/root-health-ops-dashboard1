import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url),React=require("react"),renderer=require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const file="app/dashboard/resources/page.tsx",current=fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),baseline=execFileSync("git",["show",`93352b9:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n");
test("Standalone creation, editing and campaign handoff handlers remain unchanged",()=>{
 const names=new Set(["createResource","createProgramme","saveEditedResource","renameResource","duplicateResource","deleteResource","sendTemplateToBrainstorm","sendSavedResourceToBrainstorm","deepTeachSection","eliteDeepTeachSection"]);
 const bodies=s=>{const f=ts.createSourceFile("page.tsx",s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out={};function visit(n){if(ts.isFunctionDeclaration(n)&&names.has(n.name?.text))out[n.name.text]=n.getText(f);ts.forEachChild(n,visit)}visit(f);return out};
 assert.equal(Object.keys(bodies(current)).length,names.size);assert.deepEqual(bodies(current),bodies(baseline));
});

test("Resources landing, templates and creator disclosure remain usable without generation or writes",async()=>{
 const calls=[],read=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url==="/api/social-accounts"?{organisationId:"tenant"}:url==="/api/usage"?{usage:2,limit:10}:{resources:[]}}};
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(current,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Date,AbortController,console,fetch:read,localStorage:{getItem:()=>null},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,require:n=>n.endsWith(".css")?{}:n==="./SolutionSlide"||n==="./ResourceOrigin"?{default:()=>null}:n==="@/lib/presentationAudience"?{audienceSlide:v=>v}:n==="@/lib/tenantFetch"?{tenantFetch:read}:n==="@/lib/organisationProfileClient"?{fetchOrganisationProfile:async()=>({organisationId:"tenant",profile:{}})}:n==="@/lib/brandGrowthProfile"?{emptyProfile:{}}:require(n)});
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(mod.exports.default))});
 const text=n=>JSON.stringify(n.toJSON());assert.match(text(tree),/No saved resources yet/);assert.match(text(tree),/Resource library briefing/);
 const button=label=>tree.root.findAllByType("button").find(n=>n.children.join("").trim()===label);
 await renderer.act(async()=>button("Starter Templates").props.onClick());assert.match(text(tree),/Use in Brainstorm/);
 await renderer.act(async()=>button("+ Create Resource").props.onClick());assert.ok(tree.root.findAll(n=>n.props.className?.includes("resources-creator-modal")).length);assert.ok(tree.root.findAllByType("select").length>0);
 assert.ok(calls.every(c=>!c.opts?.method||c.opts.method==="GET"));assert.ok(calls.some(c=>c.url.includes("/api/resource-library?organisationId=tenant")));
 await renderer.act(async()=>button("Close").props.onClick());await renderer.act(async()=>tree.unmount());
});
test("Resource themes stay isolated and presentation windows use server-authorized projections",()=>{
 assert.match(current,/data-resource-slide="true"/);const css=fs.readFileSync("app/dashboard/resources/resources.css","utf8");assert.match(css,/:not\(\[data-resource-slide\], \[data-resource-slide\] \*\)/);assert.match(css,/resources-modal-backdrop/);assert.match(css,/94dvh/);
 for(const path of ["app/dashboard/resources/present/[id]/page.tsx","app/dashboard/resources/presenter/[id]/page.tsx"]){const source=fs.readFileSync(path,"utf8");assert.match(source,/\/api\/resources\//);assert.doesNotMatch(source,/readCachedResource|resourceCacheKey/);}

});
