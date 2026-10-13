import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url);
const React=require("react"), renderer=require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,mocks={},globals={}) {
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,URL,URLSearchParams,AbortController,Event,console,setTimeout,clearTimeout,...globals,require:n=>n in mocks?mocks[n]:require(n)});
 return m.exports;
}
const bodyComponent=load("app/dashboard/responses/EmailMessageBody.tsx");
for(const ending of ["Kind regards,\r\nA name\r\nLegal notice", "-- \nSignature \u{1F44B}\nQuoted previous email", "This email is confidential.\nDo not distribute."]) {
 test("footer is subordinate without losing a character: "+ending.split("\n")[0],()=>{
  const body="Please arrange a follow-up.\n\n"+ending;
  const parts=bodyComponent.splitEmailFooter(body);assert.equal(parts.content+parts.footer,body);assert.ok(parts.footer);
  const html=require("react-dom/server").renderToStaticMarkup(React.createElement(bodyComponent.default,{body}));
  assert.match(html,/<details/);assert.doesNotMatch(html,/<details open/);assert.match(html,/Please arrange a follow-up/);
 });
}
test("unrecognised body and opening disclaimer remain fully visible; HTML stays escaped",()=>{
 for(const body of ["Discuss regards and our next steps.\nNo sign-off", "Please review.\nThis message is intended to summarise our next steps.\nPlease reply when ready.", "This email is confidential.\nThe whole message", "<script>alert(1)</script>\nMeaningful text"]) {
  assert.equal(bodyComponent.splitEmailFooter(body).content,body);assert.equal(bodyComponent.splitEmailFooter(body).footer,"");
 }
 const html=require("react-dom/server").renderToStaticMarkup(React.createElement(bodyComponent.default,{body:"<script>alert(1)</script>"}));assert.ok(!html.includes("<script>"));
});
async function page(platform="email",messages=[],failed=false) {
 const search=`?platform=${platform}&status=needs_reply&itemId=selected`;
 const calls=[];
 const fetch=async(url,options={})=>{
  calls.push({url,method:options.method||"GET"});assert.equal(options.method||"GET","GET","layout mount must never write or send");
  let data;
  if(url==="/api/social-accounts") data={organisationId:"org"};
  else if(url.startsWith("/api/responses/list")) data={success:true,configured:true,items:[{id:"selected",platform,status:"needs_reply",kind:platform==="email"?"email_reply":"connection_accepted",authorName:"Example Person",text:"Original source message",createdAt:"2026-10-12T12:00:00Z",subject:"Long thread",senderEmail:"business@example.test",lifecycle:{currentStage:"needs_reply",label:"Needs reply",canDraft:true,humanActionRequired:true,nextAction:"Prepare reply",contactId:"contact"}}]};
  else if(url.includes("/conversation?")) data=failed?{success:false,error:"Conversation unavailable"}:{success:true,messages};
  else if(url.includes("/context?")) data={context:{name:"Example Person",whatWeKnow:[],history:[],whyRelevant:"Relevant recorded context",relationship:"Conversation",objective:"Review and reply"}};
  else throw Error("Unexpected request "+url);
  return {ok:!data.error,json:async()=>data};
 };
 const Page=load("app/dashboard/responses/page.tsx",{
  "@/lib/responseContactContext":{safeLinkedInFirstMessage:()=>""},"../components/ManualTakeover":()=>null,
  "./ResponseLifecycleDetails":load("app/dashboard/responses/ResponseLifecycleDetails.tsx"),"./EmailMessageBody":bodyComponent,
  "./LinkedInReplyResolution":()=>null,"@/lib/tenantFetch":{tenantFetch:fetch},"next/navigation":{useSearchParams:()=>new URLSearchParams(search)},
 },{fetch,window:{location:{search},localStorage:{getItem:()=>null},dispatchEvent(){},scrollY:0,scrollTo(){}},requestAnimationFrame:fn=>fn()}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Page));});return {tree,calls};
}
test("email thread and reply controls occupy wide main workspace; context rail has no messages",async()=>{
 const messages=[{id:"first",direction:"inbound",body:"First received message",sent_at:"2026-10-10",sender_email:"business@example.test"},{id:"second",direction:"outbound",body:"Later sent message\n\nKind regards\nSignature",sent_at:"2026-10-11",recipient_email:"business@example.test"}];
 const {tree,calls}=await page("email",messages);
 const workspace=tree.root.findByProps({"aria-label":"Selected email workspace"});assert.match(workspace.props.className,/lg:col-span-2/);
 const conversation=workspace.findByProps({"aria-label":"Email conversation"});assert.equal(conversation.findAllByType("article").length,2);
 const text=JSON.stringify(conversation.toJSON?.()||conversation.findAllByType("article").map(a=>a.findByType(bodyComponent.default).props.body));assert.ok(text.indexOf("First received message")<text.indexOf("Later sent message"));
 assert.ok(workspace.findAllByType("textarea").length);const aside=tree.root.findByType("aside");assert.equal(aside.findAllByType(bodyComponent.default).length,0);
 assert.equal(calls.filter(c=>c.method!=="GET").length,0);await renderer.act(async()=>tree.unmount());
});
test("empty or failed thread fetch retains original selected source text",async()=>{
 for(const failed of [false,true]) {const {tree}=await page("email",[],failed);assert.equal(tree.root.findByType(bodyComponent.default).props.body,"Original source message");await renderer.act(async()=>tree.unmount());}
});
test("LinkedIn keeps original list/assistant placement and never fetches an email thread",async()=>{
 const {tree,calls}=await page("linkedin");assert.equal(tree.root.findAllByType("aside").length,0);assert.equal(tree.root.findAllByType(bodyComponent.default).length,0);
 assert.equal(tree.root.findByProps({"aria-label":"Response selection"}).props.className,"lg:col-span-2 space-y-3");assert.ok(!calls.some(c=>c.url.includes("/conversation?")));await renderer.act(async()=>tree.unmount());
});
