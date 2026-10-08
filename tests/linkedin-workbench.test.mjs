import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
const source=fs.readFileSync("app/dashboard/responses/linkedin/LinkedInWorkbench.tsx","utf8");
const item=i=>({contactId:`contact-${i}`,id:`id-${i}`,table:"growth_targets",name:`Person ${i}`,company:`Company ${i}`,role:"HR Director",stage:"day3_dm",mode:"followups",reason:"Existing cadence is due.",lifecycle:"follow_up",dueAt:"2026-01-01",connectedAt:null,lastAction:null,destination:"https://linkedin.com/in/recorded"});
function componentFixture(state = []) {
 const calls=[],opened=[],next=[],selected=[];
 const mod={exports:{}};
 let hookIndex=0;
 const helpers={exports:{}}; vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/linkedinWorkbench.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:helpers,exports:helpers.exports});
 const react={useState:v=>{const at=hookIndex++;return [at in state?state[at]:v,()=>{}];},useRef:v=>({current:v}),useEffect:()=>{},useCallback:fn=>fn};
 const deps={"react":react,"react/jsx-runtime":jsx,"@/lib/tenantFetch":{tenantFetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({success:true,reconciliationErrors:[]})};}},"@/lib/linkedinWorkbench":helpers.exports,"@/lib/linkedinClipboard":{openAndCopyLinkedIn:async(text,url,browser)=>{browser.open(url);await browser.copy(text);return "Copied";}}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require:id=>{assert.ok(id in deps,id);return deps[id];},AbortController,setTimeout,clearTimeout,window:{open:(...args)=>{opened.push(args);return {opener:{},location:{replace:url=>opened.push([url])}};}},navigator:{clipboard:{writeText:async text=>calls.push({copied:text})}},crypto:{randomUUID:()=>"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},URLSearchParams});
 return {...mod.exports,calls,opened,next,selected};
}
function nodes(node) { if(Array.isArray(node))return node.flatMap(nodes);if(!node || typeof node!=="object")return [];return [node,...nodes(node.props?.children)]; }
function text(node) { if(Array.isArray(node))return node.map(text).join("");if(node==null||typeof node==="boolean")return "";if(typeof node!=="object")return String(node);return text(node.props?.children); }
const props=f=>({item:item(1),queue:{organisationId:"tenant",revision:"3"},initialMessage:"Current edited draft",onDraft:()=>{},onNext:async(...args)=>f.next.push(args),onReload:async()=>{},suspended:false,onWorking:()=>{}});
test("all ten batch rows render selectable with clear selected identity and context",()=>{
 const f=componentFixture(),items=Array.from({length:10},(_,i)=>item(i));
 const tree=f.BatchList({items,selectedId:"contact-4",disabled:false,onSelect:id=>f.selected.push(id)}),buttons=nodes(tree).filter(n=>n.type==="button");
 assert.equal(buttons.length,10);assert.equal(buttons.filter(n=>n.props["aria-pressed"]).length,1);assert.ok(text(buttons[4]).includes("Person 4"));assert.match(renderToStaticMarkup(tree),/Company 9/);assert.match(renderToStaticMarkup(tree),/HR Director/);
 buttons[8].props.onClick();assert.deepEqual(f.selected,["contact-8"]);assert.equal(f.calls.length,0);
});
test("selected identity and action toolbar remain above the independently scrolling message",()=>{
 const f=componentFixture(),tree=f.ContactCard(props(f)),html=renderToStaticMarkup(tree);
 assert.match(html,/Outreach actions for Person 1/);assert.match(html,/sticky top-0/);assert.match(html,/overflow-y-auto/);assert.ok(html.indexOf("Mark sent")<html.indexOf("textarea"));assert.match(html,/Message for Person 1/);assert.match(html,/Company 1/);
});
test("skip stays in console and moves selection without any completion request",async()=>{
 const f=componentFixture(),tree=f.ContactCard(props(f));const skip=nodes(tree).find(n=>n.type==="button"&&text(n)==="Skip");await skip.props.onClick();assert.deepEqual(f.next,[["contact-1",false]]);assert.equal(f.calls.length,0);
});
test("explicit mark sent records the current contact and removes it through the same next-selection callback",async()=>{
 const f=componentFixture(),tree=f.ContactCard(props(f));await nodes(tree).find(n=>n.type==="button"&&text(n)==="Mark sent & next").props.onClick();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.action,"complete");assert.equal(f.calls[0].body.message,"Current edited draft");assert.deepEqual(f.next,[["contact-1",true]]);assert.equal(f.opened.length,0);
});
test("LinkedIn opens separately, copies edited text and never navigates this console or completes a send",async()=>{
 const f=componentFixture(),tree=f.ContactCard(props(f));await nodes(tree).find(n=>n.type==="button"&&text(n)==="Open & Copy").props.onClick();await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(f.opened,[["about:blank","_blank"],["https://linkedin.com/in/recorded"]]);assert.deepEqual(f.calls,[{copied:"Current edited draft"}]);assert.equal(f.next.length,0);
});
test("warnings are compact diagnostics; Responses is an explicit back link, never automatic routing",()=>{
 assert.match(source,/<details><summary[^>]*>Queue diagnostics/);assert.match(source,/inbound replies need attention in Responses/);assert.doesNotMatch(source,/open Responses first|window\.location|router\.(?:push|replace)|location\.href/);
 const f=componentFixture(),html=renderToStaticMarkup(f.default());assert.match(html,/Back to Responses inbox/);assert.match(html,/Queue diagnostics/);
});

test("large legacy and inbound counts leave the valid batch selectable",()=>{
 const items=Array.from({length:10},(_,i)=>item(i)),queue={items,organisationId:"tenant",revision:"3",total:10,identityReviewNeeded:80,unreconciledFollowups:0,repliesNeedingAttention:23};
 const f=componentFixture([false,"all",queue,"contact-3","",false]),tree=f.default(),html=renderToStaticMarkup(tree);
 assert.match(html,/80 identity checks/);assert.match(html,/23.*inbound replies/);assert.match(html,/Person 9/);assert.doesNotMatch(html,/<details open/);
 const list=nodes(tree).find(n=>n.type===f.BatchList);assert.equal(list.props.items.length,10);assert.equal(list.props.disabled,false);
});


test("profile fallback is labelled explicitly; missing destination disables opening",()=>{
 const f=componentFixture();const profileProps=props(f);profileProps.item={...profileProps.item,destinationKind:"profile"};
 assert.match(renderToStaticMarkup(f.ContactCard(profileProps)),/Open profile.*use Message/);
 const g=componentFixture();const noDestination=props(g);noDestination.item={...noDestination.item,destination:null};
 const tree=g.ContactCard(noDestination);assert.equal(nodes(tree).find(n=>n.type==="button" && text(n)==="Open & Copy").props.disabled,true);
});
test("valid follow-up shows exact actual prior message, time, source and next draft",()=>{
 const f=componentFixture(),p=props(f);p.item={...p.item,previousOutbound:{message:"The actual words sent last time.",sentAt:"2026-09-01T09:00:00Z",source:"manual completion receipt",table:"growth_targets",id:"source-id"}};
 const html=renderToStaticMarkup(f.ContactCard(p));assert.match(html,/Previous message/);assert.match(html,/The actual words sent last time/);assert.match(html,/Sent:/);assert.match(html,/manual completion receipt/);assert.match(html,/source-id/);assert.match(html,/Next draft/);
});
