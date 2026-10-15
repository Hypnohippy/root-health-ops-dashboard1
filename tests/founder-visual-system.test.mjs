import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),React=require("react"),renderer=require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,mocks={},globals={}) { const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Date,Intl,console,window:{addEventListener(){},removeEventListener(){}},...globals,require:n=>n in mocks?mocks[n]:n.endsWith(".css")?{}:n.startsWith("@/")?load(n.replace("@/","")+".ts",mocks,globals):n.startsWith(".")?load(path.resolve(path.dirname(file),n)+(fs.existsSync(path.resolve(path.dirname(file),n)+".tsx")?".tsx":".ts"),mocks,globals):require(n)});return mod.exports; }

test("Founder loading and access denial never expose research controls or trigger writes",async()=>{
 for(const access of [false,true]){const calls=[];const C=load("app/dashboard/founder-intelligence/page.tsx",{"./FounderMemoryPanel":()=>React.createElement("section",null,"Existing memory controls")},{fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url==="/api/org/current"?{organisationId:"tenant"}:{allowed:access}}}}).default;
 let tree;await renderer.act(async()=>tree=renderer.create(React.createElement(C)));const text=JSON.stringify(tree.toJSON());assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.opts?.method||c.opts.method==="GET"));assert.equal(calls[1].url,"/api/founder-intelligence/access?organisationId=tenant");
 if(access){assert.match(text,/Existing memory controls/);assert.match(text,/No stored record open/);assert.match(text,/Not established/);assert.match(text,/Research ready when you are/);assert.doesNotMatch(text,/92\/100|Momentum: High|£150k/);assert.ok(tree.root.findAllByType("button").some(b=>b.children.includes("Discover organisations")));}
 else {assert.match(text,/restricted to the Root Health founder/);assert.doesNotMatch(text,/Existing memory controls|Research focus|Research ready when you are/);assert.equal(tree.root.findAllByType("button").length,0);}
 await renderer.act(async()=>tree.unmount());}
});
test("Founder handlers, permissions, search and exact memory evidence are unchanged from approved Growth HEAD",()=>{
 const before=file=>require("node:child_process").execFileSync("git",["show",`abb7ae8:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n");
 const file="app/dashboard/founder-intelligence/page.tsx",page=fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),baseline=before(file);
 assert.equal(page.slice(page.indexOf("export default"),page.indexOf("if(allowed===null)")),baseline.slice(baseline.indexOf("export default"),baseline.indexOf("if(allowed===null)")));
 const callbacks=source=>{const f=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),values=[];const visit=node=>{if(ts.isJsxAttribute(node)&&/^on[A-Z]/.test(node.name.getText(f)))values.push(node.initializer?.getText(f));ts.forEachChild(node,visit)};visit(f);return values};assert.deepEqual(callbacks(page),callbacks(baseline));
 const memory="app/dashboard/founder-intelligence/FounderMemoryPanel.tsx";assert.equal(fs.readFileSync(memory,"utf8").replaceAll("\r\n","\n").replace('className="founder-memory space-y-3','className="space-y-3'),before(memory));
});
