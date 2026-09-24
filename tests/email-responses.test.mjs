import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";import vm from "node:vm";import ts from "typescript";import {createRequire} from "node:module";import {PGlite} from "@electric-sql/pglite";
const nodeRequire=createRequire(import.meta.url),A="78fa2ac8-e7b6-4b9b-9604-035723ece6b1",B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",USER="cccccccc-cccc-4ccc-8ccc-cccccccccccc",ITEM="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function load(file,mocks={},env={},globals={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,require:n=>n in mocks?mocks[n]:nodeRequire(n),process:{env},URL,URLSearchParams,Request,Response,Headers,Buffer,AbortSignal,console,crypto:globalThis.crypto,...globals},{filename:file});return mod.exports;}
const classifier=load("lib/emailResponse.ts");
test("observed acknowledgements and routing examples are classified without false human-reply urgency",()=>{
 const cases=[
  ["Blue Light Card","I have forwarded this internally and we are waiting for Julia to respond","waiting_for_human","waiting_for_human",false],
  ["Cambridge City Council","This tender is now closed","closed_or_lost","closed_or_lost",false],
  ["RM6400 / GCA","Please submit this through our eSourcing portal","redirect","follow_up",false],
  ["MHA","Thank you for contacting us. One of our team will be in touch","auto_acknowledgement","waiting_for_human",false],
  ["Unipart","We have received your enquiry. A colleague will respond","auto_acknowledgement","waiting_for_human",false],
  ["Question","Could you send pricing and availability?","question","needs_reply",true],
 ];
 for(const [s,b,c,state,human] of cases){const r=classifier.normalizeEmailClassification(s,b,"human_positive");assert.deepEqual([r.classification,r.responseState,r.needsHumanReply],[c,state,human]);}
});
test("email response actions enforce operational state transitions",()=>{
 assert.equal(classifier.planEmailResponseAction("needs_reply","engaged").newState,"engaged");
 assert.equal(classifier.planEmailResponseAction("engaged","converted").newState,"converted");
 assert.equal(classifier.planEmailResponseAction("waiting_for_human","set_follow_up").newState,"follow_up");
 assert.throws(()=>classifier.planEmailResponseAction("closed_or_lost","engaged"),/not allowed/);
 assert.throws(()=>classifier.planEmailResponseAction("converted","nurture"),/not allowed/);
});

test("email intake uses stable message dedupe and preserves thread/outreach references",async()=>{
 const stored=new Set(),rows=[];const db={from(table){assert.equal(table,"inbox_items");return{upsert(input,options){assert.equal(options.onConflict,"organisation_id,email_message_id");return{select:async()=>{const data=[];for(const row of input){const key=`${row.organisation_id}:${row.email_message_id}`;if(!stored.has(key)){stored.add(key);rows.push(row);data.push({id:row.id});}}return{data,error:null};}};}};}};
 const helper=load("lib/growthIngestion.server.ts",{}, {GROWTH_INGESTION_KEYS:JSON.stringify([{organisation_id:A,secret:"s".repeat(40),source_engines:["root_health_b2b"]}])});
 const response={NextResponse:{json:(body,o={})=>({body,status:o.status||200})}};
 const route=load("app/api/responses/email/ingest/route.ts",{"next/server":response,"@/lib/supabaseAdmin":{supabaseAdmin:db},"@/lib/growthIngestion.server":helper,"@/lib/emailResponse":classifier});
 const body={organisation_id:A,source_engine:"root_health_b2b",records:[{message_id:"gmail-1",thread_id:"thread-1",in_reply_to:"sent-1",outreach_reference:"lead-42",sender_email:"buyer@example.com",subject:"Re: hello",body:"One of our team will be in touch",classification:"human_positive",proposed_response:"Thanks — we will wait for your colleague."}]};
 const req=()=>new Request("https://ops/api/responses/email/ingest",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${"s".repeat(40)}`},body:JSON.stringify(body)});
 assert.equal((await route.POST(req())).body.inserted,1);assert.equal((await route.POST(req())).body.duplicates,1);
 assert.equal(rows[0].email_thread_id,"thread-1");assert.equal(rows[0].outreach_reference,"lead-42");assert.equal(rows[0].email_classification,"auto_acknowledgement");assert.equal(rows[0].status,"unread");
 assert.equal(rows[0].proposed_response,"Thanks — we will wait for your colleague.");assert.equal(rows[0].email_reply_draft,rows[0].proposed_response);
});

test("engine dispatch sends edited and unedited drafts exactly as approved and tolerates missing Gmail refs",async()=>{
 const sent=[];const env={B2B_ENGINE_ENDPOINTS:JSON.stringify([{organisation_id:A,source_engine:"root_health_b2b",url:"https://engine.example/send",secret:"x".repeat(40)}])};
 const dispatch=load("lib/emailEngineDispatch.server.ts",{},env,{fetch:async(_url,init)=>{sent.push(JSON.parse(init.body));return new Response(JSON.stringify({accepted:true,idempotency_key:sent.at(-1).idempotency_key}),{status:202,headers:{"content-type":"application/json"}});}});
 for(const approved_body of ["Original proposed response.","Edited by the approving human — exactly this text."]){await dispatch.dispatchApprovedEmail({organisation_id:A,response_item_id:ITEM,send_request_id:crypto.randomUUID(),source_engine:"root_health_b2b",gmail_thread_id:null,gmail_message_id:null,in_reply_to:null,recipient:"buyer@example.com",subject:"Re: Hello",approved_body,idempotency_key:crypto.randomUUID()});}
 assert.deepEqual(sent.map(x=>x.approved_body),["Original proposed response.","Edited by the approving human — exactly this text."]);assert.equal(sent[0].gmail_thread_id,null);assert.equal(sent[0].gmail_message_id,null);
});

test("email action route requires tenant write membership and scopes email item before RPC",async()=>{
 const response={NextResponse:{json:(body,o={})=>({body,status:o.status||200})}};
 for(const mode of ["denied","foreign","ok"]){const calls=[];class AccessError extends Error{constructor(){super("denied");this.status=403;}}
  const auth={requireOrganisation:async(id,write)=>{assert.equal(id,A);assert.equal(write,true);if(mode==="denied")throw new AccessError();return{organisationId:A,userId:USER};},accessErrorResponse:e=>e instanceof AccessError?response.NextResponse.json({error:e.message},{status:e.status}):null};
  const db={from(){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async maybeSingle(){calls.push(filters);return{data:mode==="foreign"?null:{id:ITEM},error:null};}};return q;},async rpc(name,args){calls.push({name,args});return{data:[{id:ITEM,response_state:"nurture"}],error:null};}};
  const route=load("app/api/responses/email/[id]/action/route.ts",{"next/server":response,"@/lib/tenantAuth":auth,"@/lib/supabaseAdmin":{supabaseAdmin:db},"@/lib/growthIngestion.server":{uuid:/^[0-9a-f-]{36}$/i},"@/lib/emailResponse":classifier});
  const req=new Request("https://ops/action",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer ingestion-secret"},body:JSON.stringify({organisationId:A,action:"nurture",idempotencyKey:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"})});
  const result=await route.POST(req,{params:Promise.resolve({id:ITEM})});assert.equal(result.status,mode==="denied"?403:mode==="foreign"?404:200);if(mode==="ok"){assert.ok(calls[0].organisation_id===A&&calls[0].platform==="email");assert.equal(calls[1].name,"apply_email_response_action");}else assert.equal(calls.some(c=>c.name),false);
 }
});

test("approve-send rejects wrong tenants, deduplicates approvals and leaves failed dispatch retryable",async()=>{
 const response={NextResponse:{json:(body,o={})=>({body,status:o.status||200})}};const SEND="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
 for(const mode of ["denied","foreign","duplicate","failure","success"]){const writes=[];let dispatches=0;class AccessError extends Error{constructor(){super("denied");this.status=403;}}
  const auth={requireOrganisation:async()=>{if(mode==="denied")throw new AccessError();return{organisationId:A,userId:USER};},accessErrorResponse:e=>e instanceof AccessError?response.NextResponse.json({error:e.message},{status:e.status}):null};
  const db={from(table){let op="select",payload=null;const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},insert(v){op="insert";payload=v;return q;},update(v){op="update";payload=v;writes.push({table,payload:v,filters});return q;},upsert(v){writes.push({table,payload:v});return Promise.resolve({data:null,error:null});},async maybeSingle(){if(table==="inbox_items"&&op==="select")return{data:mode==="foreign"?null:{id:ITEM,sender_email:"buyer@example.com",email_subject:"Re: hello",email_thread_id:null,email_message_id:"gmail-in",in_reply_to:null,source_engine:"root_health_b2b"},error:null};if(table==="email_send_requests"&&op==="insert")return mode==="duplicate"?{data:null,error:{code:"23505"}}:{data:{id:SEND,...payload},error:null};if(table==="email_send_requests")return{data:{id:SEND,status:"accepted",approved_body:"Exact approved text"},error:null};return{data:null,error:null};},then(resolve){resolve({data:null,error:null});}};return q;}};
  const route=load("app/api/responses/email/[id]/approve-send/route.ts",{"next/server":response,"@/lib/tenantAuth":auth,"@/lib/supabaseAdmin":{supabaseAdmin:db},"@/lib/growthIngestion.server":{uuid:/^[0-9a-f-]{36}$/i},"@/lib/emailEngineDispatch.server":{dispatchApprovedEmail:async instruction=>{dispatches++;assert.equal(instruction.approved_body,"Exact approved text");if(mode==="failure")throw Error("offline");return{accepted:true};}}});
  const req=new Request("https://ops/approve",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organisationId:A,approvedBody:"Exact approved text",idempotencyKey:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"})});
  const result=await route.POST(req,{params:Promise.resolve({id:ITEM})});
  assert.equal(result.status,mode==="denied"?403:mode==="foreign"?404:mode==="duplicate"||mode==="success"?202:502,mode);
  if(mode==="duplicate")assert.equal(dispatches,0);if(mode==="failure"){assert.equal(dispatches,1);assert.ok(writes.some(w=>w.table==="email_send_requests"&&w.payload.status==="failed"));assert.ok(writes.some(w=>w.table==="inbox_items"&&w.payload.email_delivery_status==="failed"));}
 }
});

test("email migration enforces dedupe, tenant isolation and idempotent action events",async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table organisations(id uuid primary key);insert into organisations values('${A}'),('${B}');create table inbox_items(id uuid primary key,organisation_id uuid not null references organisations(id),platform text,status text,text text,last_reply_text text,last_replied_at timestamptz);`);
 await db.exec(fs.readFileSync("supabase/migrations/20260924130000_email_response_intake.sql","utf8"));
 await db.query("insert into inbox_items(id,organisation_id,platform,status,text,email_message_id,response_state) values($1,$2,'email','needs_reply','Hi','m1','needs_reply')",[ITEM,A]);
 await assert.rejects(db.query("insert into inbox_items(id,organisation_id,platform,status,text,email_message_id) values(gen_random_uuid(),$1,'email','unread','Again','m1')",[A]),/unique/);
 const key="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";const apply=()=>db.query("select response_state from apply_email_response_action($1,$2,$3,'nurture','nurture','archived',null,null,$4)",[A,ITEM,USER,key]);
 assert.equal((await apply()).rows[0].response_state,"nurture");await apply();assert.equal((await db.query("select count(*)::int n from response_item_events")).rows[0].n,1);
 await assert.rejects(db.query("select * from apply_email_response_action($1,$2,$3,'nurture','nurture','archived',null,null,$4)",[B,ITEM,USER,"ffffffff-ffff-4fff-8fff-ffffffffffff"]),/not_found/);
 await db.exec("set role authenticated");await assert.rejects(db.query("select * from response_item_events"),/permission denied/);
 }finally{await db.close();}});

test("email send migration prevents duplicate approvals and applies tenant-scoped sent and failed acknowledgements",async()=>{const db=new PGlite();try{
 const ITEM2="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",REQ="dddddddd-dddd-4ddd-8ddd-dddddddddddd",REQ2="dddddddd-dddd-4ddd-8ddd-ddddddddddde";
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table organisations(id uuid primary key);insert into organisations values('${A}'),('${B}');create table inbox_items(id uuid primary key,organisation_id uuid not null references organisations(id),platform text,status text,text text,last_reply_text text,last_replied_at timestamptz);`);
 await db.exec(fs.readFileSync("supabase/migrations/20260924130000_email_response_intake.sql","utf8"));
 await db.exec(fs.readFileSync("supabase/migrations/20260924170000_human_approved_email_sending.sql","utf8"));
 await db.query("insert into inbox_items(id,organisation_id,platform,status,text,response_state,source_engine) values($1,$2,'email','needs_reply','Hi','needs_reply','root_health_b2b'),($3,$2,'email','needs_reply','Again','needs_reply','root_health_b2b')",[ITEM,A,ITEM2]);
 const insert="insert into email_send_requests(id,organisation_id,inbox_item_id,actor_user_id,source_engine,recipient,subject,approved_body,approval_idempotency_key,status) values($1,$2,$3,$4,'root_health_b2b','buyer@example.com','Re: hello','Exact approved body',$5,'accepted')";
 await db.query(insert,[REQ,A,ITEM,USER,"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]);
 await assert.rejects(db.query(insert,[crypto.randomUUID(),A,ITEM,USER,crypto.randomUUID()]),/unique/);
 await assert.rejects(db.query("select * from acknowledge_email_send($1,$2,$3,'root_health_b2b','sent','gmail-sent','thread-1',now(),null)",[B,ITEM,REQ]),/not_found/);
 await db.query("select * from acknowledge_email_send($1,$2,$3,'root_health_b2b','sent','gmail-sent','thread-1',now(),null)",[A,ITEM,REQ]);
 const sent=(await db.query("select status,email_sent_message_id,email_sent_thread_id,last_reply_text from inbox_items where id=$1",[ITEM])).rows[0];assert.deepEqual([sent.status,sent.email_sent_message_id,sent.email_sent_thread_id,sent.last_reply_text],["replied","gmail-sent","thread-1","Exact approved body"]);
 await db.query(insert,[REQ2,A,ITEM2,USER,"ffffffff-ffff-4fff-8fff-ffffffffffff"]);
 await db.query("select * from acknowledge_email_send($1,$2,$3,'root_health_b2b','failed',null,null,null,'temporary failure')",[A,ITEM2,REQ2]);
 assert.equal((await db.query("select email_delivery_status from inbox_items where id=$1",[ITEM2])).rows[0].email_delivery_status,"failed");
 assert.equal((await db.query("update email_send_requests set status='dispatching' where id=$1 returning status",[REQ2])).rows[0].status,"dispatching");
 assert.equal((await db.query("select count(*)::int n from email_send_events where send_request_id in ($1,$2)",[REQ,REQ2])).rows[0].n,2);
 }finally{await db.close();}});

test("Responses UI offers human approval through the engine without adding email to the social sender",()=>{const ui=fs.readFileSync("app/dashboard/responses/page.tsx","utf8");assert.ok(ui.includes('email: "Email"'));assert.ok(ui.includes('Approve & Send'));assert.ok(ui.includes('/approve-send'));assert.ok(ui.includes('emailReplyDraft || item.proposedResponse'));const reply=fs.readFileSync("app/api/responses/reply/route.ts","utf8");assert.equal(reply.includes('platform === "email"'),false);});
