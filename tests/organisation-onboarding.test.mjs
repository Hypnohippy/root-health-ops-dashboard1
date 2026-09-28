import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, deps) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: n => { assert.ok(n in deps, n); return deps[n]; }, process: { env: {} }, console });
  return mod.exports;
}
class AccessError extends Error { constructor(message, status=403) { super(message); this.status=status; } }
const auth = { AccessError, accessErrorResponse: e => e instanceof AccessError ? {status:e.status} : null };
const response = { NextResponse: { json: (body, options={}) => ({body,status:options.status||200}) } };
function fixture(user, rows=[], error=null) {
  const q = { select(){return q;},eq(key,value){assert.equal(key,'user_id');assert.equal(value,user);return q;},limit(n){assert.equal(n,2);return {data:rows,error};} };
  return load('lib/organisationOnboarding.ts', {'@/lib/supabaseServer':{getCurrentUserId:async()=>user},'@/lib/supabaseAdmin':{supabaseAdmin:{from(table){assert.equal(table,'organisation_members');return q;}}},'@/lib/tenantAuth':auth});
}
test('onboarding rejects anonymous, forged identity, existing membership, ambiguity and database failure', async()=>{
  for(const [user,rows,error,claim,status] of [[null,[],null,undefined,401],['reviewer',[],null,'victim',403],['reviewer',[{organisation_id:'review',role:'manager'}],null,undefined,409],['reviewer',[{},{}],null,undefined,409],['reviewer',[],{},undefined,503]]) {
    await assert.rejects(fixture(user,rows,error).requireNewOrganisationUser(claim),e=>e.status===status);
  }
  assert.equal(await fixture('new-customer').requireNewOrganisationUser('new-customer'),'new-customer');
});
for(const route of ['org-setup2','ensure-organisation','organisations','college-activation']) {
 test(`${route}: rejects before any data or storage mutation`,async()=>{
  const db={from(){throw Error('Unexpected database access');},storage:{}};
  const helper={requireOnboardingIdentity:async()=>{throw new AccessError('No session',401);},requireNewOrganisationUser:async()=>{throw new AccessError('No session',401);}};
  const handler=load(`app/api/${route}/route.ts`,{'next/server':response,'@/lib/organisationOnboarding':helper,'@/lib/tenantAuth':auth,'@/lib/supabaseAdmin':{supabaseAdmin:db},'../../../lib/supabaseAdmin':{supabaseAdmin:db},'@supabase/supabase-js':{createClient:()=>db},crypto:{randomUUID:()=> 'new-id'}});
  assert.equal((await handler.POST({json:async()=>({userId:'victim'}),formData:async()=>{throw Error('Must authorise first');}})).status,401);
 });
}
test('org-setup2 cannot promote manager or viewer, even in own workspace',async()=>{
 for(const role of ['manager','viewer','admin']) {
 const handler=load('app/api/org-setup2/route.ts',{'next/server':response,'@/lib/organisationOnboarding':{requireOnboardingIdentity:async()=>({userId:'reviewer',membership:{organisation_id:'review',role}})},'@/lib/tenantAuth':auth,'@/lib/supabaseAdmin':{supabaseAdmin:{from(){throw Error('No mutation');}}},crypto:{}});
 assert.equal((await handler.POST({formData:async()=>{throw Error('No upload');}})).status,403);
 }
});
test('bootstrap resolves only authorised membership and performs no assignment',async()=>{
 const handler=load('app/api/onboarding/bootstrap/route.ts',{'next/server':response,'@/lib/tenantAuth':{...auth,requireOrganisation:async(id,write)=>{assert.equal(write,false);if(id!=='review')throw new AccessError('Foreign tenant');return {organisationId:id,userId:'reviewer',role:'manager'};}}});
 assert.equal((await handler.POST({json:async()=>({organisationId:'foreign'})})).status,403);
 assert.equal((await handler.POST({json:async()=>({organisationId:'review'})})).body.role,'manager');
});
test('legacy org-setup delegates to guarded onboarding; no default tenant or membership upsert remains',()=>{
 assert.match(fs.readFileSync('app/api/org-setup/route.ts','utf8'),/export \{ POST, runtime \} from "..\/org-setup2\/route"/);
 for(const path of ['app/api/org-setup2/route.ts','app/api/onboarding/bootstrap/route.ts']) assert.doesNotMatch(fs.readFileSync(path,'utf8'),/FALLBACK_OWNER_ID|SINGLE_ORG_ID|\.upsert\(/);
});
test('new customer receives membership only in newly created workspace; owner repeat does not rewrite membership',async()=>{
 for(const existing of [false,true]) {
 const writes=[];
 const db={from(table){const q={insert(value){writes.push({table,kind:'insert',value});return q;},update(value){writes.push({table,kind:'update',value});return q;},eq(k,v){assert.equal(k,'id');assert.equal(v,'owned');return q;},select(){return q;},single:async()=>({data:{id:existing?'owned':'fresh'},error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;}};
 const handler=load('app/api/org-setup2/route.ts',{'next/server':response,'@/lib/organisationOnboarding':{requireOnboardingIdentity:async()=>({userId:'customer',membership:existing?{organisation_id:'owned',role:'owner'}:null})},'@/lib/tenantAuth':auth,'@/lib/supabaseAdmin':{supabaseAdmin:db},crypto:{randomUUID:()=> 'uuid'}});
 const result=await handler.POST({formData:async()=>({get:key=>key==='orgName'?'New Practice':null})});
 assert.equal(result.status,200);
 const members=writes.filter(w=>w.table==='organisation_members');
 assert.equal(members.length,existing?0:1);
 if(!existing){assert.equal(members[0].value.user_id,'customer');assert.equal(members[0].value.organisation_id,'fresh');}
 else assert.equal('owner_id' in writes[0].value,false);
 }
});
