import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import {renderToStaticMarkup} from "react-dom/server";
function load(file,deps={},globals={}) {
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
 {module:m,exports:m.exports,URL,require:n=>{assert.ok(n in deps,n);return deps[n];},...globals},{filename:file});return m.exports;
}
const outreach=load("lib/growthOutreach.ts",{"@/lib/linkedinSendEvidence":load("lib/linkedinSendEvidence.ts")});
const lifecycle=load("lib/contactLifecycle.ts",{"@/lib/growthOutreach":outreach,"@/lib/engineState":load("lib/engineState.ts")});
const presentation=load("lib/responseLifecycle.ts",{"@/lib/contactLifecycle":lifecycle});
const parser=load("lib/linkedinMessageNotification.ts",{"@/lib/contactLifecycle":lifecycle});
const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", foreign="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const identity="linkedin.com/in/debbie-bartlett-172523a8", time="2026-10-12T13:52:00Z";
const mail={sender:"Debbie Bartlett via LinkedIn <messaging-digest-noreply@linkedin.com>",subject:"Debbie just messaged you",gmail_message_id:"1a13062900c62444",received_at:time,
 html:'1 new message awaits your response <a href="https://uk.linkedin.com/comm/in/debbie-bartlett-172523a8?otpToken=not-stored">Debbie</a><a href="https://www.linkedin.com/comm/messaging/thread/real-thread?midToken=not-stored">View message</a>'};
const notification=parser.parseLinkedInMessageNotification(mail,Date.parse(time));
const inbox={id:"accepted",organisation_id:org,platform:"linkedin",kind:"connection_accepted",linkedin_identity:identity,author_name:"Debbie Bartlett",status:"replied",response_state:"engaged",response_updated_at:"2026-10-10T10:00:00Z",last_replied_at:"2026-10-10T10:00:00Z",contacted_at:"2026-10-10T10:00:00Z",text:"Connection accepted",raw:{source_gmail_message_id:"acceptance-id"},manual_completion:{key:"sent",message:"Exact first message"}};
const target={id:"target",organisation_id:org,linkedin_identity:identity,stage:"day3_dm",status:"active",reply_status:"no_reply",last_action_at:"2026-10-10T10:00:00Z"};
const notified=()=>({...inbox,...parser.notificationPatch(inbox,notification)});
const input=(row=notified(),targets=[{...target,linkedin_conversation_active:true}])=>({inbox_items:[row],growth_targets:targets,acquisition_items:[]});
const state=data=>presentation.responseLifecycleMap(org,data).get("accepted");

test("verified digest maps one canonical identity and strips email login tokens",()=>{
 assert.ok(notification);assert.equal(notification.identity,identity);assert.equal(notification.messageUrl,"https://www.linkedin.com/messaging/thread/real-thread");
 assert.ok(!JSON.stringify(notification).includes("not-stored"));assert.equal(notification.receivedAt,new Date(time).toISOString());
 assert.equal(notification.message,undefined);assert.equal(notification.sentiment,undefined);
});
test("spoofed sender, ambiguous identity, absent thread, acceptance and invalid dates fail closed",()=>{
 for(const patch of [{sender:"messaging-digest-noreply@linkedin.com.evil.test"},{subject:"accepted your invitation"},{received_at:"garbage"},{received_at:"2099-01-01"},{gmail_message_id:""},{html:'1 new message awaits your response <a href="https://linkedin.com/in/debbie">Profile</a>'},{html:mail.html+'<a href="https://linkedin.com/in/another-person">Other</a>'},{html:mail.html.replace("https://www.linkedin.com/comm/messaging", "https://evil.test/comm/messaging")},{html:mail.html+'<a href="https://www.linkedin.com/messaging/thread/other-thread">Ambiguous thread</a>'}]) assert.equal(parser.parseLinkedInMessageNotification({...mail,...patch},Date.parse(time)),null);
});
test("receipt append preserves acceptance, exact sends and raw evidence; replay is idempotent",()=>{
 const patch=parser.notificationPatch(inbox,notification),row={...inbox,...patch};
 assert.equal(patch.status,undefined);assert.equal(patch.response_state,undefined);assert.equal(patch.response_updated_at,undefined);
 assert.equal(row.raw.source_gmail_message_id,"acceptance-id");assert.equal(row.manual_completion.message,"Exact first message");assert.equal(row.contacted_at,inbox.contacted_at);
 assert.equal(row.raw.linkedin_message_notifications.length,1);assert.equal(parser.notificationPatch(row,notification),null);
 const newer={...notification,gmailMessageId:"1a13062900c62445",receivedAt:"2026-10-13T10:00:00Z"};
 const next={...row,...parser.notificationPatch(row,newer)};assert.equal(next.raw.linkedin_message_notifications.length,2);
 assert.equal(parser.notificationPatch(next,{...notification,gmailMessageId:"1a13062900c62446"}).linkedin_message_url,newer.messageUrl);
});
test("notification overrides old acceptance/send and active flag to Needs reply, never Engaged",()=>{
 const result=state(input());assert.equal(result.currentStage,"needs_reply");assert.equal(result.label,"Needs reply / LinkedIn reply detected");
 assert.equal(result.nextDueDate,null);assert.equal(result.canMarkContacted,false);assert.equal(result.canDraft,false);assert.equal(result.missingReplyText,true);
 assert.equal(result.humanActionRequired,true);assert.equal(result.lastAction.action,"linkedin_reply_detected");
 assert.equal(presentation.responseAttention(org,input()).count,1);
});
test("actual recorded inbound text permits drafting but does not clear unresolved attention",()=>{
 const result=state(input({...notified(),linkedin_recorded_reply_text:"Actual message supplied by user"}));
 assert.equal(result.canDraft,true);assert.equal(result.currentStage,"needs_reply");assert.equal(result.missingReplyText,false);
});
test("later explicit handling clears beacon; subsequent genuine notification reopens it",()=>{
 const handled={...notified(),response_state:"engaged",response_updated_at:"2026-10-12T15:00:00Z"};
 assert.equal(state(input(handled)).currentStage,"engaged");assert.equal(presentation.responseAttention(org,input(handled)).count,0);
 const next={...notification,gmailMessageId:"1a13062900c62445",receivedAt:"2026-10-13T10:00:00Z"};
 assert.equal(state(input({...handled,...parser.notificationPatch(handled,next)})).currentStage,"needs_reply");
});
test("stronger CRM states suppress unresolved alert without changing source receipts",()=>{
 for(const [patch,stage] of [[{deal_stage:"meeting"},"meeting"],[{deal_stage:"lost"},"lost"],[{deal_stage:"won"},"converted"],[{stage:"parked"},"nurture"],[{reply_status:"interested",replied_at:"2026-10-13T10:00:00Z"},"engaged"]]) {
  const data=input(notified(),[{...target,...patch}]);assert.equal(state(data).currentStage,stage);assert.equal(presentation.responseAttention(org,data).count,0);
 }
});
test("attention is scoped and deep-links the correct inbox owner; acceptance/follow-up are never red",()=>{
 const data=input();data.inbox_items.push({...notified(),id:"foreign",organisation_id:foreign});
 const attention=presentation.responseAttention(org,data);assert.equal(attention.count,1);assert.equal(attention.channels.linkedin.count,1);assert.ok(attention.href.includes("itemId=accepted"));
 assert.equal(presentation.responseAttention(org,input({...inbox,status:"needs_reply",response_state:"needs_reply",manual_completion:null,last_replied_at:null,contacted_at:null},[])).count,0);
});
test("email attention dedupes exact handled thread and retains independent human reply threads",()=>{
 const email={organisation_id:org,platform:"email",kind:"email_reply",sender_email:"chair@isma.org.uk",status:"needs_reply",response_state:"needs_reply",email_classification:"question",email_message_id:"email-1",text:"Question",created_at_platform:"2026-10-09",email_thread_id:"A"};
 const data={inbox_items:[{...email,id:"old"},{...email,id:"answered",email_thread_id:"B",response_state:"engaged",status:"replied",email_delivery_status:"sent",email_sent_at:"2026-10-10"},{...email,id:"olderB",email_thread_id:"B"}],growth_targets:[],acquisition_items:[]};
 const attention=presentation.responseAttention(org,data);assert.equal(attention.count,1);assert.ok(attention.href.includes("itemId=old"));
 for(const classification of ["auto_acknowledgement","bounce","redirect","out_of_office","waiting_for_human"]) {
  data.inbox_items=[{...email,id:"automatic",email_classification:classification}];assert.equal(presentation.responseAttention(org,data).count,0);
 }
});
test("badge hides at zero, has red compact count, and accessible singular/plural text",()=>{
 const Badge=load("app/dashboard/components/ResponseAttentionBadge.tsx",{"react/jsx-runtime":jsx}).default;
 assert.equal(renderToStaticMarkup(Badge({count:0})),"");
 assert.match(renderToStaticMarkup(Badge({count:1})),/1 response needs.*attention/);
 assert.match(renderToStaticMarkup(Badge({count:3})),/bg-red-500/);assert.match(renderToStaticMarkup(Badge({count:3})),/3 responses need.*attention/);
});

function database(seed,options={}) {
 const stored=structuredClone(seed);let writes=0;
 const admin={from(table){const filters=[];let patch=null,range=null,single=false;
  const q={maybeSingle(){single=true;return q;},select(){return q;},order(){return q;},in(k,values){filters.push(r=>values.includes(r[k]));return q;},eq(k,v){filters.push(r=>typeof r[k]==="object" ? JSON.stringify(r[k])===v : r[k]===v);return q;},is(k,v){filters.push(r=>r[k]==null && v==null);return q;},range(a,b){range=[a,b];return q;},update(value){patch=value;return q;},then(resolve){
   if(patch && options.failTarget && table==="growth_targets") {options.failTarget=false;return Promise.resolve({data:null,error:Error("temporary target failure")}).then(resolve);}
   if(patch && options.concurrent && table==="inbox_items") {stored.inbox_items[0].raw.concurrent="preserved";options.concurrent=false;}
   let rows=(stored[table]||[]).filter(r=>filters.every(f=>f(r)));if(range)rows=rows.slice(range[0],range[1]+1);
   if(patch){writes++;rows.forEach(r=>Object.assign(r,structuredClone(patch)));}
   return Promise.resolve({data:single ? rows[0] || null : rows,error:null}).then(resolve);
  }};return q;}};
 return {admin,stored,get writes(){return writes;}};
}
test("service CAS preserves concurrent evidence and dedupes replay with partial-target recovery",async()=>{
 const db=database({inbox_items:[inbox],growth_targets:[target]},{concurrent:true,failTarget:true});
 const service=load("lib/linkedinMessageNotification.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db.admin},"@/lib/contactLifecycle":lifecycle,"@/lib/linkedinMessageNotification":parser});
 await assert.rejects(service.ingestLinkedInNotification(org,notification));
 assert.equal(db.stored.inbox_items[0].raw.concurrent,"preserved");assert.equal(db.stored.inbox_items[0].raw.linkedin_message_notifications.length,1);
 const result=await service.ingestLinkedInNotification(org,notification);assert.equal(result.duplicate,true);assert.equal(db.stored.growth_targets[0].linkedin_conversation_active,true);
 assert.equal(db.stored.inbox_items[0].manual_completion.message,"Exact first message");assert.equal(db.stored.inbox_items[0].response_state,"engaged");assert.equal(state(db.stored).currentStage,"needs_reply");
});
test("service refuses cross-tenant, missing and ambiguous relationships without insertion",async()=>{
 for(const rows of [[],[{...inbox,organisation_id:foreign}],[inbox,{...inbox,id:"duplicate"}]]) {
  const db=database({inbox_items:rows,growth_targets:[]});
  const service=load("lib/linkedinMessageNotification.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db.admin},"@/lib/contactLifecycle":lifecycle,"@/lib/linkedinMessageNotification":parser});
  await assert.rejects(service.ingestLinkedInNotification(org,notification));assert.equal(db.writes,0);
 }
});
test("worker is bounded, read-only Gmail, uses existing properties and leaves wrapper/trigger work deferred",()=>{
 const worker=fs.readFileSync("docs/linkedin-message-notification-intake.gs","utf8");
 assert.match(worker,/newer_than:14d/);assert.match(worker,/0, 50/);assert.match(worker,/OPS_INGESTION_SECRET/);
 assert.doesNotMatch(worker,/sendEmail|createTrigger|markRead|addLabel|sendMessage/);
 assert.match(worker,/acceptances.messageNotifications/);assert.match(worker,/received_at: message.getDate/);
});

test("explicit handling appends actor/evidence, keeps old send receipts and clears attention",async()=>{
 const db=database({inbox_items:[notified()],growth_targets:[{...target,linkedin_conversation_active:true}],acquisition_items:[]});
 const service=load("lib/linkedinMessageNotification.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db.admin},"@/lib/contactLifecycle":lifecycle,"@/lib/linkedinMessageNotification":parser});
 const body={id:"accepted",notificationId:notification.gmailMessageId,confirmed:true,evidence:"Read the reply in LinkedIn; no response is required."};
 await assert.rejects(service.resolveLinkedInNotification(org,"actor",{...body,confirmed:false}));
 await assert.rejects(service.resolveLinkedInNotification(org,"actor",{...body,notificationId:"wrong"}));
 await service.resolveLinkedInNotification(org,"actor",body);
 const row=db.stored.inbox_items[0];assert.equal(row.raw.linkedin_reply_dispositions[0].actor,"actor");assert.equal(row.manual_completion.message,"Exact first message");
 assert.equal(row.last_replied_at,inbox.last_replied_at);assert.equal(row.contacted_at,inbox.contacted_at);
 assert.equal(presentation.responseAttention(org,db.stored).count,0);assert.equal((await service.resolveLinkedInNotification(org,"actor",body)).duplicate,true);
});
test("a handled notification never enables AI using missing reply content",()=>{
 const row={...notified(),response_state:"no_reply_needed",response_updated_at:"2026-10-13T12:00:00Z"};
 assert.equal(state(input(row)).canDraft,false);
 const next={...notification,gmailMessageId:"1a13062900c62445",receivedAt:"2026-10-14T10:00:00Z"};
 assert.equal(state(input({...row,...parser.notificationPatch(row,next)})).currentStage,"needs_reply");
});
test("newer notification racing manual handling is not silently cleared",async()=>{
 const db=database({inbox_items:[notified()],growth_targets:[]},{concurrent:true});
 const service=load("lib/linkedinMessageNotification.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db.admin},"@/lib/contactLifecycle":lifecycle,"@/lib/linkedinMessageNotification":parser});
 await assert.rejects(service.resolveLinkedInNotification(org,"actor",{id:"accepted",notificationId:notification.gmailMessageId,confirmed:true,evidence:"Handled in LinkedIn manually"}));
 assert.equal(db.stored.inbox_items[0].response_state,inbox.response_state);assert.equal(db.stored.inbox_items[0].raw.linkedin_reply_dispositions,undefined);
});
test("Preview rehearsal cannot run in Production and has no write dependency",async()=>{
 let reads=0;
 const route=load("app/api/growth/linkedin-connections/message-notifications/rehearsal/route.ts",{
 "next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
 "@/lib/tenantRoute.server":{withTenantRoute:(fn,options)=>{assert.equal(options.write,false);return req=>fn(req,{organisationId:org});}},
 "@/lib/lifecycleSnapshot.server":{readLifecycleInput:async()=>{reads++;return input();}},
 "@/lib/contactLifecycle":lifecycle,"@/lib/responseLifecycle":presentation,"@/lib/linkedinMessageNotification":parser,
 },{process:{env:{VERCEL_ENV:"production"}}});
 assert.equal((await route.POST({json:async()=>mail})).status,404);assert.equal(reads,0);
});

test("attention orders a notification by the real receipt time, not the old acceptance/send",()=>{
 const data=input();data.inbox_items.push({id:"email-current",organisation_id:org,platform:"email",kind:"email_reply",sender_email:"business@example.test",status:"needs_reply",response_state:"needs_reply",email_classification:"question",email_message_id:"verified-email",text:"Real question",created_at_platform:"2026-10-11T10:00:00Z"});
 const attention=presentation.responseAttention(org,data);assert.equal(attention.count,2);assert.ok(attention.href.includes("itemId=accepted"));
});

test("stored conversation lookup accepts profile-only relationships and exact inbound-confirmed snapshots",async()=>{
 const row={...notified(),linkedin_identity:null,permalink:`https://${identity}`};
 const exact="Debbie: exact reply 👋\nLinkedIn UI text preserved";
 const messages=[
 {id:"old",organisation_id:org,linkedin_identity:identity,direction:"inbound",message:"Older conversation",confirmed_at:"2026-10-11T10:00:00Z"},
 {id:"outbound",organisation_id:org,linkedin_identity:identity,direction:"outbound",message:"Own message",confirmed_at:"2026-10-13T10:00:00Z"},
 {id:"unconfirmed",organisation_id:org,linkedin_identity:identity,direction:"snapshot",contains_inbound_reply:false,message:"Unconfirmed thread",confirmed_at:"2026-10-13T10:00:00Z"},
 {id:"foreign",organisation_id:foreign,linkedin_identity:identity,direction:"inbound",message:"Foreign text",confirmed_at:"2026-10-13T10:00:00Z"},
 {id:"actual",organisation_id:org,linkedin_identity:identity,direction:"snapshot",contains_inbound_reply:true,message:exact,confirmed_at:"2026-10-13T10:00:00Z"},
 ];
 const db=database({inbox_items:[row],growth_targets:[],acquisition_items:[],linkedin_conversation_messages:messages});
 const snapshot=load("lib/lifecycleSnapshot.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db.admin},"@/lib/contactLifecycle":lifecycle,"@/lib/linkedinCadenceBackfill":{planLinkedInCadenceBackfill:(org,input)=>({projected:input})}});
 const data=await snapshot.readLifecycleInput(org);assert.equal(data.inbox_items[0].linkedin_recorded_reply_text,exact);
 assert.equal(state(data).canDraft,true);assert.equal(state(data).currentStage,"needs_reply");assert.equal(db.writes,0);
});
test("absence of actual inbound text remains fail-closed after snapshot reads",async()=>{
 const db=database({...input(),linkedin_conversation_messages:[]});
 const snapshot=load("lib/lifecycleSnapshot.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db.admin},"@/lib/contactLifecycle":lifecycle,"@/lib/linkedinCadenceBackfill":{planLinkedInCadenceBackfill:(org,input)=>({projected:input})}});
 assert.equal(state(await snapshot.readLifecycleInput(org)).canDraft,false);assert.equal(db.writes,0);
});
