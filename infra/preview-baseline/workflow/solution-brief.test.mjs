import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture, ids, load, readSource } from "./helpers/solution-brief-fixture.mjs";
const model=load("lib/solutionBrief.ts"), audience=load("lib/presentationAudience.ts");
const plain=value=>JSON.parse(JSON.stringify(value));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
async function post(f,body) {const response=await f.route("app/api/solution-briefs/route.ts").POST(f.req({organisationId:ids.org,...body}));return {status:response.status,body:await response.json()};}
async function prepared(f) {
  const created=await post(f,{action:"create",requestId:ids.request});assert.equal(created.status,200);
  return created.body.brief;
}
async function approved(f) {
  const b=await prepared(f);const r=await post(f,{action:"approve",id:b.id,version:b.version,recommendation:{...b.recommendation,outcomes:"Recognise pressure and agree practical supportive actions"}});assert.equal(r.status,200);return r.body.brief;
}
test("migration changes zero existing source rows and browser roles cannot access request/resource/brief tables or RPCs",async()=>{
 const f=await fixture();try {
  const before=await f.sql.query("select to_jsonb(p)-'organisation_id'-'submission_payload' as row from proposal_requests p order by id");assert.deepEqual(before.rows.map(r=>r.row),f.original);
  for(const role of ["anon","authenticated"]){
   await f.sql.exec(`set role ${role}`);
   for(const table of ["proposal_requests","solution_briefs","resource_library"]) await assert.rejects(f.sql.query(`select * from ${table}`),/permission denied/);
   await assert.rejects(f.sql.query("select create_solution_brief($1,$2,$3,'{}')",[ids.org,ids.request,ids.user]),/permission denied/);
   await f.sql.exec("reset role");
  }
  await f.sql.exec("set role service_role");await f.sql.query("select * from solution_briefs");await f.sql.exec("reset role");
 }finally{await f.close();}
});
test("facts remain unchanged; interpretation, missing fields and pricing are separate",async()=>{
 const f=await fixture();try{
  const source=(await f.sql.query("select to_jsonb(p) as row from proposal_requests p where id=$1",[ids.request])).rows[0].row;
  const b=await prepared(f);assert.equal(b.source_request_id,ids.request);assert.deepEqual(b.source_snapshot,source);assert.equal(b.recommendation.sessions,1);
  assert.ok(model.missingBriefInformation(source).includes("Desired outcomes"));assert.match(b.recommendation.commercial,/human review/);
  const edit=await post(f,{action:"save",id:b.id,version:b.version,recommendation:{...b.recommendation,understoodNeed:"Reviewer interpretation",commercial:"Internal estimate requires commercial approval"}});assert.equal(edit.status,200);
  assert.deepEqual((await f.sql.query("select to_jsonb(p) as row from proposal_requests p where id=$1",[ids.request])).rows[0].row,source);
  const again=await prepared(f);assert.equal(again.id,b.id);assert.deepEqual(again.source_snapshot,source);
 }finally{await f.close();}
});
test("tenant and role checks deny anonymous, foreign, ambiguous and viewer writes before generation",async()=>{
 const f=await fixture();try{
  f.user(null);assert.equal((await post(f,{action:"create",requestId:ids.request})).status,401);f.user(ids.user);
  assert.equal((await post(f,{action:"create",requestId:ids.foreign})).status,404);
  assert.equal((await post(f,{action:"create",requestId:ids.foreign,organisationId:ids.other})).status,403);
  await f.sql.query("update organisation_members set role='viewer'");assert.equal((await post(f,{action:"create",requestId:ids.request})).status,403);
  assert.equal(f.generation.length,0);
  await f.sql.query("insert into organisation_members(organisation_id,user_id,role) values ($1,$2,'owner')",[ids.other,ids.user]);
  const response=await f.route("app/api/solution-briefs/route.ts").GET(f.req(null,"GET",`/api/solution-briefs?requestId=${ids.request}`));assert.equal(response.status,400);
 }finally{await f.close();}
});
test("approval validates essential fields and stale updates cannot overwrite reviewed recommendations",async()=>{
 const f=await fixture();try{
  const b=await prepared(f);
  assert.equal((await post(f,{action:"approve",id:b.id,version:b.version,recommendation:b.recommendation})).status,400);
  assert.equal((await post(f,{action:"generate",id:b.id,version:b.version})).status,400);
  const saved=await post(f,{action:"save",id:b.id,version:b.version,recommendation:b.recommendation});assert.equal(saved.status,200);
  assert.equal((await post(f,{action:"approve",id:b.id,version:b.version,recommendation:{...b.recommendation,outcomes:"Useful"}})).status,409);
 }finally{await f.close();}
});
test("approved brief uses the existing generator once, preserves request and links exactly one editable presentation",async()=>{
 const f=await fixture();try{
  const source=plain((await f.sql.query("select * from proposal_requests where id=$1",[ids.request])).rows[0]);const b=await approved(f);
  const result=await post(f,{action:"generate",id:b.id,version:b.version});assert.equal(result.status,200,JSON.stringify(result.body));
  const again=await post(f,{action:"generate",id:b.id,version:b.version});assert.equal(again.body.resourceId,result.body.resourceId);assert.equal(f.generation.length,1);
  const resources=(await f.sql.query("select * from resource_library")).rows;assert.equal(resources.length,1);assert.equal(resources[0].source_solution_brief_id,b.id);
  assert.deepEqual(plain((await f.sql.query("select * from proposal_requests where id=$1",[ids.request])).rows[0]),source);
  assert.equal(resources[0].content.slides.length,8);assert.deepEqual(resources[0].content.slides.map(s=>s.layout),["hero","divider","framework","evidence","framework","exercise","reflection","summary"]);
  assert.equal(resources[0].content.slides[3].slide_title,"Evidence to collect");
  const prompt=JSON.stringify(f.generation[0]);assert.match(prompt,/45 minutes/);assert.match(prompt,/in_person/);assert.match(prompt,/Nursing-home managers/);assert.doesNotMatch(prompt,/controlled.*@|commercial approval/i);
  const linked=(await f.sql.query("select * from solution_briefs where id=$1",[b.id])).rows[0];assert.equal(linked.presentation_resource_id,resources[0].id);
  const get=f.route("app/api/resource-library/route.ts").GET;const res=await get(f.req(null,"GET",`/api/resource-library?organisationId=${ids.org}`));assert.equal(res.status,200);assert.equal((await res.json()).resources[0].id,resources[0].id);
 }finally{await f.close();}
});
test("concurrent generation claim prevents duplicate AI calls and resource inserts",async()=>{
 const f=await fixture();try{
  const b=await approved(f);let release;f.pauseAI(new Promise(resolve=>release=resolve));
  const first=post(f,{action:"generate",id:b.id,version:b.version});while(!f.generation.length) await new Promise(resolve=>setTimeout(resolve,5));
  const second=await post(f,{action:"generate",id:b.id,version:b.version});assert.equal(second.status,409);release();assert.equal((await first).status,200);
  assert.equal(f.generation.length,1);assert.equal((await f.sql.query("select count(*)::int as n from resource_library")).rows[0].n,1);
 }finally{await f.close();}
});
test("failed generation releases its claim and a deliberate retry succeeds",async()=>{
 const f=await fixture();try{
  const b=await approved(f);f.failAI(true);assert.equal((await post(f,{action:"generate",id:b.id,version:b.version})).status,500);
  assert.equal((await f.sql.query("select generation_token from solution_briefs")).rows[0].generation_token,null);
  f.failAI(false);assert.equal((await post(f,{action:"generate",id:b.id,version:b.version})).status,200);
 }finally{await f.close();}
});
test("audience endpoint and renderer projection exclude every private field and foreign resources",async()=>{
 const f=await fixture();try{
  const b=await approved(f);const generated=await post(f,{action:"generate",id:b.id,version:b.version});
  const route=f.route("app/api/resources/[id]/route.ts");const response=await route.GET(f.req(null,"GET",`/api/resources/${generated.body.resourceId}?organisationId=${ids.org}&view=audience`));
  const text=JSON.stringify(await response.json());assert.equal(response.status,200);assert.doesNotMatch(text,/PRIVATE|speaker_notes|source_snapshot|source_request|approved_by|commercial|image_prompt|slide_goal/);
  assert.match(text,/Recognise workload pressure/);
  const denied=await route.GET(f.req(null,"GET",`/api/resources/${generated.body.resourceId}?organisationId=${ids.other}&view=audience`));assert.equal(denied.status,403);
  const unknown=audience.audienceSlide({slide_title:"Public",bullets:["Visible"],speaker_notes:"SECRET",new_private_field:"SECRET"});assert.doesNotMatch(JSON.stringify(unknown),/SECRET/);
 }finally{await f.close();}
});
test("resource CRUD retains standalone creation and rejects foreign sequence/resource writes",async()=>{
 const f=await fixture();try{
  const route=f.route("app/api/resource-library/route.ts");
  const response=await route.POST(f.req({organisationId:ids.org,title:"Standalone",resource_type:"presentation",content:{slides:[{slide_title:"Editable",bullets:["one"],speaker_notes:"private"}]}}));assert.equal(response.status,200);const resource=(await response.json()).resource;
  const denied=await route.PATCH(f.req({organisationId:ids.other,resourceId:resource.id,title:"Intrusion"},"PATCH"));assert.equal(denied.status,403);
  const noRecord=await route.PATCH(f.req({organisationId:ids.org,resourceId:ids.foreign,title:"Intrusion"},"PATCH"));assert.equal(noRecord.status,404);
  const sequence=await route.POST(f.req({organisationId:ids.org,sequenceId:ids.foreign,title:"No",resource_type:"guide"}));assert.equal(sequence.status,403);
 }finally{await f.close();}
});
test("presentation windows cannot hydrate private resources from browser caches or storage events",()=>{
 for(const path of ["present","presenter"]){const code=readSource(`app/dashboard/resources/${path}/[id]/page.tsx`);assert.doesNotMatch(code,/resourceCacheKey|readCachedResource/);assert.match(code,/\/api\/resources\//);}
 const main=readSource("app/dashboard/resources/page.tsx");const client=main.slice(main.indexOf("async function downloadClientPack"),main.indexOf("async function downloadCoursePack"));assert.doesNotMatch(client,/item\?\.speaker_notes/);assert.match(client,/slides\.map\(audienceSlide\)/);
});
test("source snapshot is immutable and unassigned legacy requests cannot be claimed by ID",async()=>{
 const f=await fixture();try{
  const b=await prepared(f);
  await assert.rejects(f.sql.query("update solution_briefs set source_snapshot='{}' where id=$1",[b.id]),/immutable/);
  await f.sql.query("update proposal_requests set organisation_id=null where id=$1",[ids.foreign]);
  assert.equal((await post(f,{action:"create",requestId:ids.foreign})).status,404);
  const constraints=await f.sql.query("select has_function_privilege('anon', 'complete_solution_presentation(uuid,uuid,uuid,jsonb)', 'execute') as allowed");assert.equal(constraints.rows[0].allowed,false);
 }finally{await f.close();}
});
test("public intake binds only to its explicit server owner and request dashboard is tenant scoped",async()=>{
 const f=await fixture();try{
  const route=f.route("app/api/proposal-requests/route.ts");f.user(null);
  const created=await route.POST(f.req({organisationId:ids.other,workshop_title:"Controlled intake",audience:"Managers",notes:"Original submission"}));assert.equal(created.status,200);
  const stored=(await f.sql.query("select * from proposal_requests where workshop_title='Controlled intake'")).rows[0];assert.equal(stored.organisation_id,ids.org);assert.equal(stored.notes,"Original submission");assert.deepEqual(stored.submission_payload,{organisationId:ids.other,workshop_title:"Controlled intake",audience:"Managers",notes:"Original submission"});
  assert.equal((await route.GET(f.req(null,"GET","/api/proposal-requests"))).status,401);f.user(ids.user);
  const visible=await route.GET(f.req(null,"GET",`/api/proposal-requests?organisationId=${ids.org}`));assert.doesNotMatch(JSON.stringify(await visible.json()),/PRIVATE OTHER TENANT/);
  const denied=await route.PATCH(f.req({organisationId:ids.org,id:ids.foreign,status:"accepted"},"PATCH"));assert.equal(denied.status,404);
 }finally{await f.close();}
});
test("interrupted claims allow deliberate recovery after ten minutes; old token cannot save a second resource",async()=>{
 const f=await fixture();try{
  const b=await approved(f), token=ids.foreign;
  await f.sql.query("update solution_briefs set generation_token=$1,generation_started_at=now()-interval '11 minutes' where id=$2",[token,b.id]);
  assert.equal((await post(f,{action:"generate",id:b.id,version:b.version})).status,200);
  const complete=await f.db.rpc("complete_solution_presentation",{p_org:ids.org,p_brief:b.id,p_token:token,p_content:{slides:[]}});assert.equal(complete.error,null);
  assert.equal((await f.sql.query("select count(*)::int as n from resource_library")).rows[0].n,1);
 }finally{await f.close();}
});
test("raw submission facts override intake defaults without changing the original payload",()=>{
 const source={id:ids.request,organisation_id:ids.org,workshop_title:"Recovery & Resilience Workshop",initiative:"Recovery Reset Month",submission_payload:{notes:"Actual request",audience:"Managers",timing:"November",desired_outcomes:"Support practical prevention",client_organisation:"Controlled client"}};
 const before=JSON.stringify(source);const proposed=model.proposeSolutionBrief(source);
 assert.equal(model.requestFact(source,"workshop_title"),"");assert.match(proposed.intervention,/proposed/);assert.equal(proposed.outcomes,"Support practical prevention");assert.equal(model.requestFact(source,"timing"),"November");assert.equal(JSON.stringify(source),before);
});
test("rendered audience layouts never include private presenter text or new internal fields",()=>{
 const Slide=load("app/dashboard/resources/SolutionSlide.tsx").default;
 for(const layout of ["hero","divider","framework","evidence","exercise","reflection","summary"]){
  const html=renderToStaticMarkup(React.createElement(Slide,{slide:{slide_title:"Public topic",layout,bullets:["Visible audience content"],speaker_notes:"PRIVATE SCRIPT",internal_notes:"PRIVATE INTERNAL",facilitation:"PRIVATE PROMPT"}}));
  assert.match(html,/Visible audience content/);assert.doesNotMatch(html,/PRIVATE/);assert.match(html,new RegExp(`solution-slide-${layout}`));
 }
});
test("review UI blocks dirty generation, shows server errors and recovers to the linked resource",async()=>{
 let brief={id:ids.request,organisation_id:ids.org,source_request_id:ids.request,source_snapshot:{id:ids.request,organisation_id:ids.org,audience:"Managers",notes:"Submitted need"},recommendation:{...plain(model.proposeSolutionBrief({id:ids.request,organisation_id:ids.org})),audience:"Managers",outcomes:"Recognise pressure",format:"Online"},status:"approved",version:2,presentation_resource_id:null};
 let fail=true;const actions=[];
 const Page=load("app/dashboard/solution-briefs/page.tsx",{"@/lib/tenantFetch":{tenantFetch:async(_url,options)=>{
  if(!options?.method)return Response.json({brief});const body=JSON.parse(options.body);actions.push(body.action);
  if(body.action==="generate"){if(fail)return Response.json({error:"Controlled generation failure"},{status:503});brief={...brief,version:brief.version+1,presentation_resource_id:ids.foreign};return Response.json({resourceId:ids.foreign});}
  brief={...brief,recommendation:body.recommendation,status:body.action==="approve"?"approved":"draft",version:brief.version+1};return Response.json({brief});
 }}},{window:{location:{search:`?requestId=${ids.request}&organisationId=${ids.org}`}}}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Page));});
 const button=name=>tree.root.findAllByType("button").find(n=>n.children.join("")===name),generate=()=>button("Create presentation · uses AI allowance");
 assert.equal(generate().props.disabled,false);
 const outcome=tree.root.findAllByType("textarea").find(n=>n.props.value==="Recognise pressure");
 await renderer.act(async()=>outcome.props.onChange({target:{value:"Reviewed learning outcome"}}));assert.equal(generate().props.disabled,true);
 await renderer.act(async()=>button("Approve brief").props.onClick());assert.equal(generate().props.disabled,false);
 await renderer.act(async()=>generate().props.onClick());assert.match(JSON.stringify(tree.toJSON()),/Controlled generation failure/);assert.ok(tree.root.findAll(n=>n.props.role==="alert").length);
 fail=false;await renderer.act(async()=>generate().props.onClick());assert.match(JSON.stringify(tree.toJSON()),/Open in Resources/);assert.match(JSON.stringify(tree.toJSON()),/Submitted need/);
 assert.deepEqual(actions,["approve","generate","generate"]);await renderer.act(async()=>tree.unmount());
});

test("canonical Auth trigger creates owner membership and real profile/usage contracts reach generation",async()=>{
 const f=await fixture();try{
  const automatic=(await f.sql.query("select o.id from organisations o join organisation_members m on m.organisation_id=o.id where o.owner_id=$1 and m.user_id=$1 and m.role='owner' and o.id<>$2",[ids.user,ids.org])).rows;
  assert.equal(automatic.length,1);
  const b=await approved(f);assert.equal((await post(f,{action:"generate",id:b.id,version:b.version})).status,200);
  assert.equal((await f.sql.query("select count(*)::int as n from user_ai_usage where organisation_id=$1 and action='presentation_generation'",[ids.org])).rows[0].n,1);
  assert.ok(f.calls.some(c=>c.table==='organisation_profiles'&&c.operation==='select'));
  assert.ok(f.calls.some(c=>c.table==='organisation_plans'&&c.operation==='select'));
  assert.match(JSON.stringify(f.generation[0]),/Controlled Learning/);
 }finally{await f.close();}
});

test("real foreign request, brief and resource IDs are denied even within an authorized tenant selection",async()=>{
 const f=await fixture();try{
  const foreignBrief=await f.db.rpc('create_solution_brief',{p_org:ids.other,p_request:ids.foreign,p_user:ids.other,p_recommendation:plain(model.proposeSolutionBrief({id:ids.foreign,organisation_id:ids.other}))});assert.equal(foreignBrief.error,null);
  const foreignResource=(await f.sql.query("insert into resource_library(organisation_id,title,resource_type,content) values ($1,'PRIVATE FOREIGN RESOURCE','presentation','{}') returning id",[ids.other])).rows[0].id;
  assert.equal((await post(f,{action:'create',requestId:ids.foreign})).status,404);
  assert.equal((await post(f,{action:'save',id:foreignBrief.data.id,version:1,recommendation:{}})).status,404);
  const loaded=await f.route('app/api/solution-briefs/route.ts').GET(f.req(null,'GET',`/api/solution-briefs?organisationId=${ids.org}&id=${foreignBrief.data.id}`));
  assert.equal(loaded.status,200);assert.equal((await loaded.json()).brief,null);
  const resource=await f.route('app/api/resources/[id]/route.ts').GET(f.req(null,'GET',`/api/resources/${foreignResource}?organisationId=${ids.org}&view=audience`));assert.equal(resource.status,404);
  assert.equal(f.generation.length,0);
 }finally{await f.close();}
});

test("database source immutability and composite tenant FKs enforce linkage independently of routes",async()=>{
 const f=await fixture();try{
  const b=await prepared(f);
  for(const [column,value] of [['source_snapshot','{}'],['source_request_id',ids.foreign],['organisation_id',ids.other],['created_by',ids.other]]){
   await assert.rejects(f.sql.query(`update solution_briefs set ${column}=$1 where id=$2`,[value,b.id]),/immutable/);
  }
  await assert.rejects(f.sql.query("insert into resource_library(organisation_id,title,resource_type,source_solution_brief_id) values ($1,'Wrong tenant','presentation',$2)",[ids.other,b.id]),/foreign key/);
  const stale=await f.db.rpc('claim_solution_presentation',{p_org:ids.org,p_brief:b.id,p_version:999,p_token:ids.foreign});assert.equal(stale.data,false);
  assert.equal((await f.sql.query('select count(*)::int as n from resource_library')).rows[0].n,0);
 }finally{await f.close();}
});

test("standalone Resources edit, rename, duplicate, delete and private presenter contract remain compatible",async()=>{
 const f=await fixture();try{
  const route=f.route('app/api/resource-library/route.ts');
  const create=async(title,content)=>{const res=await route.POST(f.req({organisationId:ids.org,title,resource_type:'presentation',content}));assert.equal(res.status,200);return(await res.json()).resource;};
  const content={slides:[{slide_title:'Visible',bullets:['Public'],speaker_notes:'PRIVATE SCRIPT',timing:'PRIVATE TIMING',facilitation:'PRIVATE FACILITATION',uploaded_image_url:'https://example.invalid/controlled.png',active_image_source:'upload'}]};
  const first=await create('Standalone',content);
  const edited=await route.PATCH(f.req({organisationId:ids.org,resourceId:first.id,title:'Renamed',content},'PATCH'));assert.equal(edited.status,200);
  const duplicate=await create('Renamed (copy)',(await edited.json()).resource.content);assert.notEqual(first.id,duplicate.id);
  const get=f.route('app/api/resources/[id]/route.ts').GET;
  const presenter=await get(f.req(null,'GET',`/api/resources/${first.id}?organisationId=${ids.org}`));assert.match(JSON.stringify(await presenter.json()),/PRIVATE SCRIPT/);
  const audienceResponse=await get(f.req(null,'GET',`/api/resources/${first.id}?organisationId=${ids.org}&view=audience`));const shown=JSON.stringify(await audienceResponse.json());assert.doesNotMatch(shown,/PRIVATE/);assert.match(shown,/controlled.png/);
  assert.equal((await route.DELETE(f.req({organisationId:ids.org,resourceId:duplicate.id},'DELETE'))).status,200);
  const saved=(await f.sql.query('select * from resource_library')).rows;assert.equal(saved.length,1);assert.equal(saved[0].title,'Renamed');assert.equal(saved[0].source_solution_brief_id,null);
 }finally{await f.close();}
});
