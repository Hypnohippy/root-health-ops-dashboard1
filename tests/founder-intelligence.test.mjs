import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {act,create} from 'react-test-renderer';
const require=createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,mocks={},globals={}){
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Date,console,...globals,require:n=>n in mocks?mocks[n]:n.startsWith('@/lib/')?load(n.replace('@/','')+'.ts',mocks,globals):require(n)});
 return mod.exports;
}
const model=load('lib/founderIntelligence.ts');
const url='https://example.test/official',source={url,title:'Official organisation evidence',sourceType:'official',publishedAt:null};
const candidate=(name,country='UK',organisationType='employer',more={})=>({name,country,organisationType,website:url,fitScore:80,why:'Sourced workforce pressure',audience:'Shift workforce',partnershipMechanism:'Workforce implementation',evidenceSummary:'Official evidence',sourceUrls:[url],...more});
function harness(responses){const requests=[];const api=load('lib/founderIntelligence.server.ts',{}, {process:{env:{OPENAI_API_KEY:'isolated-test-placeholder'}},fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));assert.ok(responses.length,'Unexpected extra research request');const parsed=responses.shift();return {ok:true,json:async()=>({output_text:JSON.stringify(parsed),output:[{type:'web_search_call',action:{sources:[source]}}]})};}});return {api,requests};}
const deepOutput={name:'Example Employer',website:url,organisationalFitScore:85,buyerRelevanceScore:80,timingEvidenceScore:70,organisationalFit:'Shift workforce fit',buyerRelevance:'People Director owns workforce wellbeing',timingEvidence:'Sourced organisational change',strategicFit:'Public strategic fit',audienceFit:'Shift workforce',channelReadiness:'Evidenced channel',memberSuccessValue:'Legacy graduate value',strategicFitScore:99,channelReadinessScore:99,memberSuccessDependencyScore:99,evidenceConfidence:'high',valueExchange:{theyGive:['Workforce pilot'],weGive:['Root tools'],moneyFlow:[],successMeasures:['Pilot activation']},currentSignals:['Public change'],entityNotes:[],economicModels:[],risks:[],recommendedApproach:'Ask the relevant owner about priorities',contactRoles:['People Director'],questions:[],sourceUrls:[url],publicSources:[source]};
async function deepFor(lane='workplace_buyers',geography='UK',output=deepOutput){const h=harness([output]);return {...h,result:await h.api.deepenFounderOrganisation(lane,{name:output.name},geography)};}

test('new lanes, labels, geography defaults, starter prompts and legacy identifiers remain distinct',()=>{
 assert.deepEqual(Array.from(model.founderIntelligenceLanes),['workplace_buyers','personal_partners','workplace_introducers','open_intelligence']);
 assert.equal(model.founderLaneLabel('workplace_buyers'),'Employer prospects');assert.equal(model.founderLaneLabel('personal_partners'),'Personal Root partners');assert.equal(model.founderLaneLabel('workplace_introducers'),'Workplace introducers');assert.equal(model.founderLaneLabel('open_intelligence'),'Open intelligence');
 for(const lane of ['ops_distribution','health_referral','ops_user_channel']){assert.equal(model.parseFounderLane(lane),lane);assert.ok(model.founderLaneLabel(lane));}
 assert.equal(model.parseFounderGeography(undefined),'UK');assert.throws(()=>model.parseFounderGeography('Mars'),/Choose UK/);
 for(const lane of model.founderIntelligenceLanes)assert.doesNotMatch(model.founderStarterPrompt(lane),/\bUK\b/);
 assert.equal(model.founderPromotionDefault('workplace_buyers'),'b2b_lead');assert.equal(model.founderPromotionDefault('personal_partners'),'partner_opportunity');assert.equal(model.founderPromotionDefault('workplace_introducers'),'partner_opportunity');assert.equal(model.founderPromotionDefault('open_intelligence'),null);
});
test('employer discovery returns sourced employers and rejects colleges/registries/channels by default',async()=>{
 const h=harness([{items:[candidate('Care Employer'),candidate('Therapist Register','UK','registry'),candidate('Training College','UK','college'),candidate('Member Network','UK','membership_body'),candidate('Unknown Company','UK','other')],publicSources:[source]}]);
 const result=await h.api.discoverFounderOrganisations('workplace_buyers','Find employers');assert.deepEqual(Array.from(result.items,i=>i.name),['Care Employer']);
 const prompt=h.requests[0].input;assert.match(prompt,/roughly 50\+ employees/);assert.match(prompt,/retention\/absence/);assert.match(prompt,/Do not return therapist registries/);assert.match(prompt,/HR\/People\/Wellbeing\/OH buyer relevance/);
 const allowed=harness([{items:[candidate('Training College','UK','college')],publicSources:[source]}]);assert.equal((await allowed.api.discoverFounderOrganisations('workplace_buyers','Research colleges as employers')).items.length,1);
 const excluded=harness([{items:[candidate('Training College','UK','college')],publicSources:[source]}]);assert.equal((await excluded.api.discoverFounderOrganisations('workplace_buyers','Find employers, not colleges')).items.length,0);
});
test('Personal partners remains referral/distribution focused; introducers search employer-access channels',async()=>{
 for(const [lane,pattern] of [['personal_partners',/Personal Root app or Capacity Check/],['workplace_introducers',/employer-access channels/]]){
  const h=harness([{items:[candidate('Relevant Network','UK','membership_body')],publicSources:[source]}]);assert.equal((await h.api.discoverFounderOrganisations(lane,'Find suitable organisations')).items.length,1);assert.match(h.requests[0].input,pattern);
 }
});
test('UK rejects unrelated US results, Europe includes European operations, Global permits international results',async()=>{
 const items=[candidate('UK Employer'),candidate('US Employer','United States'),candidate('France Employer','France'),candidate('International UK Employer','United States','employer',{operatingCountries:['UK'],geographyEvidence:'Official UK operations evidenced'}),candidate('Unverified UK Claim','United States','employer',{operatingCountries:['UK']})];
 for(const [geography,names] of [['UK',['UK Employer','International UK Employer']],['Europe',['UK Employer','France Employer','International UK Employer']],['Global',items.map(i=>i.name)]]){
  const h=harness([{items,publicSources:[source]}]);const result=await h.api.discoverFounderOrganisations('open_intelligence','Flexible commercial request',[],geography);assert.deepEqual(Array.from(result.items,i=>i.name),names);assert.equal(result.geography,geography);assert.match(h.requests[0].input,new RegExp('Geography .*:'+geography));assert.match(h.requests[0].input,/without forcing a buyer-only model/);
 }
 const h=harness([{items:[candidate('US Employer','United States')],publicSources:[source]}]);assert.equal((await h.api.discoverFounderOrganisations('open_intelligence','Flexible request')).items.length,0);assert.match(h.requests[0].input,/UK-focused/);
});
test('employer deep research uses actual employer scores/copy and roles, not universal graduate scores',async()=>{
 const {result,requests,api}=await deepFor('workplace_buyers','Europe');assert.equal(result.geography,'Europe');assert.equal(result.organisationalFitScore,85);assert.equal(result.buyerRelevanceScore,80);assert.equal(result.timingEvidenceScore,70);assert.equal(result.score,78);
 for(const key of ['strategicFitScore','channelReadinessScore','memberSuccessDependencyScore','memberSuccessValue','channelReadiness'])assert.equal(key in result,false);
 assert.deepEqual(Array.from(model.founderResearchMetrics(result),m=>m.label),['Organisational Fit','Buyer Relevance','Timing & Evidence']);
 assert.match(requests[0].input,/Geography:Europe/);assert.match(requests[0].input,/HR Director, People Director \/ CPO/);assert.match(requests[0].input,/organisationalFitScore/);assert.doesNotMatch(requests[0].input,/"memberSuccessDependencyScore"/);
 const evidence=api.founderContextForAcquisition(result);assert.match(evidence,/Organisational Fit: 85/);assert.doesNotMatch(evidence,/graduate success dependency/i);
});
test('partner/introducer scoring is lane-specific; missing scores are not fabricated',async()=>{
 const personal=await deepFor('personal_partners','UK',{...deepOutput,audienceRelevanceScore:90,distributionReachScore:80,referralPracticalityScore:70,trustBrandFitScore:85,decisionMakerRouteScore:60,activationLikelihoodScore:75});
 assert.equal(personal.result.audienceRelevanceScore,90);assert.equal(personal.result.memberSuccessDependencyScore,undefined);assert.match(personal.requests[0].input,/REFERRAL PRACTICALITY/);assert.equal(model.founderResearchMetrics(personal.result).length,6);
 const intro=await deepFor('workplace_introducers','Global',{...deepOutput,employerClientAccessScore:80,channelReadinessScore:70,strategicComplementarityScore:80,sectorReachScore:70,conflictRiskScore:90,introducerPotentialScore:80});assert.equal(intro.result.channelReadinessScore,70);assert.equal(intro.result.score,65);assert.match(intro.requests[0].input,/CONFLICT RISK \(high score = greater risk\)/);
 const partial=await deepFor('workplace_buyers','UK',{...deepOutput,buyerRelevanceScore:null,timingEvidenceScore:null,organisationalFitScore:10});assert.equal(partial.result.organisationalFitScore,10);assert.equal(partial.result.buyerRelevanceScore,undefined);assert.equal(model.founderResearchMetrics(partial.result)[1].score,null);
 const legacy=await deepFor('ops_distribution');assert.equal(legacy.result.memberSuccessDependencyScore,99);assert.equal(model.founderResearchMetrics(legacy.result)[2].label,'Member / Graduate Success Dependency');
});
test('contact research follows buyer/partner roles while retaining named-person and no-guessed-email rules',async()=>{
 const {result}=await deepFor();
 for(const [lane,role] of [['workplace_buyers',/People Director \/ CPO/],['personal_partners',/programme leadership/],['workplace_introducers',/client services, consulting leadership/]]){
  const h=harness([{contacts:[{name:'Alex Example',role:'People Director',rank:1,directEmail:'info@example.test',sourceUrls:[url]},{name:'Membership Team',role:'Team',sourceUrls:[url]}],organisationRoute:{generalEmail:'info@example.test',sourceUrls:[url]},publicSources:[source]}]);
  const researched=await h.api.researchFounderContacts(lane,{...result,lane,geography:'Global'});assert.equal(researched.contacts.length,1);assert.equal(researched.contacts[0].directEmail,null);assert.equal(researched.organisationRoute.generalEmail,'info@example.test');assert.match(h.requests[0].input,role);assert.match(h.requests[0].input,/Never infer an email pattern/);assert.match(h.requests[0].input,/Geography:Global/);
 }
 const second=harness([{contacts:[],publicSources:[source]},{contacts:[],publicSources:[source]}]);await second.api.researchFounderContacts('workplace_buyers',result);assert.match(second.requests[1].input,/People Director \/ CPO/);assert.doesNotMatch(second.requests[1].input,/operational\/member-facing/);
});
test('employer first-approach copy is based on employer research and selected geography',async()=>{
 const {result}=await deepFor('workplace_buyers','Global');const h=harness([{subject:'Workforce priorities',body:'A concise supplied-research email'}]);await h.api.draftFounderFirstApproach('workplace_buyers',result);assert.match(h.requests[0].input,/Organisational fit: Shift workforce fit/);assert.match(h.requests[0].input,/Geography: Global/);assert.doesNotMatch(h.requests[0].input,/Member\/graduate success value: Legacy/);
});

const org='78fa2ac8-e7b6-4b9b-9604-035723ece6b1',actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const routeMocks={'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/tenantAuth':{accessErrorResponse:()=>null},'@/lib/founderIntelligenceAuth.server':{requireFounderIntelligence:async id=>{assert.equal(id,org);return {organisationId:org,userId:actor};}}};
test('existing discovery/research routes pass geography separately and reject invalid inputs',async()=>{
 const calls=[];const server={discoverFounderOrganisations:async(...args)=>{calls.push(args);return {items:[]};},deepenFounderOrganisation:async(...args)=>{calls.push(args);return {};}};
 for(const route of ['discover','research']){
  const api=load(`app/api/founder-intelligence/${route}/route.ts`,{...routeMocks,'@/lib/founderIntelligence.server':server});
  const body={organisationId:org,lane:'workplace_buyers',query:'Find employers',organisation:{name:'Example'},geography:'Global'};assert.equal((await api.POST({json:async()=>body})).status,200);assert.equal(calls.at(-1).at(-1),'Global');
  assert.equal((await api.POST({json:async()=>({...body,geography:'Mars'})})).status,400);
 }
});
test('promotion uses lane defaults and unchanged source IDs, tenant isolation and duplicate protection',async()=>{
 const {result}=await deepFor();const saved=new Map();let lastRecord,lastOptions;const filters={};
 const db={from:()=>{const q={upsert:(record,options)=>{lastRecord=record;lastOptions=options;return q;},select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},maybeSingle:async()=>{if(Object.keys(filters).length)return {data:{id:'existing'}};if(saved.has(lastRecord.source_record_id))return {data:null};saved.set(lastRecord.source_record_id,lastRecord);return {data:{id:'new'}};}};return q;}};
 const server=load('lib/founderIntelligence.server.ts');const api=load('app/api/founder-intelligence/promote/route.ts',{...routeMocks,'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/founderIntelligence.server':server});
 for(const [lane,type] of [['workplace_buyers','b2b_lead'],['personal_partners','partner_opportunity'],['workplace_introducers','partner_opportunity'],['ops_distribution','partner_opportunity']]){
  const body={organisationId:org,lane,research:{...result,lane}};for(const k of Object.keys(filters))delete filters[k];assert.equal((await api.POST({json:async()=>body})).status,200);assert.equal(lastRecord.record_type,type);assert.equal(lastOptions.ignoreDuplicates,true);assert.equal(lastOptions.onConflict,'organisation_id,source_engine,source_record_id');assert.equal(lastRecord.source_record_id,`founder:${lane}:example-employer`);
  assert.equal((await api.POST({json:async()=>body})).body.duplicate,true);assert.equal(filters.organisation_id,org);
 }
 assert.equal((await api.POST({json:async()=>({organisationId:org,lane:'open_intelligence',research:{...result,lane:'open_intelligence'}})})).status,400);
});
test('existing page has geography control, employer default promotion and forwards selected geography',async()=>{
 const {result}=await deepFor();const calls=[],mockFetch=async(url,options)=>{if(options?.body)calls.push(JSON.parse(options.body));return {ok:true,json:async()=>url==='/api/org/current'?{organisationId:org}:url.startsWith('/api/founder-intelligence/access')?{allowed:true}:url==='/api/founder-intelligence/research'?{success:true,research:result}:{success:true,items:[candidate('Example')],publicSources:[source]}};};
 const Page=load('app/dashboard/founder-intelligence/page.tsx',{react:React,'react/jsx-runtime':jsx},{fetch:mockFetch,window:{scrollTo(){},location:{assign(){}}}}).default;let renderer;await act(async()=>{renderer=create(React.createElement(Page));});
 const geography=renderer.root.findAllByType('select')[0];assert.equal(geography.props.value,'UK');await act(async()=>geography.props.onChange({target:{value:'Global'}}));await act(async()=>renderer.root.findAllByType('button').find(b=>b.children.includes('Discover organisations')).props.onClick());assert.equal(calls[0].geography,'Global');assert.equal(calls[0].lane,'workplace_buyers');assert.doesNotMatch(calls[0].query,/\bUK\b/);assert.match(JSON.stringify(renderer.toJSON()),/Employer prospects/);
 await act(async()=>renderer.root.findAllByType('button').find(b=>b.children.includes('Deep research')).props.onClick());assert.equal(calls.at(-1).geography,'Global');const rendered=JSON.stringify(renderer.toJSON());assert.match(rendered,/Organisational Fit/);assert.match(rendered,/Buyer Relevance/);assert.match(rendered,/Timing & Evidence/);assert.doesNotMatch(rendered,/Member \/ graduate success value|Member success/);assert.equal(renderer.root.findAllByType('select')[1].props.value,'b2b_lead');await act(async()=>renderer.unmount());
});
