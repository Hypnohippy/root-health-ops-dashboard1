import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const org=randomUUID(),other=randomUUID(),actor=randomUUID(),member=randomUUID();
let db;
const read=file=>fs.readFileSync(file,'utf8');
before(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(read('infra/preview-baseline/local-platform.sql'));
 await db.exec("SET root_ops.empty_preview_baseline='on'");
 await db.exec(read('infra/preview-baseline/migrations/00000000000000_root_ops_schema_baseline.sql'));
 await db.exec(read('supabase/migrations/20261019120000_solution_brief_foundation.sql'));await db.exec(read('supabase/migrations/20261023193032_reviewed_identity_decisions.sql'));await db.exec(read('supabase/migrations/20261024184449_atomic_founder_authorization.sql'));
 await db.query('insert into auth.users(id) values ($1),($2)',[actor,member]);
 for(const id of [org,other])await db.query('insert into organisations(id,owner_id,name,slug) values($1,$2,$3,$4)',[id,actor,'PHASE 2D SYNTHETIC',id]);
 await db.query("insert into organisation_members(organisation_id,user_id,role) values($1,$2,'owner'),($1,$3,'member')",[org,actor,member]);
 await db.query('update auth.users set email=$1 where id=$2',['phase2d_test_owner@example.test',actor]);
 await db.query("insert into organisation_plans(organisation_id,plan,posts_per_month) values($1,'founder',100)",[org]);
 await db.query("select root_ops_private.set_founder_authorization_policy('phase2d_test_owner@example.test')");
});
after(async()=>{await db?.close();});
async function stamp(o=org,a=actor){return (await db.query('select relationship_review_snapshot($1,$2) v',[o,a])).rows[0].v;}
async function commit(payload,{snapshot,key=randomUUID(),organisation=org,user=actor}={}){return (await db.query('select commit_reviewed_relationship_decision($1,$2,$3,$4,$5) v',[organisation,user,key,snapshot??await stamp(organisation,user),JSON.stringify(payload)])).rows[0].v;}
function create(id=randomUUID(),name='PHASE 2D NEW '+id){return {action:'create',table:'acquisition_items',kind:'person',row:{id,organisation_id:org,source_engine:'manual_ops',source_record_id:'manual:'+id,record_type:'partner_opportunity',entity:name,person:name,metadata:{}},separations:[],createdAliases:[]};}
const counts=async()=> (await db.query('select (select count(*)::int from acquisition_items) sources,(select count(*)::int from relationship_workspaces) workspaces,(select count(*)::int from relationship_source_links) links,(select count(*)::int from relationship_review_receipts) receipts')).rows[0];
let first,second,firstPayload,firstKey,firstSnapshot;
test('baseline builds empty; migration does not create business records',async()=>{assert.deepEqual(await counts(),{sources:0,workspaces:0,links:0,receipts:0});});
test('browser roles cannot read receipts or execute reviewed RPCs',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from relationship_review_receipts'),/permission denied/);await assert.rejects(stamp(),/permission denied/);await assert.rejects(commit(create(),{snapshot:'x'}),/permission denied/);await db.exec('reset role');}
});
test('service role has select-only receipts and RPC execution, with RLS enabled',async()=>{
 const result=(await db.query("select has_table_privilege('service_role','relationship_review_receipts','INSERT') i,has_function_privilege('service_role','commit_reviewed_relationship_decision(uuid,uuid,uuid,text,jsonb)','EXECUTE') e,(select relrowsecurity from pg_class where relname='relationship_review_receipts') r")).rows[0];assert.deepEqual(result,{i:false,e:true,r:true});
});
test('genuine new source and canonical workspace/link commit atomically',async()=>{
 firstPayload=create();firstKey=randomUUID();firstSnapshot=await stamp();first=await commit(firstPayload,{key:firstKey,snapshot:firstSnapshot});assert.equal(first.id,firstPayload.row.id);assert.ok(first.workspaceId);
 const links=(await db.query('select * from relationship_source_links where source_id=$1',[first.id])).rows;assert.equal(links.length,1);assert.equal(links[0].workspace_id,first.workspaceId);
});
test('same exact receipt retries after snapshot changed without duplicate rows',async()=>{
 const before=await counts(),duplicate=await commit(firstPayload,{key:firstKey,snapshot:firstSnapshot});assert.equal(duplicate.workspaceId,first.workspaceId);assert.equal(duplicate.duplicate,true);assert.deepEqual(await counts(),before);
});
test('same receipt with changed payload fails closed',async()=>{await assert.rejects(commit({...firstPayload,kind:'company'},{key:firstKey,snapshot:firstSnapshot}),/receipt differs/);});
test('stale new-identity review rejects if another source appears',async()=>{const old=await stamp();second=await commit(create());const before=await counts();await assert.rejects(commit(create(),{snapshot:old}),/Review changed/);assert.deepEqual(await counts(),before);});
test('failed source insertion rolls back workspace and receipt too',async()=>{const payload=create();payload.row.record_type='INVALID';const before=await counts();await assert.rejects(commit(payload));assert.deepEqual(await counts(),before);});
test('failed source attachment rolls back inserted source and workspace',async()=>{
 await db.exec("create function pg_temp.reject_test_link() returns trigger language plpgsql as $$ begin raise exception 'synthetic attachment failure';end $$;create trigger phase2d_test_failure before insert on relationship_source_links for each row execute function pg_temp.reject_test_link();");
 const before=await counts();await assert.rejects(commit(create()),/attachment failure/);assert.deepEqual(await counts(),before);await db.exec('drop trigger phase2d_test_failure on relationship_source_links');
});
test('foreign organisation and ordinary member cannot commit',async()=>{const before=await counts();await assert.rejects(commit(create(),{organisation:other}));await assert.rejects(commit(create(),{user:member,snapshot:'x'}),/unavailable/);assert.deepEqual(await counts(),before);});
const ref=id=>({table:'acquisition_items',id});
let separation;
test('explicit symmetric keep separate uses existing append-only ledger; both sources unchanged',async()=>{
 const before=(await db.query('select to_jsonb(t) r from acquisition_items t order by id')).rows;
 const refs=[ref(first.id),ref(second.id)].sort((a,b)=>a.id.localeCompare(b.id));
 separation={action:'keep_separate',refs,aliases:{a:[],b:[]}};
 const result=await commit(separation);assert.ok(result.decisionId);
 const decision=(await db.query('select * from relationship_identity_decisions where id=$1',[result.decisionId])).rows[0];assert.equal(decision.decision,'keep_separate');assert.equal(decision.actor_user_id,actor);assert.ok(decision.decided_at);
 assert.deepEqual((await db.query('select to_jsonb(t) r from acquisition_items t order by id')).rows,before);
});
test('foreign separation endpoint rolls back without writing ledger or receipt',async()=>{
 const before=await counts();await assert.rejects(commit({...separation,refs:[ref(first.id),ref(randomUUID())]}),/unavailable/);assert.deepEqual(await counts(),before);
});
test('reviewed pending distinct identity creates source, link and cannot-link in one transaction',async()=>{
 const payload=create(undefined,firstPayload.row.person);payload.separations=[{ref:ref(first.id),aliases:[]}];
 const result=await commit(payload),decisions=(await db.query('select * from relationship_identity_decisions where source_ref_a->>\'id\'=$1 or source_ref_b->>\'id\'=$1',[result.id])).rows;
 assert.equal(decisions.length,1);assert.equal(decisions[0].decision,'keep_separate');assert.ok(result.workspaceId);
});
test('invalid pending separation rolls back newly created source and workspace',async()=>{
 const payload=create();payload.separations=[{ref:ref(randomUUID()),aliases:[]}];const before=await counts();await assert.rejects(commit(payload));assert.deepEqual(await counts(),before);
});
let researchPayload,researchResult;
test('approved research links as evidence, not a new canonical identity source',async()=>{
 const w=(await db.query('select revision from relationship_workspaces where id=$1',[first.workspaceId])).rows[0];
 researchPayload={action:'save_research',kind:'person',refs:[ref(first.id)],workspaceId:first.workspaceId,workspaceRevision:w.revision,table:'founder_research_records',row:{id:randomUUID(),organisation_id:org,created_by:actor,entity_kind:'person',person_name:'PHASE 2D SAVED PUBLIC EVIDENCE',lane:'open_intelligence',geography:'UK',saved:true,sources:[{url:'https://example.org/report',publishedAt:'2024-01-01',retrievedAt:'2026-10-23T12:00:00Z'}],research_snapshot:{name:'PHASE 2D',phase2d:{verification:'matched_public',approvedBy:actor,sourceRefs:[ref(first.id)],facts:[{claim:'Controlled public claim',sourceUrls:['https://example.org/report']}],sources:[{url:'https://example.org/report',publishedAt:'2024-01-01',retrievedAt:'2026-10-23T12:00:00Z'}]}}}};
 researchResult=await commit(researchPayload);assert.equal(researchResult.workspaceId,first.workspaceId);
 assert.equal((await db.query("select count(*)::int n from relationship_source_links where source_id=$1",[researchResult.id])).rows[0].n,0);
 const row=(await db.query('select * from founder_research_records where id=$1',[researchResult.id])).rows[0];assert.equal(row.linked_relationship_workspace_id,first.workspaceId);assert.equal(row.linkedin_identity,null);assert.equal(row.company,null);assert.ok(row.research_snapshot.phase2d.approvedAt);assert.notEqual(row.research_snapshot.phase2d.approvedAt,'2024-01-01');assert.equal(row.sources[0].retrievedAt,'2026-10-23T12:00:00Z');
});
test('research revoked after preparation is denied transactionally with zero evidence/receipt/workspace writes',async()=>{
 const before=await counts(),founderBefore=(await db.query('select count(*)::int n from founder_research_records')).rows[0].n,snapshot=await stamp();
 await db.query("select root_ops_private.set_founder_authorization_policy('revoked@example.test')");
 try{await assert.rejects(commit({...researchPayload,row:{...researchPayload.row,id:randomUUID()}},{snapshot}),/Protected review unavailable/);assert.deepEqual(await counts(),before);assert.equal((await db.query('select count(*)::int n from founder_research_records')).rows[0].n,founderBefore);}
 finally{await db.query("select root_ops_private.set_founder_authorization_policy('phase2d_test_owner@example.test')");}
});
test('research retry does not duplicate saved evidence or revision',async()=>{const receipt=(await db.query('select request_id from relationship_review_receipts where result->>\'id\'=$1',[researchResult.id])).rows[0];const before=await counts();await commit(researchPayload,{key:receipt.request_id,snapshot:'old retry snapshot'});assert.deepEqual(await counts(),before);});
test('research workspace revision drift blocks old destination',async()=>{const payload={...researchPayload,row:{...researchPayload.row,id:randomUUID()}};await assert.rejects(commit(payload),/Destination changed/);});
test('receipt history cannot be modified, deleted or truncated',async()=>{for(const query of ["update relationship_review_receipts set result='{}'","delete from relationship_review_receipts","truncate relationship_review_receipts"])await assert.rejects(db.exec(query),/append-only/);});
test('double submission of one reviewed receipt creates exactly one source/workspace/link',async()=>{const payload=create(),key=randomUUID(),snapshot=await stamp(),before=await counts(),results=await Promise.all([commit(payload,{key,snapshot}),commit(payload,{key,snapshot})]);assert.equal(results[0].id,results[1].id);assert.equal(results[0].workspaceId,results[1].workspaceId);assert.equal(results.filter(r=>r.duplicate).length,1);const after=await counts();for(const field of ['sources','workspaces','links','receipts'])assert.equal(after[field],before[field]+1);});
test('concurrent different receipts cannot both apply the same stale review snapshot',async()=>{const snapshot=await stamp(),before=await counts(),results=await Promise.allSettled([commit(create(),{snapshot}),commit(create(),{snapshot})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);const after=await counts();assert.equal(after.sources,before.sources+1);assert.equal(after.workspaces,before.workspaces+1);});
