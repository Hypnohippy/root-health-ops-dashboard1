import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),React=require("react"),renderer=require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,mocks={},globals={}) { const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Date,Intl,console,window:{addEventListener(){},removeEventListener(){}},...globals,require:n=>n in mocks?mocks[n]:n.endsWith(".css")?{}:n.startsWith("@/")?load(n.replace("@/","")+".ts",mocks,globals):n.startsWith(".")?load(path.resolve(path.dirname(file),n)+(fs.existsSync(path.resolve(path.dirname(file),n)+".tsx")?".tsx":".ts"),mocks,globals):require(n)});return mod.exports; }

test("persistent Growth shell covers every Growth route; existing nav routes, Founder permission and attention deep link survive",async()=>{
 const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",attentionHref=`/dashboard/responses?organisationId=${org}&platform=linkedin&status=needs_reply&itemId=existing`;
 for(const pathname of ["/dashboard/growth","/dashboard/growth/relationships","/dashboard/growth/relationships/inbox_existing","/dashboard/growth/followups","/dashboard/growth/waiting","/dashboard/growth/pipeline","/dashboard/growth/import","/dashboard/growth/tracker","/dashboard/growth/cadence-report","/dashboard/responses","/dashboard/growth/acquisition","/dashboard/founder-intelligence"]){
  const requests=[],fetch=async(url,opts)=>{requests.push({url,opts});return {ok:true,json:async()=>url==="/api/org/current"?{organisationId:org}:url.includes("/access?")?{allowed:false}:{responseAttention:{count:3,href:attentionHref,channels:{linkedin:{count:3,href:attentionHref}}},counts:{newOpportunities:7,repliesNeedingResponse:3,followupsDue:2}}};};
  const C=load("app/dashboard/ClientDashboardLayout.tsx",{"next/navigation":{usePathname:()=>pathname},"next/link":({children,...props})=>React.createElement("a",props,children),"./components/AcquisitionHandoff":()=>null},{fetch}).default;
  let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(C,null,React.createElement("p",null,"Existing page content")));});
  const root=tree.root.findAllByType("div").find(x=>Object.hasOwn(x.props,"data-visual-system"));
  assert.equal(root.props["data-visual-system"],(pathname==="/dashboard/growth"||pathname.startsWith("/dashboard/growth/"))?"root":undefined);
  const nav=tree.root.findAllByType("nav").find(x=>x.props["aria-label"]==="Primary navigation"),links=nav.findAllByType("a");
  assert.deepEqual(links.map(a=>a.props.href),["/dashboard","/dashboard/growth/acquisition",attentionHref,"/dashboard/sequences","/dashboard/publishing","/dashboard/growth","/dashboard/resources","/dashboard/connect"]);
  assert.equal(links.some(a=>a.props.href==="/dashboard/founder-intelligence"),false);
  assert.ok(nav.findAllByType("span").some(x=>x.props.className==="sr-only"&&x.children.join("")==="3 responses need attention"));
  if(pathname==="/dashboard/growth") {
   assert.equal(tree.root.findAllByProps({"aria-label":"Mobile navigation"}).length,0);
   const toggle=tree.root.findByProps({"aria-controls":"growth-shell-navigation"});
   assert.equal(toggle.props["aria-expanded"],false);
   await renderer.act(async()=>toggle.props.onClick());
   assert.equal(tree.root.findByProps({id:"growth-shell-navigation"}).props["data-mobile-open"],true);
   await renderer.act(async()=>tree.root.findByProps({id:"growth-shell-navigation"}).props.onKeyDown({key:"Escape"}));
   assert.equal(toggle.props["aria-expanded"],false);
  }
  assert.equal(requests.length,3);assert.ok(requests.every(r=>!r.opts?.method||r.opts.method==="GET"));
  assert.ok(requests.filter(r=>r.url!=="/api/org/current").every(r=>r.url.includes(org)));
  await renderer.act(async()=>tree.unmount());
 }
});

test("light content, navy frame and intelligence token text meet normal-text AA contrast",()=>{
 const css=fs.readFileSync("app/dashboard/root-visual-system.css","utf8"),tokens=Object.fromEntries([...css.matchAll(/--(ops-[\w-]+):\s*(#[\da-f]{6});/gi)].map(m=>[m[1],m[2]]));
 const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(const [fg,bg] of [["ops-ink","ops-surface"],["ops-muted","ops-surface"],["ops-muted","ops-canvas"],["ops-on-frame","ops-frame"],["ops-on-frame-muted","ops-frame"],["ops-on-emerald","ops-emerald"],["ops-blue-ink","ops-blue-surface"],["ops-violet-ink","ops-violet-surface"],["ops-green-ink","ops-green-surface"]]){
  const a=luminance(tokens[fg]),b=luminance(tokens[bg]),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(contrast>=4.5,`${fg} on ${bg}: ${contrast.toFixed(2)}`);
 }
});

test("Overview metrics count stored entries only, dedupe IDs and never infer dates from snapshot text",()=>{
 const {overviewEvidence}=load("app/dashboard/growth/relationships/components/RelationshipOverviewVisuals.tsx");
 const outbound={id:"out",direction:"outbound",at:"2026-10-13T07:48:00Z"},snapshot={id:"snapshot",direction:"snapshot",at:null,recordedAt:"2026-10-14T09:00:00Z",text:"Many messages and old timestamps 2019-01-01"};
 const a={id:"a",at:"2026-10-11T10:00:00Z"},b={id:"b",at:"2026-10-13T08:00:00Z"},c={id:"c",at:"2026-10-13T09:00:00Z"};
 const result=overviewEvidence({dated:[outbound,outbound],undated:[snapshot]},{dated:[a,b,c,b,{id:"invalid",at:"not a date"},{id:"unknown",at:null,recordedAt:"2026-10-14"}],undated:[snapshot]},[{status:"open"},{status:"done"},{status:"cancelled"}]);
 assert.equal(result.entries,2);assert.equal(result.snapshots,1);assert.equal(result.openTasks,1);assert.equal(JSON.stringify(result.days),JSON.stringify([{date:"2026-10-11",count:1},{date:"2026-10-13",count:2}]));
});

test("Health stays unassessed and the pipeline never fills earlier or unknown stages",()=>{
 const {RelationshipHealthCard,CommercialPipelineCard}=load("app/dashboard/growth/relationships/components/RelationshipOverviewVisuals.tsx"),render=require("react-dom/server").renderToStaticMarkup;
 const health=render(React.createElement(RelationshipHealthCard));assert.match(health,/Not established/);assert.match(health,/Momentum not assessed/);assert.doesNotMatch(health,/Momentum: High|92\/100|aria-valuenow/);
 const unknown=render(React.createElement(CommercialPipelineCard,{stage:"no_reply_needed",nextAction:"Respect recorded state",due:null}));assert.match(unknown,/No action due/);assert.match(unknown,/Pipeline stage not established/);assert.equal((unknown.match(/data-current="true"/g)||[]).length,0);
 const known=render(React.createElement(CommercialPipelineCard,{stage:"engaged",nextAction:"Review conversation",due:null}));assert.equal((known.match(/data-current="true"/g)||[]).length,1);assert.match(known,/data-current="true"[^>]*>Conversation/);
});

test("Value and activity graphics require actual evidence and are labelled as comparison or recorded counts",()=>{
 const {ValueEvidenceGraphic,RelationshipMetricsCard,RelationshipAvatar}=load("app/dashboard/growth/relationships/components/RelationshipOverviewVisuals.tsx"),render=require("react-dom/server").renderToStaticMarkup;
 const unknown=render(React.createElement(ValueEvidenceGraphic,{}));assert.match(unknown,/Not established/);assert.doesNotMatch(unknown,/role="img"/);
 const empty=render(React.createElement(RelationshipMetricsCard,{evidence:{entries:0,snapshots:0,openTasks:0,days:[]}}));assert.match(empty,/Activity trend · Not established/);assert.doesNotMatch(empty,/role="img"/);
 const {calculateValue}=load("lib/relationshipValue.ts");const value=calculateValue({method:"per_employee",currency:"GBP",eligibleEmployees:10,standardRate:1,expectedQuantity:5,oneOffPotential:0,oneOffExpected:0,quantitySource:"Unit fixture",priceSource:"Unit fixture"});
 const known=render(React.createElement(ValueEvidenceGraphic,{value}));assert.match(known,/Potential £120.00; expected £60.00/);assert.match(known,/not a growth forecast/);const expectedOnly=render(React.createElement(ValueEvidenceGraphic,{value:{...value,potential:null}}));assert.match(expectedOnly,/Potential not established; expected £60.00/);
 const chart=render(React.createElement(RelationshipMetricsCard,{value,evidence:{entries:2,snapshots:1,openTasks:0,days:[{date:"2026-10-11",count:1},{date:"2026-10-13",count:2}]}}));assert.match(chart,/2026-10-11: 1 recorded events; 2026-10-13: 2 recorded events/);assert.match(chart,/not inferred messages/);
 const avatar=render(React.createElement(RelationshipAvatar,{name:"Tracy Fountain",kind:"person"}));assert.match(avatar,/>TF</);assert.doesNotMatch(avatar,/<img|online|presence/);
});

 test("Today visuals show loaded evidence only and preserve unavailable commercial/plan states",()=>{
 const C=load("app/dashboard/growth/GrowthTodayVisuals.tsx").default,render=require("react-dom/server").renderToStaticMarkup;
 const empty=render(React.createElement(C,{loading:false,followups:[],posts:0,targets:0,approved:false,saved:false}));
 assert.match(empty,/No loaded follow-up data/);assert.match(empty,/Not established/);assert.match(empty,/Not generated/);assert.doesNotMatch(empty,/£150|Momentum: High|92\/100/);
 const loaded=render(React.createElement(C,{loading:false,followups:[{id:"1",stage:"day3_followup"},{id:"2",stage:"day3_followup"},{id:"3",stage:"day7_parity"}],posts:3,targets:2,approved:true,saved:true}));
 assert.match(loaded,/3 loaded follow-ups/);assert.match(loaded,/day3 followup/);assert.match(loaded,/day7 parity/);assert.match(loaded,/Up to 10 from the existing Today loader/);assert.match(loaded,/no historical trend inferred/);
 assert.equal((loaded.match(/data-recorded="true"/g)||[]).length,2);
});
 test("Today presentation keeps existing handler bodies and initial read path unchanged",()=>{
 const page=fs.readFileSync("app/dashboard/growth/page.tsx","utf8").replaceAll("\r\n","\n");
 const baseline=require("node:child_process").execFileSync("git",["show","1174ff4e1fbb28a8cdaadba8f7b4071a9f3a607c:app/dashboard/growth/page.tsx"],{encoding:"utf8"});
 assert.equal(page.slice(page.indexOf("  const ["),page.indexOf("  return (")),baseline.replaceAll("\r\n","\n").slice(baseline.replaceAll("\r\n","\n").indexOf("  const ["),baseline.replaceAll("\r\n","\n").indexOf("  return (")));
 assert.match(page,/className="growth-today-dock"/);assert.equal((page.match(/onClick=\{generate\}/g)||[]).length,1);
 const visuals=fs.readFileSync("app/dashboard/growth/GrowthTodayVisuals.tsx","utf8");assert.doesNotMatch(visuals,/tenantFetch|useEffect|fetch\(|POST|supabase/);
});

 test("Targets presentation preserves due loading, stage filtering, forms and exact server actions",async()=>{
 const requests=[],org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const C=load("app/dashboard/growth/followups/page.tsx",{"@/lib/growthDue.server":{readDueGrowthTargets:async(id)=>{requests.push(id);return [{id:"one",target_name:"Known Person",stage:"connection",lead_quality:"valid",linkedin_url:"https://linkedin.com/in/known",notes:"Exact source note"},{id:"two",target_name:"Other Person",stage:"day3_followup",lead_quality:"research_needed"}];}},"@/lib/growthOutreach":{outreachStages:["connection","day3_followup"]},"@/lib/tenantAuth":{requireOrganisation:async()=>({organisationId:org})},"@/lib/supabaseAdmin":{supabaseAdmin:{}},"next/cache":{revalidatePath(){}}}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(await C({searchParams:Promise.resolve({organisationId:org,stage:"connection"})}));});
 const text=JSON.stringify(tree.toJSON());assert.match(text,/Known Person/);assert.doesNotMatch(text,/Other Person/);assert.match(text,/Exact source note/);assert.match(text,/Not established/);
 assert.equal(requests.length,1);assert.equal(requests[0],org);
 assert.deepEqual(tree.root.findAllByType("form").map(f=>f.props.action.name),["addTarget","updateLeadQuality"]);
 assert.ok(tree.root.findAllByType("a").some(a=>a.props.href===`/dashboard/responses/linkedin?organisationId=${org}&view=followups`));
 const page=fs.readFileSync("app/dashboard/growth/followups/page.tsx","utf8").replaceAll("\r\n","\n"),before=require("node:child_process").execFileSync("git",["show","95d7e9b:app/dashboard/growth/followups/page.tsx"],{encoding:"utf8"}).replaceAll("\r\n","\n");
 assert.equal(page.slice(page.indexOf("  const params"),page.indexOf("  return (",page.indexOf("  const params"))),before.slice(before.indexOf("  const params"),before.indexOf("  return (",before.indexOf("  const params"))));
 await renderer.act(async()=>tree.unmount());
 });

 test("Waiting preserves tenant query, recorded dates, due helper, reply status and profile destination",async()=>{
 const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",calls=[],rows=[{id:"one",target_name:"Recorded Person",company:"Recorded Company",role_title:"People lead",stage:"day3_followup",reply_status:"no_reply",last_action_at:"2026-10-13T12:00:00Z",linkedin_url:"https://www.linkedin.com/in/recorded"}];
 const query={select(...args){calls.push(["select",...args]);return this},eq(...args){calls.push(["eq",...args]);return this},not(...args){calls.push(["not",...args]);return this},async order(...args){calls.push(["order",...args]);return {data:rows,error:null}}};
 const dueCalls=[];const C=load("app/dashboard/growth/waiting/page.tsx",{"@/lib/growthOutreach":{growthFollowUpDueAt:t=>{dueCalls.push(t.id);return null;}},"@/lib/tenantAuth":{requireOrganisation:async(id,write)=>{assert.equal(id,org);assert.equal(write,false);return {organisationId:org}}},"@/lib/supabaseAdmin":{supabaseAdmin:{from:table=>{calls.push(["from",table]);return query}}}}).default;
 let tree;await renderer.act(async()=>tree=renderer.create(await C({searchParams:Promise.resolve({organisationId:org})})));
 const text=JSON.stringify(tree.toJSON());assert.match(text,/Recorded Person/);assert.match(text,/Confirmed first-send evidence required/);assert.match(text,/no_reply/);assert.match(text,/Not established/);assert.deepEqual(dueCalls,["one"]);
 assert.equal(JSON.stringify(calls),JSON.stringify([["from","growth_targets"],["select","*"],["eq","organisation_id",org],["eq","status","active"],["not","last_action_at","is",null],["order","last_action_at",{ascending:false}]]));
 assert.ok(tree.root.findAllByType("a").some(a=>a.props.href===rows[0].linkedin_url));assert.equal(tree.root.findAllByType("form").length,0);
 const page=fs.readFileSync("app/dashboard/growth/waiting/page.tsx","utf8").replaceAll("\r\n","\n"),base=require("node:child_process").execFileSync("git",["show","bc118c1:app/dashboard/growth/waiting/page.tsx"],{encoding:"utf8"}).replaceAll("\r\n","\n");
 for(const [start,end] of [["function nextDueDate","export default"],["  const { organisationId }","  if (error)"]])assert.equal(page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start))),base.slice(base.indexOf(start),base.indexOf(end,base.indexOf(start))));
 await renderer.act(async()=>tree.unmount());
 });
 test("Waiting empty and error views remain explicit without invented activity or metrics",async()=>{
 for(const result of [{data:[],error:null},{data:null,error:{message:"Read unavailable"}}]){
 const chain={select(){return this},eq(){return this},not(){return this},order:async()=>result};
 const C=load("app/dashboard/growth/waiting/page.tsx",{"@/lib/growthOutreach":{growthFollowUpDueAt(){throw Error("No dated target expected")}},"@/lib/tenantAuth":{requireOrganisation:async()=>({organisationId:"tenant"})},"@/lib/supabaseAdmin":{supabaseAdmin:{from:()=>chain}}}).default;
 let tree;await renderer.act(async()=>tree=renderer.create(await C({searchParams:Promise.resolve({})})));const text=JSON.stringify(tree.toJSON());assert.match(text,result.error?/Read unavailable/:/No recently contacted leads yet/);assert.doesNotMatch(text,/Momentum: High|92\/100|£150/);await renderer.act(async()=>tree.unmount());
 }
 });
