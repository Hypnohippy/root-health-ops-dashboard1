import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const url=process.env.FOUNDER_LOCAL_PG_URL;
const enabled=!!url;
const localTest=(name,fn)=>test(name,{skip:!enabled},fn);
let a,b,observer;const actor=randomUUID(),org=randomUUID(),email='phase2d_test_race@example.test';
before(async()=>{
 if(!enabled)return;
 const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');
 const {Client}=createRequire(new URL('../infra/founder-authorization/package.json',import.meta.url))('pg');
 [a,b,observer]=[0,1,2].map(()=>new Client({connectionString:url}));await Promise.all([a.connect(),b.connect(),observer.connect()]);
 console.log(JSON.stringify({engine:(await observer.query('select version() v')).rows[0].v,connections:[a.processID,b.processID,observer.processID]}));
 for(const file of ['infra/preview-baseline/local-platform.sql','infra/preview-baseline/migrations/00000000000000_root_ops_schema_baseline.sql','supabase/migrations/20261019120000_solution_brief_foundation.sql','supabase/migrations/20261023193032_reviewed_identity_decisions.sql','supabase/migrations/20261024184449_atomic_founder_authorization.sql']){
  if(file.includes('00000000000000'))await a.query("set root_ops.empty_preview_baseline='on'");await a.query(fs.readFileSync(file,'utf8'));
 }
 await a.query('insert into auth.users(id,email) values($1,$2)',[actor,email]);
 await a.query("insert into organisations(id,owner_id,name,slug) values($1,$2,'PHASE2D_TEST_RACE',$3)",[org,actor,org]);
 await a.query("insert into organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",[org,actor]);
 await a.query("insert into organisation_plans(organisation_id,plan,posts_per_month) values($1,'founder',100)",[org]);
 await a.query('select root_ops_private.set_founder_authorization_policy($1)',[email]);
});
after(async()=>{await Promise.all([a,b,observer].filter(Boolean).map(c=>c.end()));});
const counts=async()=> (await observer.query(`select
 (select count(*)::int from founder_research_records) sources,
 (select count(*)::int from relationship_workspaces) workspaces,
 (select count(*)::int from relationship_source_links) links,
 (select count(*)::int from relationship_review_receipts) receipts,
 (select count(*)::int from relationship_identity_decisions) decisions`)).rows[0];
const stamp=async()=> (await observer.query('select relationship_review_snapshot($1,$2) v',[org,actor])).rows[0].v;
const payload=()=>{const id=randomUUID();return {action:'create',table:'founder_research_records',kind:'company',row:{id,organisation_id:org,created_by:actor,entity_kind:'company',company:'PHASE2D_TEST_'+id,research_snapshot:{name:'PHASE2D_TEST_'+id},saved:true,lane:'open_intelligence',geography:'UK'},separations:[],createdAliases:[]};};
const commit=(client,p,s,key=randomUUID())=>client.query('select commit_reviewed_relationship_decision($1,$2,$3,$4,$5) v',[org,actor,key,s,JSON.stringify(p)]);
async function blocked(client,blocker){
 const deadline=Date.now()+1500;
 while(Date.now()<deadline){const {rows}=await observer.query('select $2::int=any(pg_blocking_pids($1)) blocked',[client.processID,blocker.processID]);if(rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.fail('Expected real PostgreSQL lock wait was not observed');
}
const changes={
 policy:{revoke:c=>c.query("select root_ops_private.set_founder_authorization_policy('revoked@example.test')"),restore:c=>c.query('select root_ops_private.set_founder_authorization_policy($1)',[email])},
 email:{revoke:async c=>{await c.query('set local role supabase_auth_admin');return c.query("update auth.users set email='revoked@example.test' where id=$1",[actor]);},restore:c=>c.query('update auth.users set email=$1 where id=$2',[email,actor])},
 plan:{revoke:c=>c.query("update organisation_plans set plan='basic',plan_key='solo' where organisation_id=$1",[org]),restore:c=>c.query("update organisation_plans set plan='founder' where organisation_id=$1",[org])},
 ownership:{revoke:c=>c.query("update organisation_members set role='member' where organisation_id=$1 and user_id=$2",[org,actor]),restore:c=>c.query("update organisation_members set role='owner' where organisation_id=$1 and user_id=$2",[org,actor])}
};
for(const [name,change]of Object.entries(changes)){
 localTest(name+': protected write locks first; revocation waits until commit',async()=>{
  const p=payload(),snapshot=await stamp();await a.query('begin');await a.query('set local role service_role');
  try{
   await commit(a,p,snapshot);await b.query('begin');const revocation=change.revoke(b);await blocked(b,a);
   await a.query('commit');await revocation;await b.query('commit');
   assert.equal((await observer.query('select id from founder_research_records where id=$1',[p.row.id])).rows.length,1);
   await assert.rejects(commit(a,p,snapshot),/Protected review unavailable|Review unavailable/);
  }finally{await a.query('rollback');await b.query('rollback');await change.restore(observer);}
 });
 localTest(name+': revocation locks first; waiting write sees revoked state and rolls back',async()=>{
  const before=await counts(),p=payload(),snapshot=await stamp();await b.query('begin');await change.revoke(b);
  await a.query('begin');await a.query('set local role service_role');
  // Attach rejection handling immediately; the transaction intentionally waits.
  const result=commit(a,p,snapshot).then(()=>({ok:true}),error=>({error}));
  try{await blocked(a,b);await b.query('commit');const outcome=await result;assert.match(outcome.error?.message||'',/Protected review unavailable/);await a.query('rollback');assert.deepEqual(await counts(),before);}
  finally{await a.query('rollback');await b.query('rollback');await change.restore(observer);}
 });
}
localTest('real lock timeout aborts without partial state or automatic retry',async()=>{
 const before=await counts(),snapshot=await stamp();await b.query('begin');await changes.policy.revoke(b);
 try{await assert.rejects(commit(a,payload(),snapshot),e=>e.code==='55P03');assert.deepEqual(await counts(),before);}
 finally{await b.query('rollback');}
});
localTest('two connections replay one receipt with one source/workspace/link',async()=>{
 const p=payload(),snapshot=await stamp(),key=randomUUID(),before=await counts();
 const results=await Promise.all([commit(a,p,snapshot,key),commit(b,p,snapshot,key)]);
 assert.equal(results.filter(r=>r.rows[0].v.duplicate).length,1);const current=await counts();
 for(const k of ['sources','workspaces','links','receipts'])assert.equal(current[k],before[k]+1);
 assert.equal(current.decisions,before.decisions);
});
async function researchPayload(){
 const p=payload(),created=(await commit(a,p,await stamp())).rows[0].v;
 const w=(await observer.query('select revision from relationship_workspaces where id=$1',[created.workspaceId])).rows[0];
 const row=payload().row;row.research_snapshot.phase2d={verification:'matched_public',approvedBy:actor,sourceRefs:[{table:'founder_research_records',id:p.row.id}],sources:[{url:'https://example.test/report'}],facts:[{claim:'PHASE2D_TEST synthetic evidence',sourceUrls:['https://example.test/report']}]};
 return {action:'save_research',table:'founder_research_records',kind:'company',row,refs:[{table:'founder_research_records',id:p.row.id}],workspaceId:created.workspaceId,workspaceRevision:w.revision};
}
localTest('research vs policy revocation: revocation wins and leaves zero partial evidence',async()=>{
 const p=await researchPayload(),snapshot=await stamp(),before=await counts();await b.query('begin');await changes.policy.revoke(b);
 const outcome=commit(a,p,snapshot).then(()=>({ok:true}),error=>({error}));
 try{await blocked(a,b);await b.query('commit');assert.match((await outcome).error?.message||'',/Protected review unavailable/);assert.deepEqual(await counts(),before);}
 finally{await b.query('rollback');await changes.policy.restore(observer);}
});
localTest('research vs policy revocation: authorized save commits before waiting revocation',async()=>{
 const p=await researchPayload(),snapshot=await stamp(),before=await counts();await a.query('begin');await a.query('set local role service_role');
 try{await commit(a,p,snapshot);await b.query('begin');const revocation=changes.policy.revoke(b);await blocked(b,a);await a.query('commit');await revocation;await b.query('commit');
 const current=await counts();assert.equal(current.sources,before.sources+1);assert.equal(current.receipts,before.receipts+1);assert.equal(current.workspaces,before.workspaces);
 }finally{await a.query('rollback');await b.query('rollback');await changes.policy.restore(observer);}
});
localTest('forced deadlock aborts a transaction; rollback leaves no partial protected state',async()=>{
 const snapshot=await stamp(),before=await counts();await b.query('begin');await b.query("set local deadlock_timeout='50ms'");
 await b.query('lock table founder_research_records in share row exclusive mode');
 await a.query('begin');const write=commit(a,payload(),snapshot).then(()=>({ok:true}),error=>({error}));
 try{await blocked(a,b);const revocation=changes.policy.revoke(b).then(()=>({ok:true}),error=>({error}));
  // At least one side must error. Rolling back the victim releases the survivor.
  const first=await Promise.race([write.then(result=>({side:'a',result})),revocation.then(result=>({side:'b',result}))]);
  assert.equal(first.result.error?.code,'40P01');await (first.side==='a'?a:b).query('rollback');
  await Promise.all([write,revocation]);await a.query('rollback');await b.query('rollback');assert.deepEqual(await counts(),before);
 }finally{await a.query('rollback');await b.query('rollback');}
});
