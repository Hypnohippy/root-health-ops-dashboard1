import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {create,act} from 'react-test-renderer';
import {renderToStaticMarkup} from 'react-dom/server';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,deps={},environment={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require:n=>{assert.ok(n in deps,n);return deps[n];},Error,URLSearchParams,AbortController,setTimeout,clearTimeout,...environment,crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});return mod.exports;}
const helpers=load('lib/linkedinWorkbench.ts');
const item=(id,mode='fresh',stage='connection')=>({contactId:id,id,table:'growth_targets',name:id,stage,mode,connectedAt:'2026-10-14T09:00:00Z',lifecycle:'outreach_ready',reason:'Recorded connection',context:{role:'HR Director',company:'Employer',connectionMode:mode},previousOutbound:null,destination:'https://www.linkedin.com/in/recorded',destinationKind:'profile'});
async function mount(){
 let items=[item('First'),item('Next')],revision=1,loadGate=null,generationFailure=null,staleCount=0;const calls=[];
 const api=async(url,init)=>{
  if(!init?.method){calls.push({action:'load',url});if(loadGate)await loadGate;const skipped=new URL(url,'https://ops.test').searchParams.getAll('skip');const visible=items.filter(i=>!skipped.includes(i.contactId));return {ok:true,json:async()=>({items:visible,total:visible.length,revision:String(revision),organisationId:'tenant',repliesNeedingAttention:0,identityReviewNeeded:0})};}
  const body=JSON.parse(init.body);calls.push(body);
  if(body.action==='record_send'){items=items.filter(i=>i.id!==body.id);revision++;return {ok:true,json:async()=>({success:true})};}
  if(staleCount>0){staleCount--;revision++;return {ok:false,status:409,json:async()=>({code:'STALE_QUEUE_REVISION',error:'Queue state changed. Reload before taking action.'})};}
  if(generationFailure)return {ok:false,status:409,json:async()=>({error:generationFailure})};
  return {ok:true,json:async()=>({message:`${items.find(i=>i.id===body.id).mode} ${items.find(i=>i.id===body.id).stage} draft`})};
 };
 const listeners=new Map();
 const environment={window:{addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:(event)=>listeners.delete(event),open:()=>({opener:null,location:{replace:()=>{}}})},document:{visibilityState:'visible',addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:(event)=>listeners.delete(event)},navigator:{clipboard:{writeText:async()=>{}}}};
 const components=load('app/dashboard/responses/linkedin/LinkedInWorkbench.tsx',{'react':React,'react/jsx-runtime':jsx,'./KnownRelationshipSearch':{default:()=>null},'./LinkedInToConnect':{default:()=>null},'./LinkedInHistoricalSend':{default:()=>null},'@/lib/tenantFetch':{tenantFetch:api},'@/lib/linkedinWorkbench':helpers,'@/lib/linkedinClipboard':{openAndCopyLinkedIn:async(message,url,browser)=>{browser.open(url);await browser.copy(message);return 'Copied';}}},environment),C=components.default;
 let tree;await act(async()=>{tree=create(React.createElement(C));});
 const button=name=>tree.root.findAllByType('button').find(b=>b.children.join('')===name);
 return {recordElsewhere:()=>{items=items.slice(1);revision++;},returned:async()=>act(async()=>{listeners.get('focus')?.();listeners.get('visibilitychange')?.();}),setNext:patch=>{items=[items[0],{...items[1],...patch}];revision++;},staleGenerations:count=>{staleCount=count;},failGeneration:message=>{generationFailure=message;},tree,C,BatchList:components.BatchList,calls,button,holdReload:()=>{let release;loadGate=new Promise(resolve=>{release=()=>{loadGate=null;resolve();};});return release;},setFirst:patch=>{items=[{...items[0],...patch},...items.slice(1)];revision++;},reload:async()=>act(async()=>button('Work next 10').props.onClick()),unmount:async()=>act(async()=>tree.unmount())};
}
test('same contact/stage cannot retain a fresh draft after mode or recipient context changes',async()=>{
 const f=await mount();try{
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('First'));
  f.setFirst({mode:'catchup'});await f.reload();
  assert.equal(f.tree.root.findByType('textarea').props.value,'catchup connection draft');
  const generated=f.calls.filter(c=>c.action==='generate').length;
  f.setFirst({context:{role:'Care Director',company:'Care Ltd'}});await f.reload();
  assert.equal(f.calls.filter(c=>c.action==='generate').length,generated+1);
  f.setFirst({stage:'day3_followup',mode:'followups'});await f.reload();
  assert.equal(f.tree.root.findByType('textarea').props.value,'followups day3_followup draft');
 }finally{await f.unmount();}
});
test('acknowledged send removes completed row, decreases total, selects next and stays absent after reload/remount',async()=>{
 const f=await mount();try{
  const release=f.holdReload();
  await act(async()=>f.button('Sent now & next').props.onClick());
  assert.ok(!f.tree.root.findAllByType('h2').some(h=>h.children.join('')==='First'));
  assert.ok(f.tree.root.findAllByType('h2').some(h=>h.children.join('')==='Next'));
  assert.equal(f.tree.root.findAllByType('span').find(n=>n.children.join('').includes('eligible')).children.join(''),'1 in this batch · 1 eligible');
  await act(async()=>release());
  await f.reload();assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
  await act(async()=>{f.tree.update(null);});
  await act(async()=>{f.tree.update(React.createElement(f.C));});
  assert.ok(!f.tree.root.findAllByType('h2').some(h=>h.children.join('')==='First'));
  assert.equal(f.calls.filter(c=>c.action==='record_send').length,1);
 }finally{await f.unmount();}
});
test('Outreach timestamps always display UK local time, including BST/GMT boundary',async()=>{
 const f=await mount(),oldTimezone=process.env.TZ;
 try{
  process.env.TZ='UTC';
  const html=renderToStaticMarkup(React.createElement(f.BatchList,{items:[{...item('First'),connectedAt:'2026-10-18T23:25:08Z'}],selectedId:'First',disabled:false,onSelect:()=>{}}));
  assert.match(html,/19\/10\/2026, 00:25:08/);
 assert.equal(helpers.outreachDateTime('2026-10-18T23:25:08.787401+00:00'),'19/10/2026, 00:25:08');
 assert.equal(helpers.outreachDateTime('2026-12-18T23:25:08Z'),'18/12/2026, 23:25:08');
 assert.equal(helpers.outreachDateTime(null),'Not recorded');
 }finally{if(oldTimezone===undefined)delete process.env.TZ;else process.env.TZ=oldTimezone;await f.unmount();}
});

test('empty-cache initial selection, uncached selection and skip automatically generate drafts',async()=>{
 const f=await mount();try{
  assert.equal(f.calls.filter(c=>c.action==='generate').length,1);
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
  const list=f.tree.root.findByType(f.BatchList);
  await act(async()=>list.props.onSelect('Next'));
  assert.equal(f.calls.filter(c=>c.action==='generate').at(-1).id,'Next');
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('First'));
  await act(async()=>f.button('Skip').props.onClick());
  assert.equal(f.tree.root.findAllByType('h2').some(n=>n.children.join('')==='Next'),true);
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
 }finally{await f.unmount();}
});
test('completed contact automatically generates next draft after queue reload',async()=>{
 const f=await mount();try{
  await act(async()=>f.button('Sent now & next').props.onClick());
  assert.equal(f.tree.root.findAllByType('h2').some(n=>n.children.join('')==='Next'),true);
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
  assert.equal(f.calls.filter(c=>c.action==='generate').at(-1).id,'Next');
 }finally{await f.unmount();}
});
test('generation failure is an alert beside textarea; Refresh draft and queue reload recover',async()=>{
 const f=await mount();try{
  f.failGeneration('Queue state changed. Reload before taking action.');
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('Next'));
  assert.equal(f.tree.root.findByType('textarea').props.value,'');
  assert.equal(f.tree.root.findByType('textarea').props['aria-invalid'],true);
  const alert=f.tree.root.find(n=>n.props.role==='alert');
  assert.ok(alert.findAllByType('p').some(n=>n.children.join('')==='Queue state changed. Reload before taking action.'));
  assert.equal(f.tree.root.findByType('textarea').props['aria-describedby'],alert.props.id);
  f.failGeneration(null);
  await act(async()=>f.button('Refresh draft').props.onClick());
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
  assert.equal(f.tree.root.findAll(n=>n.props.role==='alert').length,0);
  f.failGeneration('Queue state changed. Reload before taking action.');
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('First'));
  f.setFirst({mode:'catchup'});await f.reload();
  assert.equal(f.tree.root.findByType('textarea').props.value,'');
  f.failGeneration(null);
  f.setFirst({context:{role:'HR Director',company:'Updated employer'}});
  await act(async()=>f.button('Reload queue and retry draft').props.onClick());
  assert.equal(f.tree.root.findByType('textarea').props.value,'catchup connection draft');
 }finally{await f.unmount();}
});

test('Fresh, Catch-up and Work next 10 transitions retain a draft or generate one',async()=>{
 const f=await mount();try{
  for(const view of ['Fresh','Catch-up','Work next 10']){
   await act(async()=>f.button(view).props.onClick());
   assert.ok(f.tree.root.findByType('textarea').props.value.trim());
  }
 }finally{await f.unmount();}
});

test('stale revision auto-refreshes same eligible contact once and retains fresh revision for manual send',async()=>{
 const f=await mount();try{
  f.staleGenerations(1);
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('Next'));
  const drafts=f.calls.filter(c=>c.action==='generate'&&c.id==='Next');
  assert.equal(drafts.length,2);assert.equal(drafts[0].revision,'1');assert.equal(drafts[1].revision,'2');
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
  assert.equal(f.tree.root.findAll(n=>n.props.role==='alert').length,0);
  assert.equal(f.calls.filter(c=>c.action==='record_send').length,0);
  await act(async()=>f.button('Sent now & next').props.onClick());
  assert.equal(f.calls.find(c=>c.action==='record_send').revision,'2');
 }finally{await f.unmount();}
});
test('second stale revision stops with prominent error; Refresh starts a new bounded attempt',async()=>{
 const f=await mount();try{
  f.staleGenerations(2);
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('Next'));
  assert.equal(f.calls.filter(c=>c.action==='generate'&&c.id==='Next').length,2);
  assert.equal(f.tree.root.findByType('textarea').props.value,'');
  assert.equal(f.tree.root.findAll(n=>n.props.role==='alert').length,1);
  await act(async()=>f.button('Refresh draft').props.onClick());
  assert.equal(f.tree.root.findByType('textarea').props.value,'fresh connection draft');
 }finally{await f.unmount();}
});
for(const change of ['removed','mode','stage','identity','context','tenant'])test(`recovery refuses ${change} contact without retry`,async()=>{
 const original=item('First');let requests=0;
 const fresh={organisationId:'tenant',revision:'2',items:[{...original}]};
 if(change==='removed')fresh.items=[];
 if(change==='mode')fresh.items[0].mode='catchup';
 if(change==='stage')fresh.items[0].stage='day3_followup';
 if(change==='identity')fresh.items[0].id='replacement';
 if(change==='context')fresh.items[0].context={role:'Different role'};
 if(change==='tenant')fresh.organisationId='other';
 const api=async(_url,init)=>{requests++;return init?.method?{ok:false,status:409,json:async()=>({code:'STALE_QUEUE_REVISION',error:'stale'})}:{ok:true,json:async()=>fresh};};
 await assert.rejects(helpers.generateOutreachDraft(original,{organisationId:'tenant',revision:'1',items:[original]},api,new AbortController().signal,()=>true),/no longer eligible/);
 assert.equal(requests,2);
});
test('read-only recovery stops when a user action or cancellation supersedes generation',async()=>{
 const original=item('First');let requests=0;
 const api=async()=>{requests++;return {ok:false,status:409,json:async()=>({code:'STALE_QUEUE_REVISION',error:'stale'})};};
 await assert.rejects(helpers.generateOutreachDraft(original,{organisationId:'tenant',revision:'1',items:[original]},api,new AbortController().signal,()=>false),/stale/);
 assert.equal(requests,1);
});

test('Refresh on an incompatible server state clears an existing draft and cannot enable sending stale text',async()=>{
 const f=await mount();try{
  assert.ok(f.tree.root.findByType('textarea').props.value);
  f.setFirst({mode:'catchup'});f.staleGenerations(1);
  await act(async()=>f.button('Refresh draft').props.onClick());
  assert.equal(f.tree.root.findByType('textarea').props.value,'');
  assert.equal(f.tree.root.findAll(n=>n.props.role==='alert').length,1);
  assert.equal(f.button('Sent now & next').props.disabled,true);
  assert.equal(f.calls.filter(c=>c.action==='generate'&&c.id==='First').length,2); // initial + rejected refresh, no recovery POST
 }finally{await f.unmount();}
});

test('recovery refreshes neighboring cached rows rather than stamping a new revision onto stale items',async()=>{
 const f=await mount();try{
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('Next'));
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('First'));
  f.setNext({mode:'catchup'});f.staleGenerations(1);
  await act(async()=>f.button('Refresh draft').props.onClick());
  await act(async()=>f.tree.root.findByType(f.BatchList).props.onSelect('Next'));
  assert.equal(f.tree.root.findByType('textarea').props.value,'catchup connection draft');
 }finally{await f.unmount();}
});


test('opening and returning refreshes once, retains pending question, never infers a send; No keeps contact',async()=>{
 const f=await mount();try{
  const count=()=>f.calls.filter(c=>c.action==='load').length;
  const before=count(); await f.returned(); assert.equal(count(),before);
  await act(async()=>f.button('Open profile & Copy — use Message').props.onClick());
  assert.ok(f.tree.root.findAllByType('h3').some(n=>n.children.join('')==='Did you send this message in LinkedIn?'));
  await f.returned(); assert.equal(count(),before+1);
  await f.returned(); assert.equal(count(),before+1);
  assert.equal(f.calls.filter(c=>c.action==='record_send').length,0);
  await act(async()=>f.button('No — keep this contact').props.onClick());
  assert.equal(f.tree.root.findAllByType('h3').length,0);
  assert.ok(f.tree.root.findAllByType('h2').some(n=>n.children.join('')==='First'));
 }finally{await f.unmount();}
});

test('pending Yes uses existing record_send receipt with copied text and selects next; reload stays absent',async()=>{
 const f=await mount();try{
  await act(async()=>f.button('Open profile & Copy — use Message').props.onClick()); await f.returned();
  await act(async()=>f.button('Yes — record send & next').props.onClick());
  const sent=f.calls.filter(c=>c.action==='record_send'); assert.equal(sent.length,1);
  assert.equal(sent[0].message,'fresh connection draft');assert.equal(sent[0].confirmed,true);assert.equal(sent[0].sendChoice,'now');
  assert.ok(sent[0].key);await f.reload();
  assert.ok(!f.tree.root.findAllByType('h2').some(n=>n.children.join('')==='First'));
 }finally{await f.unmount();}
});

test('return refresh removes a contact recorded elsewhere without recording another send',async()=>{
 const f=await mount();try{
  await act(async()=>f.button('Open profile & Copy \u2014 use Message').props.onClick());
  f.recordElsewhere();await f.returned();
  assert.ok(!f.tree.root.findAllByType('h2').some(n=>n.children.join('')==='First'));
  assert.equal(f.calls.filter(c=>c.action==='record_send').length,0);
 }finally{await f.unmount();}
});
test('pending copied text cannot confirm after an incompatible mode/stage change',async()=>{
 const f=await mount();try{
  await act(async()=>f.button('Open profile & Copy \u2014 use Message').props.onClick());
  f.setFirst({mode:'catchup'});await f.returned();
  assert.equal(f.button('Yes \u2014 record send & next').props.disabled,true);
  assert.equal(f.button('Sent now & next').props.disabled,true);
  assert.equal(f.calls.filter(c=>c.action==='record_send').length,0);
 }finally{await f.unmount();}
});
