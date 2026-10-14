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

test("pilot styling is Relationship-detail-only; existing nav routes, Founder permission and attention deep link survive",async()=>{
 const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",attentionHref=`/dashboard/responses?organisationId=${org}&platform=linkedin&status=needs_reply&itemId=existing`;
 for(const pathname of ["/dashboard/growth","/dashboard/growth/relationships","/dashboard/growth/relationships/inbox_existing","/dashboard/responses","/dashboard/growth/acquisition","/dashboard/founder-intelligence"]){
  const requests=[],fetch=async(url,opts)=>{requests.push({url,opts});return {ok:true,json:async()=>url==="/api/org/current"?{organisationId:org}:url.includes("/access?")?{allowed:false}:{responseAttention:{count:3,href:attentionHref,channels:{linkedin:{count:3,href:attentionHref}}},counts:{newOpportunities:7,repliesNeedingResponse:3,followupsDue:2}}};};
  const C=load("app/dashboard/ClientDashboardLayout.tsx",{"next/navigation":{usePathname:()=>pathname},"next/link":({children,...props})=>React.createElement("a",props,children),"./components/AcquisitionHandoff":()=>null},{fetch}).default;
  let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(C,null,React.createElement("p",null,"Existing page content")));});
  const root=tree.root.findAllByType("div").find(x=>Object.hasOwn(x.props,"data-visual-system"));
  assert.equal(root.props["data-visual-system"],pathname.startsWith("/dashboard/growth/relationships/")?"root":undefined);
  const nav=tree.root.findAllByType("nav").find(x=>x.props["aria-label"]==="Primary navigation"),links=nav.findAllByType("a");
  assert.deepEqual(links.map(a=>a.props.href),["/dashboard","/dashboard/growth/acquisition",attentionHref,"/dashboard/sequences","/dashboard/publishing","/dashboard/growth","/dashboard/resources","/dashboard/connect"]);
  assert.equal(links.some(a=>a.props.href==="/dashboard/founder-intelligence"),false);
  assert.ok(nav.findAllByType("span").some(x=>x.props.className==="sr-only"&&x.children.join("")==="3 responses need attention"));
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
