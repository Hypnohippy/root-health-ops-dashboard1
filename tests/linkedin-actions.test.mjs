import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { create, act } from "react-test-renderer";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(path, deps, globals={}) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>deps[id],Error,...globals});
 return module.exports;
}
const helpers=load("lib/linkedinWorkbench.ts",{}),clipboard=load("lib/linkedinClipboard.ts",{});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=(status,message="Hello from the verified sender.")=>({ok:status===200,json:async()=>status===200?{message}:{error:`Generation failed (${status}). Type or retry.`}});
async function fixture({request, timer=false, popup=true, copyFailure=false}={}) {
 const calls=[],copies=[],opened=[],requests=[];let deadline;
 const deps={react:React,"react/jsx-runtime":jsx,"@/lib/linkedinWorkbench":helpers,"@/lib/linkedinClipboard":clipboard,"@/lib/tenantFetch":{tenantFetch:(url,init)=>{requests.push(init);calls.push(JSON.parse(init.body));return request ? request(init) : Promise.resolve(response(200));}}};
 const {ContactCard}=load("app/dashboard/responses/linkedin/LinkedInWorkbench.tsx",deps,{AbortController,clearTimeout:timer?()=>{}:clearTimeout,setTimeout:timer?fn=>{deadline=fn;return 1;}:setTimeout,crypto:{randomUUID:()=>"receipt"},window:{open:(url,target)=>{opened.push([url,target]);return popup?{opener:{},location:{replace:url=>opened.push([url])}}:null;}},navigator:{clipboard:{writeText:async text=>{if(copyFailure)throw Error("clipboard denied");copies.push(text);}}}});
 const props={item:{contactId:"a",id:"a",table:"inbox_items",name:"Tara",stage:"connection",mode:"fresh",reason:"Accepted",lifecycle:"outreach_ready",destination:"https://www.linkedin.com/messaging/thread/123/"},queue:{organisationId:"tenant",revision:"3"},initialMessage:"",onDraft:()=>{},onNext:async()=>{},onReload:async()=>{},onWorking:()=>{},suspended:false};
 let renderer;await act(async()=>{renderer=create(React.createElement(ContactCard,props));});
 const button=name=>renderer.root.findAllByType("button").find(n=>n.children.join("")===name);
 const status=()=>renderer.root.findAll(n=>n.props.role==="status").map(n=>n.children.join("")).join(" ");
 return {renderer,props,ContactCard,button,status,calls,copies,opened,requests,deadline:()=>deadline(),unmount:async()=>act(async()=>renderer.unmount())};
}
for(const status of [200,409,503,500]) test(`real React generation ${status} clears busy and allows retry`,async()=>{
 const pending=deferred(),f=await fixture({request:()=>pending.promise});
 assert.equal(f.button("Preparing draft…").props.disabled,true);
 await act(async()=>pending.resolve(response(status)));
 assert.equal(f.button("Refresh draft").props.disabled,false);
 assert.equal(f.renderer.root.findByType("article").props["aria-busy"],false);
 if(status===200)assert.equal(f.button("Mark sent & next").props.disabled,false);
 else {assert.match(f.status(),/Generation failed/);assert.equal(f.button("Mark sent & next").props.disabled,true);}
 await f.unmount();
});
test("network rejection clears busy; edited manual text opens and copies current text without lifecycle POST",async()=>{
 const f=await fixture({request:()=>Promise.reject(Error("Network unavailable"))});
 assert.match(f.status(),/Network unavailable/);assert.equal(f.button("Refresh draft").props.disabled,false);
 await act(async()=>f.renderer.root.findByType("textarea").props.onChange({target:{value:"My edited message"}}));
 assert.equal(f.button("Open & Copy").props.disabled,false);
 await act(async()=>f.button("Open & Copy").props.onClick());
 assert.deepEqual(f.copies,["My edited message"]);assert.deepEqual(f.opened,[["about:blank","_blank"],[f.props.item.destination]]);
 assert.ok(f.calls.every(c=>c.action==="generate"));await f.unmount();
});
test("popup blocked still copies with visible destination fallback",async()=>{
 const f=await fixture({popup:false});await act(async()=>f.button("Open & Copy").props.onClick());
 assert.equal(f.copies.length,1);assert.match(f.status(),/Copied.*could not open.*destination link/);await f.unmount();
});
test("clipboard blocked shows manual copy fallback and retains draft",async()=>{
 const f=await fixture({copyFailure:true});await act(async()=>f.button("Open & Copy").props.onClick());
 assert.match(f.status(),/Clipboard access failed.*Ctrl\+C/);assert.match(f.renderer.root.findByType("textarea").props.value,/Hello/);await f.unmount();
});
test("unresolved request reaches deadline, clears preparing state and allows retry/manual text",async()=>{
 const f=await fixture({request:()=>new Promise(()=>{}),timer:true});
 await act(async()=>f.deadline());assert.equal(f.button("Refresh draft").props.disabled,false);assert.match(f.status(),/timed out/);assert.equal(f.requests[0].signal.aborted,true);await f.unmount();
});
test("suspension invalidates generation and clears busy even when fetch ignores abort",async()=>{
 const pending=deferred(),f=await fixture({request:()=>pending.promise});
 await act(async()=>f.renderer.update(React.createElement(f.ContactCard,{...f.props,suspended:true})));
 assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.renderer.root.findByType("article").props["aria-busy"],false);
 await act(async()=>pending.resolve(response(200,"Stale text")));assert.equal(f.renderer.root.findByType("textarea").props.value,"");await f.unmount();
});
test("changing contact aborts stale generation and never overwrites the new contact",async()=>{
 const first=deferred(),second=deferred();let n=0;const f=await fixture({request:()=>++n===1?first.promise:second.promise});
 await act(async()=>f.renderer.update(React.createElement(f.ContactCard,{...f.props,key:"b",item:{...f.props.item,id:"b",contactId:"b",name:"Other"}})));
 assert.equal(f.requests[0].signal.aborted,true);
 await act(async()=>first.resolve(response(200,"Stale Tara")));assert.equal(f.renderer.root.findByType("textarea").props.value,"");
 await act(async()=>second.resolve(response(200,"New contact draft")));assert.equal(f.renderer.root.findByType("textarea").props.value,"New contact draft");assert.equal(f.button("Refresh draft").props.disabled,false);await f.unmount();
});
test("throwing popup cannot suppress clipboard",async()=>{
 const copied=[];assert.match(await clipboard.openAndCopyLinkedIn("current","https://linkedin.com/in/a",{open:()=>{throw Error("blocked");},copy:async text=>copied.push(text)}),/Copied.*could not open/);assert.deepEqual(copied,["current"]);
});
