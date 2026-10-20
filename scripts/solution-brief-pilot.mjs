// Isolated local UI/API pilot. Real handlers + disposable PostgreSQL; no live
// credentials, network generation, provider writes or production data.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fixture, ids, load } from "../tests/helpers/solution-brief-fixture.mjs";
const require=createRequire(import.meta.url),root=process.cwd();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"root-solution-pilot-"));
const f=await fixture();
await f.sql.query("update proposal_requests set submission_payload=$1 where id=$2", [JSON.stringify({ workshop_title:"Burnout workshop",client_organisation:"Controlled Care Group",contact_name:"Controlled HR requester",audience:"Nursing-home managers",duration:"45 minutes",delivery_format:"In person",notes:"Help managers recognise workload pressure and discuss practical prevention.",desired_outcomes:"Recognise workload pressure and agree practical prevention actions for the team.",timing:"November, date to confirm",estimated_investment:"Budget to confirm" }),ids.request]);
const aliases={"@":root,react:path.join(root,"node_modules/react"),"react-dom":path.join(root,"node_modules/react-dom"),"next/navigation":path.join(dir,"navigation.js")};
fs.writeFileSync(path.join(dir,"navigation.js"),'export const useParams=()=>({id:window.location.pathname.split("/").pop()});');
fs.writeFileSync(path.join(dir,"loader.cjs"),`const ts=require(${JSON.stringify(path.join(root,"node_modules/typescript"))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;}`);
function cssLoader(source) { return "const style=document.createElement('style');style.textContent="+JSON.stringify(source)+";document.head.appendChild(style);"; }
fs.writeFileSync(path.join(dir,"css.cjs"), "module.exports="+cssLoader.toString());
const entry=`import React from "react";import{createRoot}from"react-dom/client";
import Brief from ${JSON.stringify(path.join(root,"app/dashboard/solution-briefs/page.tsx"))};
import Resources from ${JSON.stringify(path.join(root,"app/dashboard/resources/page.tsx"))};
import Requests from ${JSON.stringify(path.join(root,"app/dashboard/proposal-requests/page.tsx"))};
import Audience from ${JSON.stringify(path.join(root,"app/dashboard/resources/present/[id]/page.tsx"))};
import Presenter from ${JSON.stringify(path.join(root,"app/dashboard/resources/presenter/[id]/page.tsx"))};
const p=location.pathname;const Page=p.includes("/present/")?Audience:p.includes("/presenter/")?Presenter:p.includes("solution-briefs")?Brief:p.includes("proposal-requests")?Requests:Resources;
createRoot(document.getElementById("root")).render(React.createElement(Page));`;
fs.writeFileSync(path.join(dir,"entry.js"),entry);
await new Promise((resolve,reject)=>require("next/dist/compiled/webpack/webpack").webpack({mode:"development",devtool:false,entry:path.join(dir,"entry.js"),output:{path:dir,filename:"pilot.js"},resolve:{alias:aliases,extensions:[".tsx",".ts",".js"],modules:[path.join(root,"node_modules")]},module:{rules:[{test:/\.tsx?$/,use:path.join(dir,"loader.cjs")},{test:/\.css$/,use:path.join(dir,"css.cjs")}]},plugins:[new(require("next/dist/compiled/webpack/webpack").webpack.DefinePlugin)({"process.env.NODE_ENV":JSON.stringify("development")})]},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
const profile=load("lib/brandGrowthProfile.ts").emptyProfile;
const routes={"/api/solution-briefs":"app/api/solution-briefs/route.ts","/api/proposal-requests":"app/api/proposal-requests/route.ts","/api/resource-library":"app/api/resource-library/route.ts"};
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,"http://localhost:3187");
  if(url.pathname==="/pilot.js"){res.setHeader("Content-Type","application/javascript; charset=utf-8");res.end(fs.readFileSync(path.join(dir,"pilot.js")));return;}
  if(!url.pathname.startsWith("/api/")){res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Solution Brief · controlled local pilot</title><style>body{margin:0;background:#f5f7f2}button,input,textarea{font:inherit}</style></head><body><div style="background:#173f35;color:white;padding:12px 24px;font:12px Arial">ROOT HEALTH OPS · CONTROLLED LOCAL PILOT · SYNTHETIC DATA ONLY</div><div id="root"></div><script src="/pilot.js"></script></body></html>');return;}
  let result;
  if(url.pathname==="/api/social-accounts")result=Response.json({organisationId:ids.org,accounts:[]});
  else if(url.pathname==="/api/usage")result=Response.json({usage:0,limit:150});
  else if(url.pathname==="/api/organisation/profile")result=Response.json({success:true,organisationId:ids.org,organisationName:"Controlled Learning",profile,canEdit:true});
  else {
   const file=routes[url.pathname]||(url.pathname.startsWith("/api/resources/")?"app/api/resources/[id]/route.ts":null);
   if(!file){res.writeHead(404);res.end("No fixture route");return;}
   const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString();
   const request=f.req(body?JSON.parse(body):null,req.method,req.url);
   result=await f.route(file)[req.method](request);
  }
  res.writeHead(result.status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(await result.text());
 } catch(error){console.error(error);res.writeHead(500);res.end(JSON.stringify({error:"Controlled pilot error"}));}
});
server.listen(3187,"127.0.0.1",()=>console.log(`Controlled pilot: http://localhost:3187/dashboard/solution-briefs?requestId=${ids.request}&organisationId=${ids.org}`));
process.on("SIGINT",()=>{server.close();void f.close().then(()=>process.exit());});
