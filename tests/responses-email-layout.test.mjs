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
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,URL,URLSearchParams,AbortController,Event,crypto:globalThis.crypto,console,setTimeout,clearTimeout,...globals,require:n=>n==="@/lib/responseCleanup"?load("lib/responseCleanup.ts"):n in mocks?mocks[n]:n.endsWith(".css")?{}:require(n)});
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
async function page(platform="email",messages=[],failed=false,lifecycleOverrides={}, actions=null) {
 const search=`?platform=${platform}&status=needs_reply&itemId=selected`;
 const calls=[];
 const fetch=async(url,options={})=>{
  calls.push({url,method:options.method||"GET"});if(options.method==="POST"){
   assert.ok(actions,"layout mount must never write or send");
   assert.ok(!url.includes("approve-send")&&!url.endsWith("/reply"),"test must not send");
   if(url==="/api/ai/root-coach")return {ok:true,json:async()=>({coachMessage:"Synthetic editable reply"})};
   if(url.endsWith("/check-reply")){actions.checked=true;return {ok:true,json:async()=>({verified:actions.verified,message:actions.verified?"Recorded outbound verified":"Cannot verify. Nothing marked handled."})};}
   throw Error("Unexpected mutation "+url);
  }
  let data;
  if(url==="/api/social-accounts") data={organisationId:"org"};
  else if(url.startsWith("/api/responses/list")) data={success:true,configured:true,items:actions?.checked && actions?.verified ? [] : [{id:"selected",platform,status:"needs_reply",kind:platform==="email"?"email_reply":"connection_accepted",authorName:"Example Person",text:"Original source message",createdAt:"2026-10-12T12:00:00Z",subject:"Long thread",senderEmail:"business@example.test",lifecycle:{currentStage:"needs_reply",label:"Needs reply",canDraft:true,humanActionRequired:true,nextAction:"Prepare reply",contactId:"contact",...lifecycleOverrides}}]};
  else if(url.startsWith("/api/growth/linkedin-conversation?")) data=failed?{success:false,error:"Conversation unavailable"}:{success:true,contactId:"contact",messages:Array.isArray(messages)?{dated:[],undated:messages}:messages};
  else if(url.includes("/conversation?")) data=failed?{success:false,error:"Conversation unavailable"}:{success:true,messages};
  else if(url.includes("/context?")) data={context:{name:"Example Person",whatWeKnow:[],history:[],whyRelevant:"Relevant recorded context",relationship:"Conversation",objective:"Review and reply"}};
  else throw Error("Unexpected request "+url);
  return {ok:!data.error,json:async()=>data};
 };
 const Page=load("app/dashboard/responses/page.tsx",{
  "@/lib/responseContactContext":{safeLinkedInFirstMessage:()=>""},"../components/ManualTakeover":()=>null,
  "./ResponseLifecycleDetails":load("app/dashboard/responses/ResponseLifecycleDetails.tsx"),"./EmailMessageBody":bodyComponent,
  "./LinkedInConversationHistory":load("app/dashboard/responses/LinkedInConversationHistory.tsx",{},{fetch}),
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
test("LinkedIn selection is compact above a wide platform-specific workspace, never the old narrow right panel",async()=>{
 const {tree,calls}=await page("linkedin");
 const workspace=tree.root.findByProps({"aria-label":"Selected LinkedIn workspace"});assert.match(workspace.props.className,/min-w-0.*lg:col-span-2/);
 const selection=tree.root.findByProps({"aria-label":"Response selection"});assert.match(selection.props.className,/lg:col-span-3/);assert.match(selection.props.className,/max-h-52 overflow-y-auto/);assert.notEqual(selection.props.className,"lg:col-span-2 space-y-3");
 assert.equal(tree.root.findAllByType(bodyComponent.default).length,0);
 assert.equal(tree.root.findByType("aside").findAllByProps({"aria-label":"LinkedIn conversation history"}).length,0);
 assert.ok(workspace.findByProps({"aria-label":"LinkedIn conversation history"}));assert.ok(workspace.findAllByType("textarea").length);
 assert.ok(calls.some(c=>c.url.startsWith("/api/growth/linkedin-conversation?organisationId=org&contactId=contact")));
 assert.ok(!calls.some(c=>c.url.startsWith("/api/responses/email/")));await renderer.act(async()=>tree.unmount());
});

test("Tracy/Jim/Natalie-style pasted snapshots retain every character and remain explicitly undated",async()=>{
 const names=["Tracy","Jim","Natalie"];
 const history={dated:[{id:"first",direction:"outbound",message_at:"2026-10-01T10:00:00Z",message:"First exact outbound"},{id:"second",direction:"inbound",message_at:"2026-10-02T10:00:00Z",message:"Second exact inbound"}],undated:names.map((name,i)=>({id:String(i),direction:"snapshot",message_at:null,confirmed_at:"2026-10-10T10:00:00Z",earliest_outbound_at:i===0?"2026-09-01T10:00:00Z":null,message:`  ${name}  9:30 AM\r\nLinkedIn UI text\nYou: Hello 👋\n${name}: A real reply\n  `}))};
 const {tree}=await page("linkedin",history);
 const panel=tree.root.findByProps({"aria-label":"LinkedIn conversation history"});
 assert.deepEqual(panel.findAllByType("pre").map(node=>node.props.children),[...history.dated,...history.undated].map(entry=>entry.message));
 const text=JSON.stringify(tree.toJSON());assert.match(text,/Undated messages and snapshots/);assert.match(text,/Message date unknown/);assert.match(text,/not the message date/);assert.match(text,/Individual message dates are not inferred/);
 assert.equal(panel.findAllByType("article").length,5);assert.equal(panel.findAllByType("time")[2].props.dateTime,history.undated[0].confirmed_at);
 await renderer.act(async()=>tree.unmount());
});

test("notification without history keeps missing-text warning and AI guard; stored snapshots do not override lifecycle",async()=>{
 for(const messages of [[],[{id:"snapshot",direction:"snapshot",message:"Exact stored history",message_at:null}]]) {
  const {tree}=await page("linkedin",messages,false,{replyDetected:true,missingReplyText:true,canDraft:false});
  const panel=tree.root.findByProps({"aria-label":"LinkedIn conversation history"});
  const text=JSON.stringify(tree.toJSON());assert.equal(text.includes("LinkedIn reply detected — open conversation and paste/log it"),messages.length===0);
  assert.equal(panel.findAllByType("pre").length,messages.length);
  const ai=tree.root.findAllByType("button").find(b=>b.children.includes("AI Suggest"));assert.equal(ai.props.disabled,true);
  assert.ok(panel.findByType("a").props.href.includes("contactId=contact"));await renderer.act(async()=>tree.unmount());
 }
});

test("LinkedIn history read error stays explicit and logging remains available",async()=>{
 const {tree}=await page("linkedin",[],true);const panel=tree.root.findByProps({"aria-label":"LinkedIn conversation history"});assert.equal(panel.findByProps({role:"alert"}).props.children,"Conversation unavailable");assert.equal(panel.findAllByType("pre").length,0);assert.ok(panel.findByType("a"));await renderer.act(async()=>tree.unmount());
});

test("contact switches hide earlier history immediately and reject a mismatched response identity",async()=>{
 const pending=[];
 const fetch=async(url,options)=>new Promise(resolve=>pending.push({url,options,resolve}));
 const Component=load("app/dashboard/responses/LinkedInConversationHistory.tsx",{},{fetch}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Component,{organisationId:"org-a",contactId:"contact-a",replyDetected:true}));});
 await renderer.act(async()=>pending[0].resolve({ok:true,json:async()=>({success:true,contactId:"contact-a",messages:{dated:[],undated:[{id:"old",direction:"snapshot",message:"First contact private history",message_at:null}]}})}));
 assert.match(JSON.stringify(tree.toJSON()),/First contact private history/);
 await renderer.act(async()=>tree.update(React.createElement(Component,{organisationId:"org-a",contactId:"contact-b",replyDetected:true})));
 assert.equal(pending[0].options.signal.aborted,true);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/First contact private history/);assert.match(JSON.stringify(tree.toJSON()),/Loading LinkedIn conversation history/);
 await renderer.act(async()=>pending[1].resolve({ok:true,json:async()=>({success:true,contactId:"contact-a",messages:{dated:[],undated:[{id:"wrong",direction:"snapshot",message:"Must never appear",message_at:null}]}})}));
 assert.match(JSON.stringify(tree.toJSON()),/Could not load LinkedIn conversation history/);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Must never appear/);
 await renderer.act(async()=>tree.unmount());
});

test("email composer reuses editable draft and leaves approval explicit; check does not send",async()=>{
 const actions={verified:false};const {tree,calls}=await page("email",[],false,{},actions);
 let ai=tree.root.findAllByType("button").find(b=>b.children.includes("AI Suggest"));
 await renderer.act(async()=>{await ai.props.onClick();});
 const draft=tree.root.findByProps({id:"response-reply-draft"});assert.equal(draft.props.value,"Synthetic editable reply");
 await renderer.act(async()=>{draft.props.onChange({target:{value:"Human edit"}})});
 assert.equal(tree.root.findByProps({id:"response-reply-draft"}).props.value,"Human edit");
 assert.ok(tree.root.findAllByType("button").some(b=>b.children.includes("Regenerate")));
 assert.ok(tree.root.findAllByType("button").some(b=>b.children.includes("Approve & Send")));
 const check=tree.root.findAllByType("button").find(b=>b.children.includes("Already replied — check current email history"));
 await renderer.act(async()=>{check.props.onClick();await new Promise(resolve=>setTimeout(resolve,0));});
 assert.equal(actions.checked,true);assert.ok(JSON.stringify(tree.toJSON()).includes("Cannot verify. Nothing marked handled."));
 assert.equal(calls.some(c=>c.url.includes("approve-send")),false);
 await renderer.act(async()=>tree.unmount());
});

test("verified history check removes active card, reduces count, and reload does not restore it",async()=>{
 const actions={verified:true};let {tree}=await page("email",[],false,{},actions);
 assert.equal(tree.root.findByProps({"aria-label":"Response state briefing"}).findAllByType("strong")[0].props.children,1);
 const check=tree.root.findAllByType("button").find(b=>b.children.includes("Already replied — check current email history"));
 await renderer.act(async()=>{check.props.onClick();await new Promise(resolve=>setTimeout(resolve,0));});
 assert.equal(tree.root.findByProps({"aria-label":"Response state briefing"}).findAllByType("strong")[0].props.children,0);
 assert.equal(tree.root.findAllByProps({"aria-label":"Selected email workspace"}).length,0);
 await renderer.act(async()=>tree.unmount());
 ({tree}=await page("email",[],false,{},actions));
 assert.equal(tree.root.findByProps({"aria-label":"Response state briefing"}).findAllByType("strong")[0].props.children,0);
 assert.equal(tree.root.findAllByProps({"aria-label":"Selected email workspace"}).length,0);
 await renderer.act(async()=>tree.unmount());
});
