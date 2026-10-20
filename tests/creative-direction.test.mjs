import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer from 'react-test-renderer';
import {renderToStaticMarkup} from 'react-dom/server';
import {load,ids,fixture} from './helpers/solution-brief-fixture.mjs';
const c=load('lib/creativeDirection.ts'), audience=load('lib/presentationAudience.ts');
const Slide=load('app/dashboard/resources/SolutionSlide.tsx').default;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

test('resource edits persist creative fields, retain owned artwork and leave provenance unchanged',async()=>{
 const f=await fixture();try{
  const slide={slide_title:'Owned slide',bullets:['Reviewed content'],uploaded_image_url:'https://assets.invalid/owned.png',active_image_source:'upload',creative_direction:c.rootCreative('hero')};
  await f.sql.query("insert into resource_library(id,organisation_id,title,resource_type,content) values($1,$2,'Synthetic','presentation',$3)",[ids.request,ids.org,JSON.stringify({creative_direction:c.ROOT_PRESET,slides:[slide]})]);
  const direction={...c.rootCreative('framework'),artwork:'panel',focal:'right'};
  const response=await f.route('app/api/resource-library/route.ts').PATCH(f.req({organisationId:ids.org,resourceId:ids.request,slideIndex:0,slidePatch:{creative_direction:direction}},'PATCH'));assert.equal(response.status,200);
  const saved=(await f.sql.query('select * from resource_library where id=$1',[ids.request])).rows[0];
  assert.equal(saved.organisation_id,ids.org);assert.equal(saved.source_solution_brief_id,null);assert.equal(saved.content.slides[0].creative_direction.focal,'right');assert.equal(saved.content.slides[0].uploaded_image_url,slide.uploaded_image_url);assert.equal(saved.content.slides[0].slide_title,slide.slide_title);
  const denied=await f.route('app/api/resource-library/route.ts').PATCH(f.req({organisationId:ids.other,resourceId:ids.request,slideIndex:0,slidePatch:{creative_direction:direction}},'PATCH'));assert.equal(denied.status,403);
 }finally{await f.close();}
});

test('creative projection accepts only versioned code-owned tokens and safe options',()=>{
 assert.equal(c.creativeDirection({preset:'other',version:1}),null);
 assert.equal(c.creativeDirection({...c.ROOT_PRESET,version:2}),null);
 const safe=c.creativeDirection({...c.ROOT_PRESET,layout:'script',artwork:'url(secret)',focal:'PRIVATE',palette:{secret:'PRIVATE'},speaker_notes:'PRIVATE'});
 assert.equal(safe.layout,'framework');assert.equal(safe.artwork,'none');assert.equal(safe.focal,'center');assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|secret/);
});
for(const layout of c.ROOT_LAYOUTS) test(`${layout}: distinct audience composition handles normal, long, incomplete and missing-art content`,()=>{
 for(const slide of [{slide_title:'Recognise pressure',bullets:['Notice changes','Agree practical support','Review progress'],audience_prompt:'Choose one practical action.'},{slide_title:'A long title '.repeat(30),bullets:['A long reviewed statement '.repeat(30)]},{}]){
  const html=renderToStaticMarkup(React.createElement(Slide,{slide:{...slide,creative_direction:c.rootCreative(layout),speaker_notes:'PRIVATE SCRIPT',internal_notes:'PRIVATE'},index:2,total:8}));
  assert.match(html,new RegExp(`root-${layout}`));assert.doesNotMatch(html,/PRIVATE|<img/);assert.match(html,/03.*08/);assert.match(html,/Slide content; scroll for longer text/);
  if(slide.slide_title)assert.ok(html.includes(slide.slide_title));
 }
});
test('artwork mode, focal position, upload precedence and artwork off are respected',()=>{
 const slide={slide_title:'Title',bullets:['Content'],uploaded_image_url:'https://assets.invalid/owned.png',generated_image_url:'https://assets.invalid/generated.png',active_image_source:'upload',creative_direction:{...c.rootCreative('hero'),artwork:'panel',focal:'right'}};
 let html=renderToStaticMarkup(React.createElement(Slide,{slide}));assert.match(html,/root-art-panel/);assert.match(html,/owned.png/);assert.doesNotMatch(html,/generated.png/);assert.match(html,/object-position:right/);
 html=renderToStaticMarkup(React.createElement(Slide,{slide,showArtwork:false}));assert.doesNotMatch(html,/<img/);
 html=renderToStaticMarkup(React.createElement(Slide,{slide:{...slide,creative_direction:{...slide.creative_direction,artwork:'none'}}}));assert.doesNotMatch(html,/<img/);
});
test('audience API projection strips private notes including nested creative metadata',()=>{
 const projected=audience.audienceResource({id:ids.request,source_solution_brief_id:'PRIVATE',content:{source_snapshot:'PRIVATE',creative_direction:{...c.rootCreative('hero'),notes:'PRIVATE'},slides:[{slide_title:'Public',speaker_notes:'PRIVATE',creative_direction:{...c.rootCreative('hero'),script:'PRIVATE'}}]}});
 assert.doesNotMatch(JSON.stringify(projected),/PRIVATE|source_snapshot|speaker_notes/);
 assert.equal(projected.content.slides[0].creative_direction.preset,c.ROOT_PRESET.preset);
});
test('only newly generated Solution Brief content gets preset; evidence remains proposed',()=>{
 const input={slides:Array.from({length:8},(_,i)=>({slide_title:`Slide ${i}`,bullets:['Content'],speaker_notes:'Private'}))};const before=JSON.stringify(input);
 const output=audience.withSolutionLayouts(input,'Agree a before/after reflection');assert.equal(JSON.stringify(input),before);
 assert.equal(output.creative_direction.preset,c.ROOT_PRESET.preset);assert.equal(new Set(output.slides.map(s=>s.creative_direction.layout)).size,6);
 assert.equal(output.slides[3].slide_title,'Evidence to collect');assert.match(output.slides[3].bullets.join(' '),/Measurement plan for review/);
 const old=renderToStaticMarkup(React.createElement(Slide,{slide:{layout:'hero',slide_title:'Legacy',bullets:['Existing']}}));assert.match(old,/solution-slide-hero/);assert.doesNotMatch(old,/root-canvas/);
});
test('private guidance renders clean sections without Markdown or generated HTML',()=>{
 const Guidance=load('app/dashboard/resources/PresenterGuidance.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Guidance,{notes:'**Script:** Welcome\n## Facilitation\nInvite reflection\n**Transition:** Next\nTiming: 3 minutes\n<script>bad</script>'}));
 for(const title of ['Script','Facilitation','Transition','Timing'])assert.match(html,new RegExp(`<h3>${title}</h3>`));assert.doesNotMatch(html,/\*\*|##|<script>/);assert.match(html,/&lt;script&gt;/);
});
test('bounded editor controls update structured metadata without touching slide content',async()=>{
 const Controls=load('app/dashboard/resources/CreativeControls.tsx').default;let next;let tree;
 await renderer.act(async()=>{tree=renderer.create(React.createElement(Controls,{value:c.rootCreative('hero'),onChange:v=>next=v}));});
 const selects=tree.root.findAllByType('select');assert.equal(selects.length,4);
 await renderer.act(async()=>selects[0].props.onChange({target:{value:'framework'}}));assert.equal(next.layout,'framework');assert.equal(next.preset,c.ROOT_PRESET.preset);
 await renderer.act(async()=>tree.unmount());
});
for(const kind of ['present','presenter']) test(`${kind}: navigation, slide-jump, artwork and fullscreen use existing state; legacy UI stays gated`,async()=>{
 const calls=[],storage=new Map();let fullscreen=false;
 const slides=['hero','framework'].map(layout=>({slide_title:layout,bullets:['Visible'],speaker_notes:'**Script:** PRIVATE SCRIPT\nFacilitation: PRIVATE FACILITATION',creative_direction:c.rootCreative(layout)}));
 const events={}; const Page=load(`app/dashboard/resources/${kind}/[id]/page.tsx`,{'next/navigation':{useParams:()=>({id:ids.request})},'@/lib/tenantFetch':{tenantFetch:async url=>{calls.push(url);return Response.json({resource:{id:ids.request,title:'Synthetic',content:{slides:kind==='present'?slides.map(audience.audienceSlide):slides}}});}}}, {
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  window:{location:{search:`?organisationId=${ids.org}`},addEventListener:(k,v)=>events[k]=v,removeEventListener(){},open:url=>calls.push(url)},
  document:{get fullscreenElement(){return fullscreen?{}:null;},documentElement:{requestFullscreen:async()=>{fullscreen=true;}},exitFullscreen:async()=>{fullscreen=false;},addEventListener(){},removeEventListener(){}},BroadcastChannel:undefined,
 });let tree;
 try{
  await renderer.act(async()=>{tree=renderer.create(React.createElement(Page.default));});
  const btn=name=>tree.root.findAllByType('button').find(n=>n.children.join('')===name);
  assert.ok(btn('Fullscreen'));assert.equal(tree.root.findByProps({'aria-label':'Jump to slide'}).props.value,0);
  await renderer.act(async()=>btn('Next').props.onClick());assert.equal(tree.root.findByProps({'aria-label':'Jump to slide'}).props.value,1);
  await renderer.act(async()=>tree.root.findByProps({'aria-label':'Jump to slide'}).props.onChange({target:{value:'0'}}));
  await renderer.act(async()=>btn('Artwork on').props.onClick());assert.ok(btn('Artwork off'));
  await renderer.act(async()=>btn('Fullscreen').props.onClick());assert.equal(fullscreen,true);
  const rendered=JSON.stringify(tree.toJSON());if(kind==='present')assert.doesNotMatch(rendered,/PRIVATE/);else {assert.match(rendered,/PRIVATE SCRIPT/);assert.doesNotMatch(rendered,/\*\*/);}
  assert.match(calls[0],new RegExp(`view=${kind==='present'?'audience':'presenter'}`));assert.ok([...storage.values()].some(s=>JSON.parse(s).showArtwork===false));
 }finally{if(tree)await renderer.act(async()=>tree.unmount());}
});
