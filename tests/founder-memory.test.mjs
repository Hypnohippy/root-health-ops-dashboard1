import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
const require=createRequire(import.meta.url);
function load(file,mocks={}) {const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Date,console,require:name=>name==="@/lib/relationshipIntake.server"&&!(name in mocks)?{readRelationshipIntake:async()=>assert.fail("Unexpected intake read")}:name in mocks?mocks[name]:name.startsWith("@/")?load(name.replace("@/","")+".ts",mocks):require(name)});return mod.exports;}
const memory=load("lib/founderMemory.ts"),search=load("lib/opsSearch.ts");
const org=randomUUID(),other=randomUUID(),actor=randomUUID(),recordId=randomUUID(),acquisitionId=randomUUID();
const contact={name:"Alex",emailStatus:"verified",directEmail:"alex@example.org",linkedinUrl:"https://linkedin.com/in/alex-professional",sourceUrls:["https://linkedin.com/in/alex-professional"]};
const research={name:"Example Organisation",website:"https://www.example.org/about",lane:"workplace_buyers",geography:"UK",sourceUrls:["https://example.org/team"],contacts:[contact],score:85,recommendedApproach:"Verified business relevance"};
const record={...memory.founderRecordInput({research,contact}),id:recordId,organisation_id:org,linked_acquisition_item_id:null};
test("Founder identities preserve company/person separation and verified-only routes",()=>{
 const company=memory.founderRecordInput({research});assert.equal(company.identity_key,"company:example.org");assert.equal(record.identity_key,"person:linkedin:linkedin.com/in/alex-professional");assert.equal(record.email,"alex@example.org");
 assert.equal(memory.founderRecordInput({research:{...research,sourceUrls:[]}}).identity_key,null);
 assert.throws(()=>memory.founderRecordInput({research,contact:{name:"Invented"}}));
 const unknown={...contact,emailStatus:"not_found",sourceUrls:[]};assert.equal(memory.founderRecordInput({research:{...research,contacts:[unknown]},contact:unknown}).email,null);
});
test("actual historical timestamps remain unknown or exact, confirmation mandatory and future dates guarded",()=>{
 const base={activityType:"emailed",route:"alex@example.org",message:" Exact message \n",confirmed:true};
 const unknown=memory.activityInput({...base,occurredAt:null});assert.equal(unknown.occurred_at,null);assert.equal(unknown.message,base.message);
 assert.equal(memory.activityInput({...base,timeChoice:"now",occurredAt:"2099-01-01T00:00:00Z"}).occurred_at,null);
 assert.equal(memory.activityInput({...base,occurredAt:"2026-01-01T12:00:00Z"}).occurred_at,"2026-01-01T12:00:00.000Z");
 assert.throws(()=>memory.activityInput({...base,confirmed:false}));assert.throws(()=>memory.activityInput({...base,occurredAt:"2099-01-01T00:00:00Z"}));assert.throws(()=>memory.activityInput({...base,activityType:"sent_draft"}));
});
test("reconciliation uses exact directional verified email/context and never merges same-company people",()=>{
 const msg={organisation_id:org,gmail_message_id:"gmail-1",gmail_thread_id:"thread-1",direction:"outbound",recipient_email:"alex@example.org",sender_email:"root@example.net",sent_at:"2026-01-01T12:00:00Z",body:"Exact external email"};
 assert.equal(memory.gmailCandidates(record,[msg]).length,1);assert.equal(memory.gmailCandidates(record,[{...msg,organisation_id:other}]).length,0);assert.equal(memory.gmailCandidates(record,[{...msg,recipient_email:"another@example.org"}]).length,0);
 assert.equal(memory.gmailCandidates(record,[{...msg,gmail_thread_id:null}]).length,0);assert.equal(memory.gmailCandidates({...record,company:null},[msg]).length,0);
 const company={...record,entity_kind:"company",email:null,email_verified:false,contacts:[]};assert.equal(memory.gmailCandidates(company,[{...msg,recipient_email:"other@example.org"}])[0].requiresConfirmation,true);
});
test("shared literal search covers useful fields, Unicode and nested research; syntax stays literal",()=>{
 for(const q of ["alex","example.org","workplace_buyers","uk","signal recovery","linkedin.com/in/alex"])assert.ok(search.matchesSearch({...record,research_snapshot:{note:"Signal recovery"}},search.searchQuery(q)),q);
 assert.equal(search.matchesSearch(record,search.searchQuery("%,or(organisation_id)")),false);assert.throws(()=>search.searchQuery("a".repeat(201)));assert.equal(search.matchesSearch({company:"CAFÉ"},search.searchQuery("café")),true);
});
test("historical reads scope every page, search after page one, and reject partial read failures",async()=>{
 const rows=Array.from({length:701},(_,i)=>({id:String(i),organisation_id:org,company:i===700?"Old historical match":"Other"}));let reads=0;const filters=[];
 const admin={from:()=>{const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},order(){return query;},range(a,b){reads++;return Promise.resolve({data:rows.slice(a,b+1),error:null});}};return query;}};
 const service=load("lib/opsSearch.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:admin}});const all=await service.readTenantHistory("acquisition_items",org);assert.equal(all.length,701);assert.equal(reads,2);assert.ok(filters.every(([key,value])=>key==="organisation_id"&&value===org));assert.equal(all.filter(row=>search.matchesSearch(row,"historical"))[0].id,"700");
});
test("SQL: additive Founder storage, tenant FKs, exact privileges, immutable history and idempotent receipts",async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table organisations(id uuid primary key);create table acquisition_items(id uuid primary key,organisation_id uuid);create table email_conversation_messages(organisation_id uuid,gmail_message_id text,gmail_thread_id text);`);await db.exec(fs.readFileSync("supabase/migrations/20261013170000_founder_memory.sql","utf8"));
 await db.query("insert into organisations values($1),($2)",[org,other]);await db.query("insert into acquisition_items values($1,$2)",[acquisitionId,org]);await db.query("insert into founder_research_records(id,organisation_id,created_by,entity_kind,company,lane,geography,research_snapshot) values($1,$2,$3,'company','Example','workplace_buyers','UK',$4)",[recordId,org,actor,research]);
 const key=randomUUID(),details={activity_type:"emailed",time_status:"now",route:"alex@example.org",message:" Exact confirmed text \n"};const call=(tenant,id,k,d,acq=null)=>db.query("select record_founder_activity($1,$2,$3,$4,$5,$6) as result",[tenant,id,actor,k,d,acq]);
 assert.equal((await call(org,recordId,key,details)).rows[0].result.duplicate,false);assert.equal((await call(org,recordId,key,details)).rows[0].result.duplicate,true);await assert.rejects(call(org,recordId,key,{...details,message:"Changed"}));
 const event=(await db.query("select * from founder_activity_events")).rows[0];assert.equal(event.message,details.message);assert.equal(String(event.occurred_at),String(event.recorded_at));
 await assert.rejects(call(other,recordId,randomUUID(),details));await assert.rejects(call(org,recordId,randomUUID(),{...details,time_status:"historical",occurred_at:"2099-01-01T00:00:00Z"}));
 await call(org,recordId,randomUUID(),{...details,time_status:"historical",occurred_at:null});assert.equal((await db.query("select count(*)::int as count from founder_activity_events where occurred_at is null")).rows[0].count,1);
 const secondAcq=randomUUID(),foreignAcq=randomUUID();await db.query("insert into acquisition_items values($1,$2),($3,$4)",[secondAcq,org,foreignAcq,other]);
 // Direct table writes enforce NULL -> same-tenant link and immutable set links.
 await assert.rejects(db.query("update founder_research_records set linked_acquisition_item_id=$1 where id=$2",[foreignAcq,recordId]),/Invalid tenant acquisition link/);
 await db.query("update founder_research_records set linked_acquisition_item_id=$1 where id=$2",[acquisitionId,recordId]);
 assert.equal((await db.query("select linked_acquisition_item_id from founder_research_records where id=$1",[recordId])).rows[0].linked_acquisition_item_id,acquisitionId);
 await assert.rejects(db.query("update founder_research_records set linked_acquisition_item_id=$1 where id=$2",[secondAcq,recordId]),/immutable once set/);
 await assert.rejects(db.query("update founder_research_records set linked_acquisition_item_id=null where id=$1",[recordId]),/immutable once set/);
 const promotion={activity_type:"promoted_to_acquisition",time_status:"now",route:"Acquisition"};
 await assert.rejects(call(org,recordId,randomUUID(),promotion),/Promotion requires/);
 await assert.rejects(call(org,recordId,randomUUID(),details,acquisitionId),/Only promotion/);
 await assert.rejects(call(org,recordId,key,details,acquisitionId),/Only promotion/);
 await assert.rejects(call(org,recordId,randomUUID(),promotion,foreignAcq),/Invalid tenant acquisition link/);
 await assert.rejects(call(org,recordId,randomUUID(),promotion,secondAcq),/Acquisition link changed/);
 const promotionKey=randomUUID();await call(org,recordId,promotionKey,promotion,acquisitionId);
 assert.equal((await call(org,recordId,promotionKey,promotion,acquisitionId)).rows[0].result.duplicate,true);
 await assert.rejects(call(org,recordId,promotionKey,promotion),/Promotion requires/);
 await assert.rejects(call(org,recordId,promotionKey,promotion,secondAcq),/Acquisition link changed/);assert.equal((await db.query("select linked_acquisition_item_id from founder_research_records")).rows[0].linked_acquisition_item_id,acquisitionId);
 await db.query("insert into email_conversation_messages values($1,'message-existing','thread-existing')",[org]);
 // RPC and CHECK both reject absent, one-sided and blank Gmail IDs, and IDs on other activity types.
 for(const ids of [{},{gmail_message_id:"message-existing"},{gmail_thread_id:"thread-existing"},{gmail_message_id:"",gmail_thread_id:"thread-existing"}]) {
  await assert.rejects(call(org,recordId,randomUUID(),{activity_type:"linked_gmail_evidence",...ids}),/Both authoritative Gmail IDs/);
  await assert.rejects(db.query("insert into founder_activity_events(organisation_id,research_record_id,actor,activity_type,gmail_message_id,gmail_thread_id,idempotency_key,receipt_details) values($1,$2,$3,'linked_gmail_evidence',$4,$5,$6,'{}')",[org,recordId,actor,ids.gmail_message_id??null,ids.gmail_thread_id??null,randomUUID()]),/founder_activity_gmail_ids/);
 }
 for(const ids of [{gmail_message_id:"message-existing",gmail_thread_id:"thread-existing"},{gmail_message_id:"message-existing"},{gmail_thread_id:"thread-existing"}]) {
  await assert.rejects(call(org,recordId,randomUUID(),{...details,...ids}),/Only Gmail evidence/);
  await assert.rejects(db.query("insert into founder_activity_events(organisation_id,research_record_id,actor,activity_type,gmail_message_id,gmail_thread_id,idempotency_key,receipt_details) values($1,$2,$3,'note_added',$4,$5,$6,'{}')",[org,recordId,actor,ids.gmail_message_id??null,ids.gmail_thread_id??null,randomUUID()]),/founder_activity_gmail_ids/);
 }
 await assert.rejects(call(org,recordId,randomUUID(),{activity_type:"linked_gmail_evidence",gmail_message_id:"message-existing",gmail_thread_id:"wrong-thread"}),/Existing tenant Gmail evidence/);
 await db.query("insert into email_conversation_messages values($1,'foreign-message','foreign-thread')",[other]);
 await assert.rejects(call(org,recordId,randomUUID(),{activity_type:"linked_gmail_evidence",gmail_message_id:"foreign-message",gmail_thread_id:"foreign-thread"}),/Existing tenant Gmail evidence/);
 const gmail={activity_type:"linked_gmail_evidence",occurred_at:"2026-01-01T00:00:00Z",gmail_message_id:"message-existing",gmail_thread_id:"thread-existing"};await call(org,recordId,randomUUID(),gmail);assert.equal((await call(org,recordId,randomUUID(),gmail)).rows[0].result.duplicate,true);
 const priv=(await db.query("select has_table_privilege('service_role','founder_activity_events','INSERT') as ins,has_table_privilege('service_role','founder_activity_events','UPDATE') as upd,has_table_privilege('authenticated','founder_research_records','SELECT') as browser,has_function_privilege('anon','record_founder_activity(uuid,uuid,uuid,uuid,jsonb,uuid)','EXECUTE') as public_exec")).rows[0];assert.equal(priv.ins,true);assert.equal(priv.upd,false);assert.equal(priv.browser,false);assert.equal(priv.public_exec,false);
 await assert.rejects(db.query("update founder_research_records set linked_acquisition_item_id=$1 where id=$2",[foreignAcq,recordId]));await assert.rejects(db.query("update founder_research_records set organisation_id=$1 where id=$2",[other,recordId]));
 const rls=await db.query("select relrowsecurity from pg_class where relname in ('founder_research_records','founder_activity_events')");assert.ok(rls.rows.every(row=>row.relrowsecurity));await db.close();
});
test("Founder API access denial happens before persistence/search reads",async()=>{
 let reads=0;const route=load("app/api/founder-intelligence/records/route.ts",{"next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},"@/lib/founderIntelligenceAuth.server":{requireFounderIntelligence:async()=>{throw Error("Forbidden");}},"@/lib/tenantAuth":{accessErrorResponse:()=>({status:403})},"@/lib/opsSearch.server":{readTenantHistory:async()=>{reads++;return[];}},"@/lib/supabaseAdmin":{},"@/lib/founderMemory.server":{},"@/lib/reviewedIdentity.server":{previewSourceCreation:()=>assert.fail("No review before tenant authorization")}});
 assert.equal((await route.GET({url:`https://ops.test/api?organisationId=${org}`})).status,403);assert.equal((await route.POST({json:async()=>({organisationId:org,research})})).status,403);assert.equal(reads,0);
});
test("Gmail linking rechecks authoritative stored IDs and appends a pointer rather than copying conversation",async()=>{
 let rpc;const msg={organisation_id:org,gmail_message_id:"gmail-real",gmail_thread_id:"thread-real",direction:"outbound",recipient_email:record.email,sent_at:"2026-01-01T00:00:00Z",body:"Existing exact body",subject:"Existing subject"};
 const admin={from:()=>{const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:record,error:null})};return q;},rpc:async(name,args)=>{rpc={name,args};return {data:{duplicate:false},error:null};}};
 const service=load("lib/founderMemory.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:admin},"@/lib/opsSearch.server":{readTenantHistory:async table=>table==="email_conversation_messages"?[msg]:[]},"@/lib/lifecycleSnapshot.server":{readLifecycleInput:async()=>({inbox_items:[],growth_targets:[],acquisition_items:[]})}});
 const body={recordId,key:randomUUID(),gmailMessageId:msg.gmail_message_id,gmailThreadId:msg.gmail_thread_id,confirmed:true,message:"Client invented text"};await service.linkFounderGmail(org,actor,body);assert.equal(rpc.args.p_details.message,null);assert.equal(rpc.args.p_details.gmail_message_id,msg.gmail_message_id);assert.equal(rpc.args.p_details.subject,msg.subject);
 await assert.rejects(service.linkFounderGmail(org,actor,{...body,confirmed:false}));await assert.rejects(service.linkFounderGmail(org,actor,{...body,gmailThreadId:"wrong"}));
});
test("prior Founder contact blocks restarting initial outreach without changing ordinary Commercial",()=>{
 const service=load("lib/acquisitionPromotion.server.ts",{"@/lib/supabaseAdmin":{}});const item={record_type:"b2b_lead",status:"accepted",company:"Example",metadata:{email:"alex@example.org"}};assert.equal(service.acquisitionTarget(item).email,item.metadata.email);assert.throws(()=>service.acquisitionTarget({...item,metadata:{...item.metadata,founder_prior_contact:true}}));
});

test("server Responses search includes old thread text beyond loaded records without cross-tenant/thread leakage",async()=>{
 const input={inbox_items:Array.from({length:301},(_,i)=>({id:`in-${i}`,organisation_id:org,platform:"email",sender_email:`p${i}@example.org`,email_thread_id:`thread-${i}`,created_at_platform:"2026-01-01",status:"replied"})),growth_targets:[],acquisition_items:[]};
 const route=load("app/api/responses/list/route.ts",{"next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},"@/lib/tenantAuth":{requireOrganisation:async()=>({organisationId:org}),accessErrorResponse:()=>null},"@/lib/lifecycleSnapshot.server":{readLifecycleInput:async()=>input},"@/lib/opsSearch.server":{readTenantHistory:async(table,tenant)=>{assert.equal(tenant,org);return table==="email_conversation_messages"?[{organisation_id:org,gmail_thread_id:"thread-300",body:"Historical unique conversation topic"}]:[];}},"@/lib/responseLifecycle":{responseLifecycleMap:()=>new Map(),responseAttention:()=>({count:0})}});
 const found=await route.GET({url:`https://ops.test/list?organisationId=${org}&q=unique%20topic`});assert.equal(found.body.items.length,1);assert.equal(found.body.items[0].id,"in-300");assert.equal(found.body.total,1);assert.equal(input.inbox_items[300].status,"replied");
});
test("partial historical read errors never become partial search success",async()=>{
 const admin={from:()=>{const q={select(){return q;},eq(){return q;},order(){return q;},range(offset){return Promise.resolve(offset?{data:null,error:Error("Read failed")}:{data:Array.from({length:500},()=>({})),error:null});}};return q;}};
 await assert.rejects(load("lib/opsSearch.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:admin}}).readTenantHistory("acquisition_items",org));
});
test("identical research retries do not append duplicate snapshots or reset saved draft/history links",async()=>{
 let writes=0;const existing={...record,discovery_context:null,research_versions:[{snapshot:research}],draft_body:"Stored edited draft",linked_acquisition_item_id:acquisitionId};
 const admin={from:()=>{const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:existing,error:null}),insert(){writes++;return q;},update(){writes++;return q;}};return q;}};
 const service=load("lib/founderMemory.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:admin},"@/lib/opsSearch.server":{},"@/lib/lifecycleSnapshot.server":{}});
 const result=await service.saveFounderRecord(org,actor,{recordId,research,contact});assert.equal(result.id,recordId);assert.equal(result.draft_body,"Stored edited draft");assert.equal(result.linked_acquisition_item_id,acquisitionId);assert.equal(writes,0);
});

test("two people sharing a company mailbox never collapse to one Founder identity",()=>{
 const a={...contact,linkedinUrl:null,sourceUrls:[],directEmail:"hr@example.org",name:"Amy"},b={...a,name:"Ben"};const snapshot={...research,contacts:[a,b]};
 assert.notEqual(memory.founderRecordInput({research:snapshot,contact:a}).identity_key,memory.founderRecordInput({research:snapshot,contact:b}).identity_key);
});
