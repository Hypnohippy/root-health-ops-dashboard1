import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url), React=require("react"), renderer=require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const base="884614d518dbcf7518d73e582991ff2053614b75";
const before=file=>execFileSync("git",["show",`${base}:${file}`],{encoding:"utf8"});
function load(file,mocks={},globals={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,AbortController,Date,console,...globals,require:n=>n in mocks?mocks[n]:n.endsWith(".css")?{}:n.startsWith("@/")?load(n.replace("@/","")+".ts",mocks,globals):n.startsWith(".")?load(path.resolve(path.dirname(file),n)+".tsx",mocks,globals):require(n)});return mod.exports;}
function withoutPresentation(source){
 source=source.replaceAll("\r\n","\n");
 const file=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const result=ts.transform(file,[context=>root=>{
  const visit=node=>{
   if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text==="./home.css")return undefined;
   if(ts.isJsxAttribute(node)&&["className","data-group"].includes(node.name.getText(file)))return undefined;
   if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==="className"&&a.initializer?.text==="home-briefing-mark"))return undefined;
   return ts.visitEachChild(node,visit,context);
  };return ts.visitNode(root,visit);
 }]);
 const printed=ts.createPrinter().printFile(result.transformed[0]);result.dispose();return printed.replaceAll("\r\n","\n");
}
for(const file of ["app/dashboard/page.tsx","app/dashboard/ControlOverview.tsx"]){test(`${file}: all non-presentation code, live values, text, handlers and links match approved baseline`,()=>{
 assert.equal(withoutPresentation(fs.readFileSync(file,"utf8")),withoutPresentation(before(file)));
});}
test("Home retains the exact scenic shell apart from the approved shared Ask Root mount",()=>{
 const file="app/dashboard/ClientDashboardLayout.tsx",source=fs.readFileSync(file,"utf8").replaceAll("\r\n","\n");
 const withoutGuide=source.replace('import RootCoach from "./components/RootCoach";\n',"").replace('      <RootCoach pathname={pathname} organisationId={orgId} founderAllowed={founderAccess} />\n',"");
 assert.equal(withoutGuide.replace('pathname === "/dashboard" || ',""),before(file).replaceAll("\r\n","\n"));
 assert.match(source,/pathname === "\/dashboard" \|\| pathname === "\/dashboard\/growth"/);
 for(const feature of ["ops-sidebar-ambient","ops-mobile-menu-toggle","ops-workspace-topbar"])assert.ok(source.includes(feature));
});
test("live operational projections, APIs, manual recovery and all frozen screen implementations remain byte-identical",()=>{
 for(const file of ["lib/homeControl.ts","lib/commandCentre.ts","lib/responseLifecycle.ts","app/api/home/attention/route.ts","app/api/org/current/route.ts","app/dashboard/components/ManualTakeover.tsx","app/dashboard/root-visual-system.css","app/dashboard/founder-intelligence/page.tsx","app/dashboard/growth/acquisition/page.tsx","app/dashboard/responses/page.tsx","app/dashboard/sequences/page.tsx","app/dashboard/publishing/page.tsx","app/dashboard/resources/page.tsx","app/dashboard/connect/page.tsx"]){assert.equal(fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),before(file).replaceAll("\r\n","\n"),file);}
});
test("Home styling is scoped, light and responsive; helpers, evidence and long text remain available",()=>{
 const css=fs.readFileSync("app/dashboard/home.css","utf8"),view=fs.readFileSync("app/dashboard/ControlOverview.tsx","utf8");
 for(const token of [".home-workspace",".home-control-group",".home-group-human",".home-group-in_hand",".home-action-dock",".home-control-record","@media(max-width:767px)","overflow-wrap:anywhere","white-space:pre-wrap"])assert.ok(css.includes(token),token);
 assert.doesNotMatch(css,/overflow-x:hidden|display:none/);
 for(const text of ["Manual fallback","ManualTakeover","History / source evidence","Prepared message / action preview","Schedules show recorded intent","Recovery summary"])assert.ok(view.includes(text),text);
 assert.doesNotMatch(fs.readFileSync("app/dashboard/page.tsx","utf8"),/RootCoach|root-coach/);
});
test("actual Home renders existing tenant-scoped live counts and destinations, refreshes with GET only",async()=>{
 const calls=[],clipboard=[],windows={location:{search:"?organisationId=tenant-home"},addEventListener:()=>{},removeEventListener:()=>{}};
 const fixture={organisationId:"tenant-home",control:{generatedAt:"2026-10-15T09:00:00Z",groups:[{key:"done",count:4,href:"/dashboard?organisationId=tenant-home&group=done"},{key:"in_hand",count:5,href:"/dashboard?organisationId=tenant-home&group=in_hand"},{key:"human",count:0,href:"/dashboard?organisationId=tenant-home&group=human"},{key:"blocked",count:2,href:"/dashboard?organisationId=tenant-home&group=blocked"}],items:[]},counts:{newOpportunities:9,linkedInConnections:8,outreachReady:7,repliesNeedingResponse:6,followupsDue:5,waiting:4,warmOpportunities:3,meetingsOrConversions:2,contentApprovals:1,connectionProblems:0}};
 const mocks={"next/link":props=>React.createElement("a",props),"./components/ManualTakeover":()=>null};
 const Home=load("app/dashboard/page.tsx",mocks,{window:windows,navigator:{clipboard:{writeText:text=>{clipboard.push(text);return Promise.resolve();}}},fetch:async(url,opts)=>{calls.push([url,opts]);assert.ok(!opts.method||opts.method==="GET");return {ok:true,json:async()=>url.startsWith("/api/org/current")?{organisationId:"tenant-home"}:fixture};}}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Home));});
 assert.deepEqual(calls.map(c=>c[0]),["/api/org/current?organisationId=tenant-home","/api/home/attention?organisationId=tenant-home"]);
 const output=JSON.stringify(tree.toJSON());assert.match(output,/Your next decisions/);assert.match(output,/No human decisions are currently identified/);
 const links=tree.root.findAllByType("a");for(const href of ["/dashboard/publishing?organisationId=tenant-home","/dashboard/growth/acquisition?organisationId=tenant-home","/dashboard/responses?organisationId=tenant-home","/dashboard/responses?status=needs_reply&organisationId=tenant-home"])assert.ok(links.some(n=>n.props.href===href),href);
 const cards=links.filter(n=>String(n.props.className).includes("home-workspace-card"));assert.equal(cards.length,10);
 assert.deepEqual(cards.map(n=>n.findAllByType("span")[0].children[0]),["6","8","5","9","7","1","4","3","2","0"]);
 const refresh=tree.root.findAllByType("button").find(n=>n.children.join("")==="Refresh state");await renderer.act(async()=>refresh.props.onClick());assert.equal(calls.length,4);assert.equal(clipboard.length,0);
 await renderer.act(async()=>tree.unmount());
});
test("Home unavailable state never substitutes fabricated zero counts",async()=>{
 const Home=load("app/dashboard/page.tsx",{"next/link":props=>React.createElement("a",props)},{window:{location:{search:""}},fetch:async()=>{throw Error("offline");}}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Home));});
 assert.match(JSON.stringify(tree.toJSON()),/Counts are unavailable/);assert.equal(tree.root.findAll(n=>String(n.props.className).includes("home-workspace-card")).length,0);await renderer.act(async()=>tree.unmount());
});
