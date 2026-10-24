import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import vm from 'node:vm';
import ts from 'typescript';
let db;const actor=randomUUID(),org=randomUUID(),email='phase2d_test_owner@example.test';
export const migration='supabase/migrations/20261024184449_atomic_founder_authorization.sql';
before(async()=>{
 db=new PGlite();await db.waitReady;
 for(const file of ['infra/preview-baseline/local-platform.sql','infra/preview-baseline/migrations/00000000000000_root_ops_schema_baseline.sql','supabase/migrations/20261019120000_solution_brief_foundation.sql','supabase/migrations/20261023193032_reviewed_identity_decisions.sql']){
  if(file.includes('00000000000000'))await db.exec("set root_ops.empty_preview_baseline='on'");
  await db.exec(fs.readFileSync(file,'utf8'));
 }
 // A preexisting user exercises real backfill rather than only trigger inserts.
 await db.query('insert into auth.users(id,email) values($1,$2)',[actor,email]);
 await db.exec(fs.readFileSync(migration,'utf8'));
 await db.query("insert into organisations(id,owner_id,name,slug) values($1,$2,'PHASE2D_TEST_ATOMIC',$3)",[org,actor,org]);
 await db.query("insert into organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",[org,actor]);
 await db.query("insert into organisation_plans(organisation_id,plan,posts_per_month) values($1,'founder',100)",[org]);
});
after(async()=>db?.close());
const allowed=async()=> (await db.query('select founder_authorization_allowed($1,$2) v',[org,actor])).rows[0].v;
const policy=async value=>db.query('select root_ops_private.set_founder_authorization_policy($1)',[value]);
const counts=async()=> (await db.query(`select
 (select count(*)::int from founder_research_records) sources,
 (select count(*)::int from relationship_workspaces) workspaces,
 (select count(*)::int from relationship_source_links) links,
 (select count(*)::int from relationship_review_receipts) receipts,
 (select count(*)::int from relationship_identity_decisions) decisions`)).rows[0];
const payload=()=>{const id=randomUUID();return {action:'create',table:'founder_research_records',kind:'company',row:{id,organisation_id:org,created_by:actor,entity_kind:'company',company:'PHASE2D_TEST_'+id,research_snapshot:{name:'PHASE2D_TEST_'+id},saved:true,lane:'open_intelligence',geography:'UK'},separations:[],createdAliases:[]};};
const stamp=async()=> (await db.query('select relationship_review_snapshot($1,$2) v',[org,actor])).rows[0].v;
const commit=async(p,key=randomUUID(),snapshot)=> (await db.query('select commit_reviewed_relationship_decision($1,$2,$3,$4,$5) v',[org,actor,key,snapshot??await stamp(),JSON.stringify(p)])).rows[0].v;
async function denied(change,restore){const p=payload(),snapshot=await stamp(),before=await counts();await change();try{await assert.rejects(commit(p,randomUUID(),snapshot),/Protected review unavailable|Review unavailable/);assert.deepEqual(await counts(),before);}finally{await restore();}}
test('backfill is complete; missing policy denies without environment fallback',async()=>{
 assert.equal((await db.query('select normalized_email from root_ops_private.founder_actor_identity where user_id=$1',[actor])).rows[0].normalized_email,email);
 assert.equal(await allowed(),false);await policy(email);assert.equal(await allowed(),true);
});
const vectors=[[' Owner@Example.Test ','owner@example.test'],['\tOwner@Example.Test\r\n','owner@example.test'],['\vOwner@Example.Test\f','owner@example.test'],['\u00a0Owner@example.test',null],['\ufeffOwner@example.test',null],['\u2003Owner@example.test',null],['İ@example.test',null],['K@example.test',null],['ß@example.test',null],['a..b@example.test',null],['no-email',null],[null,null]];
for(const [input,expected]of vectors)test('SQL canonical normalization '+JSON.stringify(input),async()=>{
 assert.equal((await db.query('select root_ops_private.normalize_founder_email($1) v',[input])).rows[0].v,expected);
});
test('application wrapper uses the same SQL authority for every normalization vector',async()=>{
 const mod={exports:{}};class AccessError extends Error{}
 const mocks={'@/lib/tenantAuth':{AccessError,requireOrganisation:async()=>({organisationId:org,userId:actor,role:'owner'})},'@/lib/supabaseAdmin':{supabaseAdmin:{rpc:async(name,args)=>{
  assert.equal(name,'founder_authorization_allowed');assert.deepEqual(JSON.parse(JSON.stringify(args)),{p_org:org,p_actor:actor});
  return {data:await allowed(),error:null};
 }}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/founderIntelligenceAuth.server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,require:name=>mocks[name]});
 try{for(const [input,expected]of vectors){await policy(expected||email);await db.query('update auth.users set email=$1 where id=$2',[input,actor]);
  if(expected)assert.equal((await mod.exports.requireFounderIntelligence(org)).userId,actor);
  else await assert.rejects(mod.exports.requireFounderIntelligence(org),/restricted/);
 }}finally{await db.query('update auth.users set email=$1 where id=$2',[email,actor]);await policy(email);}
});
test('authorized protected creation and replay produce one canonical outcome',async()=>{
 const p=payload(),key=randomUUID(),snapshot=await stamp(),r=await commit(p,key,snapshot),before=await counts();
 assert.ok(r.workspaceId);const replay=await commit(p,key,snapshot);assert.equal(replay.duplicate,true);assert.deepEqual(await counts(),before);
 await policy('revoked@example.test');await assert.rejects(commit(p,key,snapshot),/Protected review unavailable/);assert.deepEqual(await counts(),before);await policy(email);
});
test('policy revoked after reviewed snapshot denies with zero writes',async()=>denied(()=>policy('revoked@example.test'),()=>policy(email)));
test('email revoked after reviewed snapshot denies with zero writes',async()=>denied(()=>db.query('update auth.users set email=$1 where id=$2',['revoked@example.test',actor]),()=>db.query('update auth.users set email=$1 where id=$2',[email,actor])));
test('plan revoked after reviewed snapshot denies with zero writes',async()=>denied(()=>db.query("update organisation_plans set plan='basic',plan_key='solo' where organisation_id=$1",[org]),()=>db.query("update organisation_plans set plan='founder' where organisation_id=$1",[org])));
test('ownership revoked after reviewed snapshot denies with zero writes',async()=>denied(()=>db.query("update organisation_members set role='member' where organisation_id=$1 and user_id=$2",[org,actor]),()=>db.query("update organisation_members set role='owner' where organisation_id=$1 and user_id=$2",[org,actor])));
test('missing mirror denies and can be restored by Auth email update',async()=>denied(()=>db.query('delete from root_ops_private.founder_actor_identity where user_id=$1',[actor]),()=>db.query('update auth.users set email=email where id=$1',[actor])));
test('unsupported Auth email commits but mirror is ineligible',async()=>denied(()=>db.query('update auth.users set email=$1 where id=$2',['İ@example.test',actor]),()=>db.query('update auth.users set email=$1 where id=$2',[email,actor])));
test('Auth insert/update/delete maintain mirror within the transaction',async()=>{
 const id=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[id,'New@Example.Test']);
 assert.equal((await db.query('select normalized_email from root_ops_private.founder_actor_identity where user_id=$1',[id])).rows[0].normalized_email,'new@example.test');
 await db.exec('begin');await db.query('update auth.users set email=$1 where id=$2',['Changed@Example.Test',id]);
 assert.equal((await db.query('select normalized_email from root_ops_private.founder_actor_identity where user_id=$1',[id])).rows[0].normalized_email,'changed@example.test');await db.exec('rollback');
 assert.equal((await db.query('select normalized_email from root_ops_private.founder_actor_identity where user_id=$1',[id])).rows[0].normalized_email,'new@example.test');
 await db.query('delete from auth.users where id=$1',[id]);assert.equal((await db.query('select * from root_ops_private.founder_actor_identity where user_id=$1',[id])).rows.length,0);
});
test('trigger failure rolls back Auth update, insert and delete',async()=>{
 const deleteId=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[deleteId,'delete-test@example.test']);
 await db.exec("create function pg_temp.fail_mirror() returns trigger language plpgsql as $$begin raise exception 'PHASE2D_TEST mirror failure';end$$;create trigger test_mirror_failure before insert or update or delete on root_ops_private.founder_actor_identity for each row execute function pg_temp.fail_mirror()");
 try{await assert.rejects(db.query('update auth.users set email=$1 where id=$2',['changed@example.test',actor]),/mirror failure/);
 const id=randomUUID();await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[id,'unique@example.test']),/mirror failure/);
 await assert.rejects(db.query('delete from auth.users where id=$1',[deleteId]),/mirror failure/);
 assert.equal((await db.query('select * from auth.users where id=$1',[deleteId])).rows.length,1);
 assert.equal((await db.query('select * from root_ops_private.founder_actor_identity where user_id=$1',[deleteId])).rows.length,1);
 assert.equal((await db.query('select email from auth.users where id=$1',[actor])).rows[0].email,email);assert.equal((await db.query('select * from auth.users where id=$1',[id])).rows.length,0);
 }finally{await db.exec('drop trigger test_mirror_failure on root_ops_private.founder_actor_identity');await db.query('delete from auth.users where id=$1',[deleteId]);}
});
test('browser and service roles cannot directly mutate private policy or mirror',async()=>{
 for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);try{
  for(const table of ['founder_authorization_policy','founder_actor_identity']){
   await assert.rejects(db.query('select * from root_ops_private.'+table),/permission denied/);
   await assert.rejects(db.query('delete from root_ops_private.'+table),/permission denied/);
  }
  await assert.rejects(policy(email),/permission denied/);
  if(role!=='service_role')await assert.rejects(allowed(),/permission denied/);else assert.equal(await allowed(),true);
 }finally{await db.exec('reset role');}}
});
test('trigger owner has no Auth privileges; helper never reads or locks Auth',async()=>{
 const r=(await db.query("select has_table_privilege('root_ops_founder_mirror_owner','auth.users','SELECT') s,has_table_privilege('root_ops_founder_mirror_owner','auth.users','UPDATE') u")).rows[0];assert.deepEqual(r,{s:false,u:false});
 const body=(await db.query("select prosrc from pg_proc where oid='root_ops_private.require_founder_authorization(uuid,uuid)'::regprocedure")).rows[0].prosrc;assert.ok(!body.includes('auth.users'));assert.equal((body.match(/for share/g)||[]).length,4);
});
test('all new helpers have explicit owners, empty search_path and minimum execution grants',async()=>{
 const functions=(await db.query(`select p.oid,p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') browser,
 has_function_privilege('service_role',p.oid,'EXECUTE') service
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='root_ops_private' or p.proname='founder_authorization_allowed'`)).rows;
 assert.equal(functions.length,5);
 for(const f of functions){assert.equal(f.anon,false);assert.equal(f.browser,false);assert.ok(f.proconfig.includes('search_path=""'));
  assert.equal(f.service,f.proname==='founder_authorization_allowed');
  assert.equal(f.owner,f.proname==='sync_founder_actor_identity'?'root_ops_founder_mirror_owner':'postgres');
  assert.equal(f.prosecdef,f.proname!=='normalize_founder_email');
 }
 const role=(await db.query("select rolcanlogin,rolsuper,rolcreaterole,rolbypassrls from pg_roles where rolname='root_ops_founder_mirror_owner'")).rows[0];
 assert.deepEqual(role,{rolcanlogin:false,rolsuper:false,rolcreaterole:false,rolbypassrls:false});
});
test('malformed mirror and policy values are rejected without changing authorization state',async()=>{
 const before=await counts();
 await assert.rejects(db.query("update root_ops_private.founder_actor_identity set normalized_email='İ@example.test' where user_id=$1",[actor]),/check constraint/);
 await assert.rejects(db.query('update root_ops_private.founder_actor_identity set revision=0 where user_id=$1',[actor]),/check constraint/);
 await assert.rejects(policy('İ@example.test'),/Unsupported/);assert.equal(await allowed(),true);assert.deepEqual(await counts(),before);
});
test('reviewed RPC replacement preserves the original body apart from pre-receipt authorization',()=>{
 const old=fs.readFileSync('supabase/migrations/20261023193032_reviewed_identity_decisions.sql','utf8').replace(/\r\n/g,'\n');
 const current=fs.readFileSync(migration,'utf8').replace(/\r\n/g,'\n');
 const expected=old.slice(old.indexOf('create function public.commit_reviewed_relationship_decision'),old.indexOf('revoke all on function public.relationship_review_snapshot')).trim();
 const actual=current.slice(current.indexOf('create or replace function public.commit_reviewed_relationship_decision'),current.lastIndexOf('\ncommit;')).replace('create or replace function','create function').replace(` if (p_payload->>'action'='create' and p_payload->>'table'='founder_research_records') or p_payload->>'action'='save_research' then
  perform root_ops_private.require_founder_authorization(p_org,p_actor);
 end if;\n`,'').trim();
 assert.equal(actual,expected);
});
