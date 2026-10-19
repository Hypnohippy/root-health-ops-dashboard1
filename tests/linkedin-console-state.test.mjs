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
function load(file,deps={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require:n=>{assert.ok(n in deps,n);return deps[n];},URLSearchParams,AbortController,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});return mod.exports;}
const helpers=load('lib/linkedinWorkbench.ts');
const item=(id,mode='fresh',stage='connection')=>({contactId:id,id,table:'growth_targets',name:id,stage,mode,connectedAt:'2026-10-14T09:00:00Z',lifecycle:'outreach_ready',reason:'Recorded connection',context:{role:'HR Director',company:'Employer',connectionMode:mode},previousOutbound:null});
async function mount(){
 let items=[item('First'),item('Next')],revision=1,loadGate=null,generationFailure=null;const calls=[];
 const api=async(url,init)=>{
  if(!init){calls.push({action:'load',url});if(loadGate)await loadGate;const skipped=new URL(url,'https://ops.test').searchParams.getAll('skip');const visible=items.filter(i=>!skipped.includes(i.contactId));return {ok:true,json:async()=>({items:visible,total:visible.length,revision:String(revision),organisationId:'tenant',repliesNeedingAttention:0,identityReviewNeeded:0})};}
  const body=JSON.parse(init.body);calls.push(body);
  if(body.action==='record_send'){items=items.filter(i=>i.id!==body.id);revision++;return {ok:true,json:async()=>({success:true})};}
  if(generationFailure)return {ok:false,status:409,json:async()=>({error:generationFailure})};
  return {ok:true,json:async()=>({message:`${items.find(i=>i.id===body.id).mode} ${items.find(i=>i.id===body.id).stage} draft`})};
 };
 const components=load('app/dashboard/responses/linkedin/LinkedInWorkbench.tsx',{'react':React,'react/jsx-runtime':jsx,'./KnownRelationshipSearch':{default:()=>null},'./LinkedInToConnect':{default:()=>null},'./LinkedInHistoricalSend':{default:()=>null},'@/lib/tenantFetch':{tenantFetch:api},'@/lib/linkedinWorkbench':helpers,'@/lib/linkedinClipboard':{}}),C=components.default;
 let tree;await act(async()=>{tree=create(React.createElement(C));});
 const button=name=>tree.root.findAllByType('button').find(b=>b.children.join('')===name);
 return {failGeneration:message=>{generationFailure=message;},tree,C,BatchList:components.BatchList,calls,button,holdReload:()=>{let release;loadGate=new Promise(resolve=>{release=()=>{loadGate=null;resolve();};});return release;},setFirst:patch=>{items=[{...items[0],...patch},...items.slice(1)];revision++;},reload:async()=>act(async()=>button('Work next 10').props.onClick()),unmount:async()=>act(async()=>tree.unmount())};
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
