import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',key='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function load(file,mocks={},globals={}) { const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Buffer,Request,Response,...globals,require:n=>n in mocks?mocks[n]:n.startsWith('@/lib/')?load(n.replace('@/','')+'.ts',mocks,globals):require(n)});return mod.exports; }
const helpers=load('lib/manualAcquisition.ts');
const body=(input={note:'  Barnardo’s\nFound at an event  '})=>({action:'create',organisationId:org,input,submissionId:key,recordType:'b2b_lead',confirmed:true,publicContextConfirmed:true});
test('sparse manual input preserves exact user text and unknown fields without claiming research',()=>{
  for(const input of [{note:'Carole Spiers, ISMA UK'},{company:'Barnardo’s'},{linkedin:'https://www.linkedin.com/in/example'},{note:'ABC Care Homes - spoke with their People Director at an event'},{website:'https://example.org',email:'person@example.org'}]) {
    const record=helpers.manualRecord(org,user,body(input));assert.equal(record.source_engine,'manual_ops');assert.equal(record.status,'new');assert.equal(record.metadata.manual_review.research.status,'not_performed');
    for(const [k,v] of Object.entries(input))assert.equal(record.metadata.user_provided[k],v);
    assert.equal(record.metadata.manual_review.verifiedFacts.length,0);assert.equal(record.metadata.manual_review.aiSuggestions.length,0);assert.equal(record.metadata.created_by,user);
    assert.equal(record.engine_state,undefined);
  }
});
test('research unavailable is explicit; no fabricated facts, sources, type or inferred person',()=>{
  const review=helpers.manualReview(helpers.parseManualInput({note:'Carole Spiers, ISMA UK'}),true);
  assert.equal(review.research.status,'unavailable');assert.equal(review.suggestedType,null);assert.equal(review.verifiedFacts.length,0);assert.equal(review.publicSources.length,0);assert.equal(review.aiSuggestions.length,0);assert.equal(review.userProvided.person,'');
  const record=helpers.manualRecord(org,user,{...body(),requestedResearch:true});assert.equal(record.metadata.manual_review.research.status,'unavailable');assert.equal(record.person,null);
});
test('type and public context require explicit confirmation; no named Personal/Social consumer prospect entry',()=>{
  for(const change of [{recordType:''},{recordType:'guessed'},{confirmed:false},{publicContextConfirmed:false}])assert.throws(()=>helpers.manualRecord(org,user,{...body(),...change}));
  for(const recordType of ['personal_opportunity','social_opportunity']) {
    assert.throws(()=>helpers.manualRecord(org,user,{...body({person:'Consumer'}),recordType}),/public demand/);
    assert.equal(helpers.manualRecord(org,user,{...body({note:'Public workplace stress content demand'}),recordType}).record_type,recordType);
  }
});
test('malformed and unsafe URLs and multiple email recipients fail closed without fetching URLs',()=>{
  for(const website of ['javascript:alert(1)','https://user:pass@example.org','http://127.0.0.1','http://[::1]','http://localhost','https://example.local','https://example.org:444','not a URL'])assert.throws(()=>helpers.parseManualInput({website}));
  assert.throws(()=>helpers.parseManualInput({linkedin:'https://evil.example/in/person'}));assert.throws(()=>helpers.parseManualInput({email:'a@example.org,b@example.org'}));
  assert.throws(()=>helpers.parseManualInput({}));
});
test('manual API requires tenant write access before review or database work',async()=>{
  let accessed=false;
  const api=load('app/api/growth/acquisition/manual/route.ts',{'@/lib/tenantAuth':{requireOrganisation:async(selected,write)=>{assert.equal(selected,org);assert.equal(write,true);throw Error('denied');},accessErrorResponse:()=>({status:403})},'@/lib/supabaseAdmin':{supabaseAdmin:{from(){accessed=true;throw Error();}}},'next/server':{NextResponse:{json:(b,o)=>({body:b,status:o?.status||200})}}});
  for(const action of ['review','create'])assert.equal((await api.POST(new Request('https://ops.test/api/growth/acquisition/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body(),action})}))).status,403);
  assert.equal(accessed,false);
});
test('real acquisition table: manual create and retries use existing tenant unique key; no target or sender writes',async()=>{
  const db=new PGlite();try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create table organisations(id uuid primary key);insert into organisations values('${org}');`);
    await db.exec(fs.readFileSync('supabase/migrations/20260923140000_acquisition_ingestion.sql','utf8'));
    const adapter={from(table){assert.equal(table,'acquisition_items');let record,filters=[];const q={upsert(value,options){record=value;assert.equal(options.ignoreDuplicates,true);return q;},select(){if(record)return db.query('insert into acquisition_items(organisation_id,source_engine,source_record_id,record_type,status,metadata,evidence) values($1,$2,$3,$4,$5,$6,$7) on conflict(organisation_id,source_engine,source_record_id) do nothing returning id',[record.organisation_id,record.source_engine,record.source_record_id,record.record_type,record.status,record.metadata,record.evidence]).then(r=>({data:r.rows}));return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){assert.deepEqual(filters,[['organisation_id',org],['source_engine','manual_ops'],['source_record_id',`manual:${key}`]]);return {data:(await db.query('select * from acquisition_items where organisation_id=$1 and source_engine=$2 and source_record_id=$3',filters.map(([,v])=>v))).rows[0]};}};return q;}};
    const api=load('app/api/growth/acquisition/manual/route.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:adapter},'@/lib/tenantAuth':{requireOrganisation:async()=>({organisationId:org,userId:user}),accessErrorResponse:()=>null},'next/server':{NextResponse:{json:(b,o)=>({body:b,status:o?.status||200})}}});
    const post=data=>api.POST(new Request('https://ops.test/api/growth/acquisition/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}));
    for(const requestedResearch of [false,true])assert.equal((await post({...body(),action:'review',requestedResearch})).status,200);
    const first=await post(body());assert.equal(first.status,200);const retry=await post(body());assert.equal(retry.body.id,first.body.id);assert.equal(retry.body.duplicate,true);assert.match(first.body.destination,/\/dashboard\/growth\/acquisition\?/);
    assert.equal((await post({...body(),input:{note:'Different'}})).status,409);
    const rows=(await db.query('select * from acquisition_items')).rows;assert.equal(rows.length,1);assert.equal(rows[0].metadata.user_provided.note,body().input.note);
  }finally{await db.close();}
});

test('manual form reviews sparse input, requires type confirmation and retries the same submission without sending',async()=>{
  const state=[];let index=0;const requests=[];let destination;
  const react={useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];}};
  const Component=load('app/dashboard/growth/acquisition/ManualOpportunity.tsx',{react},{crypto:{randomUUID:()=>key},window:{location:{assign:value=>destination=value}},fetch:async(path,options)=>{
    assert.equal(path,'/api/growth/acquisition/manual');const data=JSON.parse(options.body);requests.push(data);
    if(data.action==='review')return {ok:true,json:async()=>({review:helpers.manualReview(helpers.parseManualInput(data.input),data.requestedResearch)})};
    if(requests.filter(r=>r.action==='create').length===1)throw Error('Lost response');
    return {ok:true,json:async()=>({destination:'/dashboard/growth/acquisition?itemId=created'})};
  }}).default;
  function nodes(tree,type){const out=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;if(n.type===type)out.push(n);walk(n.props?.children);}walk(tree);return out;}
  const render=()=>{index=0;return Component({organisationId:org});};nodes(render(),'button')[0].props.onClick();
  nodes(render(),'textarea')[0].props.onChange({target:{value:'Barnardo’s'}});
  nodes(render(),'button').find(n=>n.props.children==='Create without research').props.onClick();await new Promise(r=>setTimeout(r,0));
  assert.equal(requests.length,1);assert.equal(requests[0].action,'review');assert.equal(nodes(render(),'button').find(n=>n.props.children==='Confirm & create').props.disabled,true);
  nodes(render(),'select')[0].props.onChange({target:{value:'b2b_lead'}});nodes(render(),'input').find(n=>n.props.type==='checkbox').props.onChange({target:{checked:true}});
  nodes(render(),'button').find(n=>n.props.children==='Confirm & create').props.onClick();await new Promise(r=>setTimeout(r,0));
  nodes(render(),'button').find(n=>n.props.children==='Retry same submission').props.onClick();await new Promise(r=>setTimeout(r,0));
  assert.equal(requests[1].submissionId,key);assert.equal(requests[2].submissionId,key);assert.equal(requests[1].input.note,'Barnardo’s');assert.match(destination,/acquisition\?itemId=/);
  assert.doesNotMatch(JSON.stringify(requests),/approve-send|sendMail|growth_targets/);
});


test('strategic research fields survive parsing only when grounded to searched sources',()=>{
  const input=helpers.parseManualInput({company:'KBR',website:'https://kbr.com'});
  const review=helpers.parseManualResearchReview({
    research:{status:'completed',message:'done',searchCalls:6},
    publicSources:[{url:'https://kbr.com/report',title:'Report',sourceType:'official',publishedAt:'2026'}],
    verifiedFacts:[{claim:'Long-running wellbeing measurement',category:'alignment',sourceUrls:['https://kbr.com/report']}],
    strategicAlignment:'Strong historical and current alignment',
    strategicAlignmentScore:92,
    strategicContinuity:{fromYear:2020,toYear:2026,summary:'Programme continues across multiple years.',sourceUrls:['https://kbr.com/report','https://not-searched.example']},
    operationalGap:'Implementation appears to depend on delegated human action.',
    rootFit:'Root can target and monitor interventions.',
    researchQuestions:['Who owns UK intervention procurement?'],
    evidenceConfidence:'high',
    opportunityScore:74,
    scoreBreakdown:{strategicAlignment:28,problemRelevance:25,operationalOpportunity:20,decisionMakerQuality:0,currentSignal:1},
    outreachAngle:'Do not sell generic wellbeing; position Root as the targeting and execution layer.',
    decision:'needs_verification'
  },input);
  assert.equal(review.strategicAlignmentScore,92);assert.equal(review.strategicContinuity.fromYear,2020);assert.deepEqual(review.strategicContinuity.sourceUrls,['https://kbr.com/report']);
  assert.equal(review.evidenceConfidence,'high');assert.equal(review.opportunityScore,74);assert.equal(review.verifiedFacts[0].category,'alignment');
});
