import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,deps={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Date,Error,Request,Response,console,require:n=>{assert.ok(n in deps,n);return deps[n]}});return mod.exports;}
const {verifiedExternalReply}=load('lib/emailReplyEvidence.ts');
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',key='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const item={id,organisation_id:org,platform:'email',email_thread_id:'thread',email_message_id:'in',sender_email:'person@example.test'};
const inbound={organisation_id:org,gmail_thread_id:'thread',gmail_message_id:'in',direction:'inbound',source:'gmail_engine',sent_at:'2026-10-20T10:00:00Z',body:'Please call tomorrow. Quoted: David replied.'};
const outbound={...inbound,gmail_message_id:'out',direction:'outbound',recipient_email:'person@example.test',sent_at:'2026-10-20T11:15:34Z',body:'Confirmed timing.'};
const now=Date.parse('2026-10-21T12:00:00Z');
test('only a separately recorded newer outbound verifies the external reply',()=>{assert.equal(verifiedExternalReply(item,[inbound,outbound],now).gmail_message_id,'out');assert.equal(verifiedExternalReply(item,[inbound],now),null);});
for(const [label,patch] of Object.entries({foreign:{organisation_id:'foreign'},foreignThread:{gmail_thread_id:'other'},old:{sent_at:'2026-10-19T10:00:00Z'},future:{sent_at:'2099-01-01'},unknownDate:{sent_at:null},wrongRecipient:{recipient_email:'other@example.test'},untrusted:{source:'browser'},empty:{body:''},notOutbound:{direction:'inbound'}}))test('does not infer a reply from '+label,()=>assert.equal(verifiedExternalReply(item,[inbound,{...outbound,...patch}],now),null));
test('later inbound prevents an earlier outbound from clearing current needs-reply state',()=>assert.equal(verifiedExternalReply(item,[inbound,outbound,{...inbound,gmail_message_id:'new',sent_at:'2026-10-20T12:00:00Z'}],now),null));
test('missing selected inbound message cannot borrow another thread message',()=>assert.equal(verifiedExternalReply({...item,email_message_id:'missing'},[inbound,outbound],now),null));
for(const scenario of ['denied','foreign','no-outbound','verified','stale','in-flight'])test('authenticated exact email check: '+scenario,async()=>{
 const calls=[];
 const route=load('app/api/responses/email/[id]/check-reply/route.ts',{
  'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
  '@/lib/tenantAuth':{requireOrganisation:async(requested,write)=>{calls.push('auth');assert.equal(requested,org);assert.equal(write,true);if(scenario==='denied')throw Error('Denied');return {organisationId:org,userId:'actor'}},accessErrorResponse:()=>null},
  '@/lib/growthIngestion.server':{uuid:/^[a-f0-9-]{36}$/},
  '@/lib/manualCompletion.server':{prepareManualCompletion:async(o,t,i)=>{calls.push('plan');assert.equal(o,org);assert.equal(i,id);if(scenario==='foreign')throw Error('Not found');return {row:item,allowed:scenario!=='in-flight',reason:'Delivery in flight',revision:'12',patch:{status:'replied',response_state:'engaged',follow_up_at:null}}}},
  '@/lib/emailReplyEvidence':{verifiedExternalReply:(i,m)=>verifiedExternalReply(i,m,now)},
  '@/lib/supabaseAdmin':{supabaseAdmin:{from(table){calls.push(table);const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},order(){return q},async limit(){assert.equal(filters.organisation_id,org);assert.equal(filters.gmail_thread_id,'thread');return {data:scenario==='no-outbound'?[inbound]:[inbound,outbound],error:null}}};return q},async rpc(name,args){calls.push(name);assert.equal(name,'record_manual_completion');assert.equal(args.p_revision,'12');assert.equal(args.p_organisation_id,org);assert.equal(args.p_id,id);assert.equal(args.p_completed_at,outbound.sent_at);assert.equal(args.p_patch.last_reply_text,outbound.body);assert.match(args.p_evidence,/Stored email message out/);return {data:{duplicate:false},error:scenario==='stale'?{code:'stale_manual_plan'}:null}}}}
 });
 const response=await route.POST(new Request('https://ops.test/check',{method:'POST',body:JSON.stringify({organisationId:org,key})}),{params:Promise.resolve({id})});
 assert.equal(response.status,['denied','foreign','stale','in-flight'].includes(scenario)?409:200);
 assert.equal(calls.includes('record_manual_completion'),['verified','stale'].includes(scenario));
 if(scenario==='verified')assert.equal(response.body.verified,true);
 if(scenario==='no-outbound'){assert.equal(response.body.verified,false);assert.match(response.body.message,/Nothing was marked handled/);}
 if(['denied','foreign','in-flight'].includes(scenario))assert.equal(calls.includes('email_conversation_messages'),false);
});
