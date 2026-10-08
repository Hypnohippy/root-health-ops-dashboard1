import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
function load(file, deps = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { module: mod, exports: mod.exports, URL, URLSearchParams, Error, process: { env: {} }, require: name => { assert.ok(name in deps, name); return deps[name]; }, ...globals });
  return mod.exports;
}
const caps = load("lib/channelCapabilities.ts");
const setup = load("lib/providerSetup.ts", { "@/lib/channelCapabilities": caps });
const config = load("lib/providerSetup.server.ts");
test("all catalog channels have a safe setup journey without invented operational verification", () => {
  for (const c of caps.channelCatalog) {
    const result = setup.buildProviderSetup(c.id, "connected", true);
    assert.ok(result.customerStep && result.limitation && result.recheck && result.fallback);
    assert.match(result.recheck, /Unverified capabilities stay unverified/);
    assert.equal(caps.assessConnectionCapabilities(c.id, "connected").operationallyVerified, false);
  }
  for (const c of ["youtube", "x", "bluesky", "pinterest", "whatsapp", "reddit", "website", "calendar", "outlook"]) {
    assert.equal(setup.buildProviderSetup(c, "not_connected", null).state, "unsupported");
    assert.equal(setup.buildProviderSetup(c, "not_connected", null).canConnect, false);
  }
});
test("configuration, credentials and permissions are distinct and unknown is never ready", () => {
  for (const c of ["facebook", "instagram", "linkedin", "threads", "tiktok"]) {
    for (const absent of [false, null]) { const r = setup.buildProviderSetup(c, "not_connected", absent); assert.equal(r.canConnect, false); assert.equal(r.state, "credentials_required"); }
    assert.equal(setup.buildProviderSetup(c, "not_connected", true).state, "ready_to_connect");
    assert.notEqual(setup.buildProviderSetup(c, "connected", true).state, "ready_to_connect");
    assert.match(setup.buildProviderSetup(c, "expired", true).connected, /reconnect/);
  }
  assert.equal(setup.buildProviderSetup("google", "connected", true).state, "manual_only");
  assert.equal(setup.buildProviderSetup("tiktok", "connected", true).state, "permissions_incomplete");
  assert.equal(setup.buildProviderSetup("email", "connected", true).canConnect, false);
});
test("server readiness requires app credentials, callback configuration and OAuth state signing", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://ops.example", LINKEDIN_CLIENT_ID: "PUBLIC-ID", LINKEDIN_CLIENT_SECRET: "SECRET", OAUTH_STATE_SECRET: "x".repeat(32) };
  assert.equal(config.providerConfigured("linkedin", env), true);
  for (const key of Object.keys(env)) assert.equal(config.providerConfigured("linkedin", { ...env, [key]: " " }), false);
  assert.equal(config.providerConfigured("linkedin", { ...env, NEXT_PUBLIC_APP_URL: "https://secret:credential@ops.example" }), false);
  assert.equal(config.providerConfigured("linkedin", { ...env, NEXT_PUBLIC_APP_URL: "" }, "https://ops.example"), true);
  assert.equal(config.providerConfigured("tiktok", env), false);
  assert.equal(config.providerConfigured("email", env), null);
  assert.equal(typeof config.providerConfigured("linkedin", env), "boolean");
});
test("guide exposes plain next steps, manual completion limits and no secret entry", () => {
  const Guide = load("app/dashboard/connect/ProviderSetupGuide.tsx", { react: React, "react/jsx-runtime": jsx, "@/lib/providerSetup": setup }).default;
  const html = renderToStaticMarkup(React.createElement(Guide, { platform: "tiktok", health: { state: "connected", setup: setup.buildProviderSetup("tiktok", "connected", true) }, recheck: async () => {} }));
  for (const label of ["Raw OAuth scopes", "Callback route", "Provider review status", "Operator/app configuration", "Direct Post depends"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /type="password"|<input/);
});
test("health recheck is tenant scoped, secret free and does not call providers", async () => {
  let reads = 0;
  const q = { select() { return q; }, eq(k, v) { assert.equal(k, "organisation_id"); assert.equal(v, "tenant-a"); return q; }, order: async () => ({ data: [{ platform: "linkedin", is_active: true, page_access_token: "PRIVATE-TOKEN", page_name: "Member", token_expires_at: null }] }) };
  const route = load("app/api/social/connection-health/route.ts", { "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } }, "@/lib/tenantAuth": { requireOrganisation: async requested => { if (requested !== "tenant-a") throw Error("denied"); return { organisationId: requested }; }, accessErrorResponse: e => e.message === "denied" ? { status: 403 } : null }, "@/lib/supabaseAdmin": { supabaseAdmin: { from() { reads++; return q; } } }, "@/lib/channelCapabilities": caps, "@/lib/connectionHealth": load("lib/connectionHealth.ts"), "@/lib/providerSetup": setup, "@/lib/providerSetup.server": config }, { fetch() { throw Error("No provider call expected"); } });
  for (let n = 0; n < 2; n++) { const r = await route.GET({ nextUrl: new URL("https://ops.example/?organisationId=tenant-a") }); assert.equal(r.status, 200); assert.doesNotMatch(JSON.stringify(r), /PRIVATE-TOKEN/); assert.equal(r.body.checkType, "stored_configuration_and_capabilities"); assert.equal(r.headers["Cache-Control"], "private, no-store"); assert.equal(r.body.connections.find(c => c.platform === "linkedin").operationallyVerified, false); }
  assert.equal(reads, 2);
  assert.equal((await route.GET({ nextUrl: new URL("https://ops.example/?organisationId=tenant-b") })).status, 403);
  assert.equal(reads, 2);
});

const presentation = load("lib/connectionPresentation.ts", { "@/lib/channelCapabilities": caps, "@/lib/providerSetup": setup });
const channel = id => caps.channelCatalog.find(c => c.id === id);
const health = (id, state = "connected", configured = true) => ({ platform: id, state, name: "Example Business", expiresAt: null, setup: setup.buildProviderSetup(id, state, configured) });
const view = (id, h = health(id)) => presentation.connectionPresentation(channel(id), h);
test("customer connection and reconnect are offered only when Root configuration is ready", () => {
 for (const id of ["facebook", "instagram", "linkedin", "threads", "tiktok"]) {
  assert.equal(view(id,health(id,"not_connected")).action,"connect");
  assert.equal(view(id,health(id,"expired")).action,"reconnect");
  for (const configured of [false,null]) for (const state of ["connected","not_connected","expired"]) {
   const result=view(id,health(id,state,configured));assert.equal(result.owner,"root");assert.equal(result.action,"none");
  }
 }
});
test("Root approval and missing capabilities never send customers to fix operator permissions", () => {
 for (const id of ["facebook","instagram","linkedin","threads","tiktok","google","email"]) {
  const h=health(id);const current=view(id,h);assert.equal(current.owner,"root");assert.equal(current.action,"none");
  for(const state of ["provider_approval_required","business_verification_required","developer_registration_required","credentials_required","paid_account_required"]){
   h.setup={...h.setup,state};const result=view(id,h);assert.equal(result.owner,"root");assert.equal(result.action,"none");
  }
 }
 const pending=health("facebook");pending.setup.state="provider_approval_required";
 assert.equal(view("facebook",pending).status,"Waiting for provider approval");
 assert.match(view("facebook",pending).next,/timing is controlled by the provider/);
 assert.doesNotMatch(view("facebook").next,/waiting for.*approval/i);
});
test("connected account never implies fully usable capabilities when verification is absent", () => {
 for(const id of ["facebook","instagram","linkedin","threads","tiktok","email"]){
  const h=health(id);h.operationallyVerified=true; // an isolated flag is not a capability grant
  const result=view(id,h);assert.equal(result.assessment.operationallyVerified,false);assert.match(result.summary,/checking/);
 }
 assert.match(view("google").summary,/cannot publish/);
 assert.match(view("linkedin").summary,/Messages and invitations remain manual/);
 assert.match(view("tiktok").fallback,/Do not upload it again/);
 assert.match(view("email").fallback,/Never repeat an uncertain send/);
});
test("default card is plain language; all support diagnostics and secondary actions are inside Advanced", () => {
 const Guide=load("app/dashboard/connect/ProviderSetupGuide.tsx",{react:React,"react/jsx-runtime":jsx,"@/lib/providerSetup":setup}).default;
 const Card=load("app/dashboard/connect/ChannelCard.tsx",{react:React,"react/jsx-runtime":jsx,"@/lib/channelCapabilities":caps,"@/lib/connectionPresentation":presentation,"./ProviderSetupGuide":Guide}).default;
 for(const id of ["facebook","instagram","linkedin","threads","tiktok","google","email"]){
  const html=renderToStaticMarkup(React.createElement(Card,{channel:channel(id),health:health(id),organisationId:"tenant-a",onDisconnect:async()=>{},recheck:async()=>{}}));
  const collapsed=html.split('<details')[0],advanced=html.slice(html.indexOf('<details'));
  assert.doesNotMatch(collapsed,/OAuth|callback|adapter|token|pages_manage|credential/i);
  assert.equal((collapsed.match(/<button/g)||[]).length,1);
  assert.match(advanced,/Advanced technical details/);assert.match(advanced,/Raw OAuth scopes/);assert.match(advanced,/Callback route/);assert.match(advanced,/Token expiry/);
  assert.doesNotMatch(html,/href="https:\/\/(www\.)?(facebook|instagram|linkedin|threads|tiktok)\./);
 }
});
test("guidance uses existing authorisation routes and explains account selection and return",()=>{
 for(const id of ["facebook","instagram","linkedin","threads","tiktok"]){
  const result=view(id,health(id,"not_connected"));assert.match(channel(id).connectPath,/^\/api\//);
  assert.match(result.steps.join(' '),/Sign in/);assert.match(result.steps.join(' '),/return to Ops/i);
  assert.match(result.steps.join(' '),/Approve the access/);
 }
 assert.match(view("instagram").steps[0],/Facebook/);
 assert.equal(view("youtube",health("youtube","not_connected",null)).status,"Not supported yet");
});

test("guided primary action keeps tenant and provider selection on the existing internal flow",()=>{
 const Guide=load("app/dashboard/connect/ProviderSetupGuide.tsx",{react:React,"react/jsx-runtime":jsx,"@/lib/providerSetup":setup}).default;
 for(const id of ['facebook','instagram','linkedin','threads','tiktok']) {
  let hook=0;
  const react={...React,useState:initial=>[hook++===0?true:initial,()=>{}]};
  const Card=load("app/dashboard/connect/ChannelCard.tsx",{react,"react/jsx-runtime":jsx,"@/lib/channelCapabilities":caps,"@/lib/connectionPresentation":presentation,"./ProviderSetupGuide":Guide}).default;
  const html=renderToStaticMarkup(React.createElement(Card,{channel:channel(id),health:health(id,'not_connected'),organisationId:'tenant-a',onDisconnect:async()=>{},recheck:async()=>{}}));
  assert.match(html,/Continue to authorisation/);assert.match(html,/organisationId=tenant-a/);assert.match(html,/Finish connection setup/);
  assert.doesNotMatch(html,/href="https:/);assert.match(html,/return to Ops/i);
 }
});

test("connection requests use the API platform contract and tenant query; failures reject",async()=>{
 for(const id of ['facebook','instagram','linkedin','threads','tiktok','google']){
  const calls=[];
  const actions=load('lib/connectionActions.ts',{}, {AbortSignal,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({success:true,connections:[],checkedAt:'now'})};}});
  await actions.disconnectConnection(id,'tenant-a');await actions.fetchConnectionHealth('tenant-a');
  assert.equal(calls[0].url,'/api/social-accounts?organisationId=tenant-a');assert.equal(JSON.parse(calls[0].options.body).platform,id);assert.equal(calls[0].options.method,'DELETE');
  assert.equal(calls[1].url,'/api/social/connection-health?organisationId=tenant-a');assert.equal(calls[1].options.cache,'no-store');assert.ok(calls[1].options.signal);
 }
 for(const response of [{ok:false,json:async()=>({error:'Not authorised'})},{ok:true,json:async()=>({success:false,error:'Rejected'})},{ok:true,json:async()=>null}]){
  const actions=load('lib/connectionActions.ts',{}, {AbortSignal,fetch:async()=>response});
  await assert.rejects(actions.disconnectConnection('facebook',null));await assert.rejects(actions.fetchConnectionHealth(null));
 }
});

test("actual card handlers check and disconnect every supported account, prevent duplicate clicks and show errors",async()=>{
 const descendants=node=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(descendants)];
 for(const id of ['facebook','instagram','linkedin','threads','tiktok','google'])for(const fail of [false,true]){
  let checks=0,disconnects=0;const writes=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const react={...React,useState:initial=>[initial,value=>writes.push(value)],useRef:()=>({current:false})};
  const Card=load('app/dashboard/connect/ChannelCard.tsx',{react,'react/jsx-runtime':jsx,'@/lib/channelCapabilities':caps,'@/lib/connectionPresentation':presentation,'./ProviderSetupGuide':()=>null}).default;
  const tree=Card({channel:channel(id),health:health(id,'expired'),organisationId:'tenant-a',recheck:async()=>{checks++;await gate;if(fail)throw Error('Offline');},onDisconnect:async provider=>{assert.equal(provider,id);disconnects++;if(fail)throw Error('Disconnect denied');}});
  const buttons=descendants(tree).filter(n=>n.type==='button');
  const check=buttons.find(n=>n.props.children==='Check connection');const disconnect=buttons.find(n=>n.props.children==='Disconnect');assert.ok(check&&disconnect);
  check.props.onClick();check.props.onClick();disconnect.props.onClick();assert.equal(checks,1);assert.equal(disconnects,0);
  release();await new Promise(resolve=>setTimeout(resolve,0));assert.ok(writes.some(v=>typeof v==='string'&&v.includes(fail?'Could not check':'information updated')));
  disconnect.props.onClick();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(disconnects,1);assert.ok(writes.some(v=>typeof v==='string'&&v.includes(fail?'Disconnect denied':'disconnected from Ops')));
 }
});

test("disconnect client works with actual DELETE handler and clears only the selected tenant/platform",async()=>{
 for(const allowed of [false,true]){
  const filters={};let patch,auth;
  const q={update(value){patch=value;return q;},eq(key,value){filters[key]=value;return q;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};
  const api=load('app/api/social-accounts/route.ts',{'next/server':{NextResponse:{json:(body,options={})=>({ok:(options.status||200)<400,json:async()=>body})}},'../../../lib/supabaseAdmin':{supabaseAdmin:{from:()=>q}},'@/lib/tenantAuth':{requireOrganisation:async(org,write)=>{auth={org,write};if(!allowed)throw Error('denied');return {organisationId:org};},accessErrorResponse:()=>({ok:false,json:async()=>({error:'denied'})})}});
  const actions=load('lib/connectionActions.ts',{}, {AbortSignal,fetch:async(url,options)=>api.DELETE({nextUrl:new URL(url,'https://ops.example'),json:async()=>JSON.parse(options.body)})});
  if(allowed){await actions.disconnectConnection('instagram','tenant-a');assert.equal(filters.organisation_id,'tenant-a');assert.equal(filters.platform,'instagram');assert.equal(patch.is_active,false);assert.equal(patch.page_access_token,null);}
  else{await assert.rejects(actions.disconnectConnection('instagram','tenant-a'));assert.equal(patch,undefined);}
  assert.equal(auth.org,'tenant-a');assert.equal(auth.write,true);
 }
});
