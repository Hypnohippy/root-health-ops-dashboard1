import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, URL, URLSearchParams, Date, console, process, AbortController, setTimeout, clearTimeout,
    ...globals, require: name => mocks[name] || (name.startsWith("@/lib/") ? load(name.replace("@/", "") + ".ts", mocks, globals) : name.startsWith(".") ? load(path.join(path.dirname(file), `${name}.ts`), mocks, globals) : require(name)) });
  return mod.exports;
}

const invitation=load('lib/linkedinInvitation.ts');
const outreach=load('lib/linkedinOutreach.ts');
const org='78fa2ac8-e7b6-4b9b-9604-035723ece6b1', id='14bf02d7-ec2d-4232-9e28-66de6402dc13';
const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now=new Date('2026-10-12T12:00:00Z');
function fixture(){return {acquisition_items:[{id,organisation_id:org,person:'Emma Pennycard',company:'BeCoaching',source_url:'https://www.linkedin.com/in/emma-pennycard',source_engine:'isma_public_research',record_type:'partner_opportunity',status:'new',reason:'Potential professional partner',signal:'Leadership and wellbeing coach',updated_at:'2026-10-12T05:30:00Z',metadata:{public_research:true,recipient_category:'partner_referrer',acceptance_verified:false,profile_url:'https://www.linkedin.com/in/emma-pennycard'}}],inbox_items:[],growth_targets:[]};}
function accepted(){return {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',organisation_id:org,platform:'linkedin',kind:'connection_accepted',status:'needs_reply',response_state:'needs_reply',author_name:'Emma Pennycard',linkedin_identity:'linkedin.com/in/emma-pennycard',permalink:'https://www.linkedin.com/in/emma-pennycard',created_at_platform:now.toISOString(),source_engine:'linkedin_manual_capture',raw:{acceptance_confirmed:true,profile_url:'https://www.linkedin.com/in/emma-pennycard'}};}

test('professional public research surfaces without hard-coding ISMA and stays unconnected',()=>{
 for(const source of ['isma_public_research','future_public_professional_research']){const input=fixture();input.acquisition_items[0].source_engine=source;const result=invitation.linkedInInvitationQueue(org,input);assert.equal(result.length,1);assert.equal(result[0].state,'to_connect');assert.equal(result[0].category,'Partner / referrer');assert.equal(result[0].company,'BeCoaching');assert.equal(outreach.linkedInOutreachQueue(org,input,now.getTime()).items.length,0);}
});
test('test, unsafe, unqualified and ambiguous profile records are never invitation candidates',()=>{
 for(const edit of [r=>r.metadata.test=true,r=>r.metadata.health_targeting=true,r=>r.metadata.consumer_outreach=true,r=>delete r.metadata.public_research,r=>{r.source_url='https://www.linkedin.com/posts/example';delete r.metadata.profile_url;},r=>r.metadata.profile_url='https://www.linkedin.com/in/another',r=>r.person='']){const input=fixture();edit(input.acquisition_items[0]);assert.equal(invitation.linkedInInvitationQueue(org,input).length,0);}
});
test('canonical profile dedupe happens before presentation and preserves every original source',()=>{
 const input=fixture();input.acquisition_items.push({...input.acquisition_items[0],id:'duplicate',source_url:'https://uk.linkedin.com/in/Emma-Pennycard/?trk=mail',metadata:{...input.acquisition_items[0].metadata},source_engine:'another_professional_source'});const result=invitation.linkedInInvitationQueue(org,input);assert.equal(result.length,1);assert.equal(result[0].provenance.length,2);assert.equal(input.acquisition_items.length,2);
});
test('tenant isolation excludes another tenant and never borrows its acceptance',()=>{
 const input=fixture();input.inbox_items.push({...accepted(),organisation_id:'another'});input.acquisition_items.push({...input.acquisition_items[0],id:'foreign',organisation_id:'another'});const result=invitation.linkedInInvitationQueue(org,input);assert.equal(result.length,1);assert.equal(result[0].state,'to_connect');
});
test('pending receipt contains invitation evidence only and never starts cadence or creates acceptance',()=>{
 const input=fixture(), before=JSON.stringify(input);const plan=invitation.planInvitationReceipt(input.acquisition_items[0],'invitation_sent',actor,key,true,now);assert.equal(JSON.stringify(input),before);input.acquisition_items[0].metadata=plan.metadata;const result=invitation.linkedInInvitationQueue(org,input)[0];assert.equal(result.state,'pending');assert.equal(result.invitationSentAt,now.toISOString());assert.equal(input.inbox_items.length,0);assert.equal(input.growth_targets.length,0);assert.equal(outreach.linkedInOutreachQueue(org,input,now.getTime()).items.length,0);
 const receipt=plan.metadata.linkedin_invitation.history[0];assert.equal(receipt.actor,actor);assert.equal(receipt.key,key);for(const field of ['sent_at','first_outbound_at','completed_at','contacted_at','last_replied_at','message','manual_completion','acceptance_confirmed'])assert.equal(receipt[field],undefined);assert.equal(plan.metadata.acceptance_verified,false);
});
test('human confirmation is required, retry is idempotent, and history/provenance remain intact',()=>{
 const row=fixture().acquisition_items[0];assert.throws(()=>invitation.planInvitationReceipt(row,'invitation_sent',actor,key,false,now),/Explicitly confirm/);row.metadata={...row.metadata,prior:'unchanged',linkedin_invitation:{history:[{action:'save',key:'old',actor,confirmed_at:now.toISOString()}]}};
 const plan=invitation.planInvitationReceipt(row,'invitation_sent',actor,key,true,now);assert.equal(plan.metadata.prior,'unchanged');assert.equal(plan.metadata.linkedin_invitation.history.length,2);assert.equal(row.metadata.linkedin_invitation.history.length,1);row.metadata=plan.metadata;assert.equal(invitation.planInvitationReceipt(row,'invitation_sent',actor,key,true,new Date('2026-10-15')).duplicate,true);assert.equal(invitation.planInvitationReceipt(row,'invitation_sent',actor,'other',true,now).duplicate,true);assert.throws(()=>invitation.planInvitationReceipt(row,'dismiss',actor,key,true,now),/another action/);
});
test('acceptance removes pending and references the same Responses record without writing or duplicating',()=>{
 const input=fixture();input.acquisition_items[0].metadata=invitation.planInvitationReceipt(input.acquisition_items[0],'invitation_sent',actor,key,true,now).metadata;input.inbox_items.push(accepted());const before=JSON.stringify(input);const row=invitation.linkedInInvitationQueue(org,input)[0];assert.equal(row.state,'accepted');assert.equal(row.acceptedConnectionId,input.inbox_items[0].id);assert.equal(row.provenance[0].id,id);assert.equal(row.source,'isma_public_research');assert.equal(row.category,'Partner / referrer');assert.equal(JSON.stringify(input),before);assert.equal(input.inbox_items.length,1);assert.equal(outreach.linkedInOutreachQueue(org,input,now.getTime()).items[0].id,input.inbox_items[0].id);
});
test('existing Gmail/manual identity, conversation or growth target blocks another invitation',()=>{
 for(const table of ['inbox_items','growth_targets']){const input=fixture();input[table].push({id:'known',organisation_id:org,platform:'linkedin',kind:'reply',status:'needs_reply',linkedin_url:'https://www.linkedin.com/in/emma-pennycard',raw:{profile_url:'https://www.linkedin.com/in/emma-pennycard'}});assert.equal(invitation.linkedInInvitationQueue(org,input)[0].state,'known');}
 for(const status of ['dismissed','lost','closed','converted','meeting','engaged']){const input=fixture();input.acquisition_items[0].status=status;assert.equal(invitation.linkedInInvitationQueue(org,input)[0].state,'excluded');}
});
test('connection notes are distinct from accepted first messages and use all category hints',()=>{
 const row=fixture().acquisition_items[0];const cases=[['hr_people','HR / People'],['partner_referrer','Partner / referrer'],['hr_consultancy','HR consultancy / agency'],['college','College / education'],['care_health','Care / health'],['other','Other strategic contact']];
 for(const [category,label] of cases){row.metadata.recipient_category=category;assert.equal(invitation.invitationCategory(row),label);}
 assert.equal(invitation.safeConnectionNote('Hi Emma, your work at BeCoaching caught my attention. It would be good to connect.','Emma Pennycard','Leadership and wellbeing coach at BeCoaching'),true);
 for(const bad of ['Hi Emma, thanks for connecting. Good to be connected.','Hi Emma, can we book a meeting to discuss our offer?','Hi Emma, '+ 'x'.repeat(201)])assert.equal(invitation.safeConnectionNote(bad,'Emma Pennycard','Leadership and wellbeing coach at BeCoaching'),false);
});

test('Preview action rehearsals call no database mutations; accepted and stale records fail closed',async()=>{
 const input=fixture();let mutations=0;const mock={from(){mutations++;throw Error('Production write forbidden');}};
 const route=load('app/api/growth/linkedin-invitations/route.ts',{'@/lib/outreachSelfIdentity.server':{readOutreachSelfIdentity:async()=>({names:[],emails:[],linkedinProfiles:[],linkedinAccountIds:[]})},'@/lib/tenantRoute.server':{withTenantRoute:f=>req=>f(req,{organisationId:org,userId:actor})},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async()=>input},'@/lib/supabaseAdmin':{supabaseAdmin:mock},'@/lib/organisationProfile.server':{getOrganisationGenerationProfile:async()=>({})}}, {process:{env:{VERCEL_ENV:'preview'}},fetch:async()=>{throw Error('No provider call');}});
 const request=body=>new Request('https://preview.test/api/growth/linkedin-invitations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action:'invitation_sent',version:input.acquisition_items[0].updated_at,key,confirmed:true,...body})});
 const response=await route.POST(request({}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.readOnly,true);assert.equal(data.item.state,'pending');assert.equal(invitation.linkedInInvitationQueue(org,input)[0].state,'to_connect');assert.equal(mutations,0);
 assert.equal((await route.POST(request({version:'stale'}))).status,409);assert.equal((await route.POST(request({action:'generate_first_message'}))).status,400);input.inbox_items.push(accepted());assert.equal((await route.POST(request({}))).status,409);assert.equal(mutations,0);
});

test('server write path updates only invitation metadata with tenant, status, version and metadata CAS',async()=>{
 const input=fixture();const calls=[];const builder={update(v){calls.push(['update',v]);return this},eq(...v){calls.push(['eq',...v]);return this},select(){return this},maybeSingle:async()=>({data:{id},error:null})};
 const route=load('app/api/growth/linkedin-invitations/route.ts',{'@/lib/outreachSelfIdentity.server':{readOutreachSelfIdentity:async()=>({names:[],emails:[],linkedinProfiles:[],linkedinAccountIds:[]})},'@/lib/tenantRoute.server':{withTenantRoute:f=>req=>f(req,{organisationId:org,userId:actor})},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async()=>input},'@/lib/supabaseAdmin':{supabaseAdmin:{from:table=>{assert.equal(table,'acquisition_items');return builder}}},'@/lib/organisationProfile.server':{getOrganisationGenerationProfile:async()=>({})}}, {process:{env:{VERCEL_ENV:'production'}}});
 const response=await route.POST(new Request('https://ops.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,version:input.acquisition_items[0].updated_at,action:'invitation_sent',key,confirmed:true})}));assert.equal(response.status,200);const update=calls.find(c=>c[0]==='update')[1];assert.deepEqual(Object.keys(update).sort(),['metadata','updated_at']);assert.ok(calls.some(c=>c[1]==='organisation_id'&&c[2]===org));assert.ok(calls.some(c=>c[1]==='updated_at'));assert.ok(calls.some(c=>c[1]==='metadata'&&typeof c[2]==='string'));assert.ok(calls.some(c=>c[1]==='status'&&c[2]==='new'));
});


test('editable connection note copy/open never write, repeat draft clicks lock, and errors retain text',async()=>{
 const React=require('react'),renderer=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const calls=[],copies=[];let finish;const mod=load('app/dashboard/responses/linkedin/LinkedInToConnect.tsx',{'@/lib/tenantFetch':{tenantFetch:async(url,init)=>{calls.push(JSON.parse(init.body));return new Promise(resolve=>{finish=resolve;});}}},{crypto:{randomUUID:()=>key},navigator:{clipboard:{writeText:async text=>copies.push(text)}}});
 const item=invitation.linkedInInvitationQueue(org,fixture())[0];let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(mod.InvitationCard,{item,organisationId:org,readOnly:true,onChanged(){}}));});
 const button=name=>tree.root.findAllByType('button').find(b=>b.children.join('')===name);
 assert.equal(tree.root.findAllByType('a')[0].props.href,item.profile);assert.equal(tree.root.findAllByType('a')[0].props.target,'_blank');assert.equal(calls.length,0);
 await renderer.act(async()=>{button('Draft connection note').props.onClick();});
 await renderer.act(async()=>{button('Working…').props.onClick();});assert.equal(calls.length,1);assert.equal(calls[0].action,'draft_note');assert.equal(calls[0].dryRun,true);
 await renderer.act(async()=>finish({ok:true,json:async()=>({note:'Hi Emma, it would be good to connect.'})}));
 await renderer.act(async()=>tree.root.findByType('textarea').props.onChange({target:{value:'Current edited note'}}));
 await renderer.act(async()=>button('Copy connection note').props.onClick());assert.deepEqual(copies,['Current edited note']);assert.equal(calls.length,1);
 await renderer.act(async()=>button('Draft connection note').props.onClick());await renderer.act(async()=>finish({ok:false,json:async()=>({error:'Generation failed'})}));assert.equal(tree.root.findByType('textarea').props.value,'Current edited note');assert.equal(button('Draft connection note').props.disabled,false);assert.match(tree.root.findByProps({role:'status'}).children.join(''),/Generation failed/);
 await renderer.act(async()=>tree.unmount());
});

test('own tenant sender identity cannot become a connection candidate',()=>{
 const self={names:['Emma Pennycard'],emails:[],linkedinProfiles:[],linkedinAccountIds:[]};
 assert.equal(invitation.linkedInInvitationQueue(org,fixture(),self).length,0);
 self.names=[];self.linkedinProfiles=['https://linkedin.com/in/emma-pennycard'];assert.equal(invitation.linkedInInvitationQueue(org,fixture(),self).length,0);
});


test('LinkedIn Acquisition links public-research acceptance by reference and preserves original category/source',async()=>{
 const input=fixture();input.inbox_items.push(accepted());let reads=0;const db={from(){return {select(){return this},eq(){return this},order(){return this},range:async()=>({data:[],error:null})};}};
 const route=load('app/api/growth/acquisition/route.ts',{'@/lib/tenantAuth':{requireOrganisation:async()=>({organisationId:org}),accessErrorResponse:()=>null},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async()=>{reads++;return input;}},'@/lib/linkedinCapture.server':{linkedInRecommendationStates:async()=>({}),acceptedLinkedInOpportunities:async()=>[{id:'accepted:'+accepted().id,created_at:now.toISOString(),linkedinConnectionState:{acceptedConnectionId:accepted().id}}]},'@/lib/personalDistribution.server':{personalPerformance:async()=>({})}});
 const response=await route.GET(new Request(`https://ops.test/api/growth/acquisition?organisationId=${org}&source_engine=linkedin_connection_recommendation`));assert.equal(response.status,200);const data=await response.json();assert.equal(reads,1);assert.equal(data.total,1);assert.equal(data.items[0].id,id);assert.equal(data.items[0].source_engine,'isma_public_research');assert.equal(data.items[0].metadata.recipient_category,'partner_referrer');assert.equal(data.items[0].linkedinConnectionState.acceptedConnectionId,accepted().id);assert.equal(input.inbox_items.length,1);
 const React=require('react'),renderer=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;const Card=load('app/dashboard/growth/acquisition/LinkedInConnectionOpportunity.tsx').default;let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Card,{item:data.items[0],organisationId:org,onSave(){throw Error('no write');},onDismiss(){throw Error('no write');}}));});assert.ok(tree.root.findAllByType('a').some(a=>a.props.href.includes('itemId='+accepted().id)));assert.ok(!tree.root.findAllByType('button').some(b=>b.children.join('')==='Draft connection note'));await renderer.act(async()=>tree.unmount());
});

test('ordinary Commercial Acquisition reads remain outside the invitation projection',async()=>{
 const db={from(table){assert.equal(table,'acquisition_items');return {select(){return this},eq(){return this},order(){return this},range:async()=>({data:[],count:0,error:null})};}};
 const route=load('app/api/growth/acquisition/route.ts',{'@/lib/tenantAuth':{requireOrganisation:async()=>({organisationId:org}),accessErrorResponse:()=>null},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async()=>{throw Error('Commercial branch must not change');}},'@/lib/linkedinCapture.server':{linkedInRecommendationStates:async()=>({})},'@/lib/personalDistribution.server':{personalPerformance:async()=>({})}});
 const response=await route.GET(new Request(`https://ops.test/api/growth/acquisition?organisationId=${org}&record_type=b2b_lead`));assert.equal(response.status,200);assert.equal((await response.json()).total,0);
});

test('empty networking notes and unsupported themes are rejected; grounded light notes pass',()=>{
 const context='Workplace wellbeing coaching at BeCoaching';
 for(const note of ["Hi Emma, I'd be glad to connect.","Hi Emma, I’d love to connect.",'Hi Emma, I noticed your work and thought it would be good to connect.','Hi Emma, I noticed your work in robotics and thought it would be good to connect.']) assert.equal(invitation.safeConnectionNote(note,'Emma Pennycard',context),false);
 assert.equal(invitation.safeConnectionNote('Hi Emma, I noticed your work around workplace wellbeing and thought it would be good to connect.','Emma Pennycard',context),true);
 assert.equal(invitation.safeConnectionNote('Hi Emma, I noticed your work around workplace wellbeing and thought there might be some overlap in what we do. It would be good to connect.','Emma Pennycard',context),true);
 assert.equal(invitation.safeConnectionNote('Hi Laura, I noticed your work around stress and thought it would be good to connect.','Laura Capell-Abra','Stress Matters'),true);
});