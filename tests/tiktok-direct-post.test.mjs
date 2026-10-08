import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
function load(path,deps={},globals={}) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:id=>{assert.ok(id in deps,id);return deps[id];},URL,URLSearchParams,AbortSignal,Uint8Array,DataView,Error,...globals});return module.exports;
}
const model=load("lib/tiktokPosting.ts"),duration=load("lib/videoDuration.ts");
const org="tenant-a",url=`https://storage.example/storage/v1/object/public/public-media/uploads/org_${org}/video.mp4`;
function mp4(seconds=5) {const bytes=new Uint8Array(36),v=new DataView(bytes.buffer);v.setUint32(0,36);bytes.set(Buffer.from("moov"),4);v.setUint32(8,28);bytes.set(Buffer.from("mvhd"),12);v.setUint32(28,1000);v.setUint32(32,seconds*1000);return bytes;}
const creator={creator_username:"fixture",creator_nickname:"Fixture creator",privacy_level_options:["SELF_ONLY"],comment_disabled:false,duet_disabled:true,stitch_disabled:true,max_video_post_duration_sec:60};
const settings={mode:"direct",privacyLevel:"SELF_ONLY",allowComment:true,allowDuet:true,allowStitch:true,caption:"Current edited caption",brandOrganic:false,consent:true};
function fixture({scope="user.info.basic,video.publish,video.upload",status="PROCESSING_UPLOAD",seconds=5,maximum=60,rotate=true,expired=false,failInit=false,networkInit=false,tokenReject=false}={}) {
 const account={id:"account",organisation_id:org,platform:"tiktok",is_active:true,page_id:"creator-id",page_access_token:"SECRET_ACCESS",token_expires_at:expired?"2000-01-01":null,meta:{refresh_token:"SECRET_REFRESH",scopes:scope.split(","),unrelated:"keep"}};
 const post={id:"post",organisation_id:org,message:"Ops caption",platforms:["tiktok"],meta:{video_url:url}};
 const calls=[],writes=[];let currentStatus=status,firstReject=tokenReject;
 const db={from:table=>{
  const filters=[];let patch,insert;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},limit(){return q;},update(value){patch=value;return q;},insert(value){insert=value;return q;},
   async maybeSingle(){const row=table==="social_accounts"?account:post;const matches=filters.every(([k,v])=>k==="meta"?JSON.stringify(row.meta)===v || row.meta===v:row[k]===v);if(!matches)return {data:null};if(patch){writes.push({table,patch,filters});Object.assign(row,structuredClone(patch));}return {data:structuredClone(row),error:null};},single(){return q.maybeSingle();},then(resolve,reject){return q.maybeSingle().then(resolve,reject);}};return q;
 }};
 const fetch=async(raw,init={})=>{
  const target=String(raw),body=typeof init.body==="string"?JSON.parse(init.body):init.body;
  calls.push({target,body,headers:init.headers,method:init.method});
  if(target.includes("oauth/token"))return new Response(JSON.stringify({access_token:"ROTATED_ACCESS",...(rotate?{refresh_token:"ROTATED_REFRESH"}:{}),expires_in:3600,scope}));
  if(target===url)return new Response(mp4(seconds),{headers:{"content-type":"video/mp4"}});
  if(target.includes("open-upload"))return new Response(null,{status:201});
  if(firstReject){firstReject=false;return new Response(JSON.stringify({error:{code:"access_token_invalid"}}),{status:401});}
  let data;
  if(target.includes("creator_info")) data={...creator,max_video_post_duration_sec:maximum};
  else if(target.includes("/video/init/")) {
   if(networkInit)throw Error("secret-token-must-not-leak");
   if(failInit)return new Response(JSON.stringify({error:{code:"unaudited_client_can_only_post_to_private_accounts",message:"SECRET_ACCESS"}}),{status:403});
   data={publish_id:"publish-fixture",upload_url:"https://open-upload.tiktokapis.com/video/?upload_token=UPLOAD_SECRET"};
  } else {assert.match(target,/status\/fetch/);data={status:currentStatus,fail_reason:"video_rejected",publicaly_available_post_id:currentStatus==="PUBLISH_COMPLETE"?["post-123"]:[]};}
  return new Response(JSON.stringify({data,error:{code:"ok"}}));
 };
 const service=load("lib/tiktokPosting.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db},"@/lib/tiktokPosting":model,"@/lib/videoDuration":duration,"node:crypto":{randomUUID}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:"https://storage.example",TIKTOK_CLIENT_KEY:"client",TIKTOK_CLIENT_SECRET:"secret"}},fetch});
 return {service,account,post,calls,writes,db,fetch,setStatus:value=>{currentStatus=value;}};
}
test("creator info uses current account and returns only safe required fields",async()=>{
 const f=fixture(),result=await f.service.getTikTokCreator(org);assert.equal(result.creator.creator_nickname,"Fixture creator");assert.deepEqual([...result.creator.privacy_level_options],["SELF_ONLY"]);assert.equal(result.videoPublishVerified,true);assert.doesNotMatch(JSON.stringify(result),/SECRET|token/);assert.match(f.calls[0].target,/creator_info\/query\/$/);
});
test("known token missing video.publish requires reconnect without provider init",async()=>{
 const f=fixture({scope:"user.info.basic,video.upload"});await assert.rejects(f.service.getTikTokCreator(org),e=>e.reconnectRequired && /video.publish/.test(e.message));assert.equal(f.calls.length,0);
});
test("legacy unknown scopes are verified against creator endpoint, never inferred from requested scope",async()=>{
 const f=fixture();delete f.account.meta.scopes;const result=await f.service.getTikTokCreator(org);assert.equal(result.scopes,null);assert.equal(result.videoPublishVerified,true);
});
test("privacy must match current creator options; disabled interactions override request",()=>{
 const info=model.tikTokPostInfo(settings,creator);assert.equal(info.privacy_level,"SELF_ONLY");assert.equal(info.disable_comment,false);assert.equal(info.disable_duet,true);assert.equal(info.disable_stitch,true);assert.equal("is_aigc" in info,false);assert.throws(()=>model.tikTokPostInfo({...settings,privacyLevel:"PUBLIC_TO_EVERYONE"},creator),/privacy option/);assert.equal(model.tikTokPostInfo({...settings,isAigc:true},creator).is_aigc,true);
});
test("Direct Post uses direct init, private title/settings, Content-Range; repeat only fetches status",async()=>{
 const f=fixture(),r=await f.service.publishTikTokPost(org,"post",settings);
 assert.equal(r.pending,true);assert.equal(r.published,false);assert.equal(r.manualCompletionRequired,false);assert.equal(r.publishId,"publish-fixture");assert.doesNotMatch(JSON.stringify(r),/SECRET|upload_token|inbox/);
 const init=f.calls.find(c=>c.target.endsWith("/video/init/"));assert.match(init.target,/\/publish\/video\/init\/$/);assert.doesNotMatch(init.target,/inbox/);assert.equal(init.body.post_info.title,settings.caption);assert.equal(init.body.post_info.privacy_level,"SELF_ONLY");assert.equal(init.body.post_info.disable_duet,true);
 const put=f.calls.find(c=>c.method==="PUT");assert.equal(put.headers["Content-Range"],"bytes 0-35/36");assert.equal(put.headers["Content-Length"],"36");
 assert.equal(f.post.meta.tiktok_post.uploadAccepted,true);await f.service.publishTikTokPost(org,"post",settings);assert.equal(f.calls.filter(c=>c.method==="PUT").length,1);assert.equal(f.calls.filter(c=>c.target.endsWith("/video/init/")).length,1);
});
test("concurrent calls cannot both initialize or upload",async()=>{
 const f=fixture();await Promise.allSettled([f.service.publishTikTokPost(org,"post",settings),f.service.publishTikTokPost(org,"post",settings)]);assert.equal(f.calls.filter(c=>c.target.endsWith("/video/init/")).length,1);assert.equal(f.calls.filter(c=>c.method==="PUT").length,1);
});
test("duration over creator maximum fails BEFORE init/upload",async()=>{
 const f=fixture({seconds:61});await assert.rejects(f.service.publishTikTokPost(org,"post",settings),/61 seconds.*60 seconds/);assert.ok(!f.calls.some(c=>c.target.endsWith("/video/init/")||c.method==="PUT"));assert.equal(f.post.meta.tiktok_post,undefined);
});
test("complete stores actual public post IDs; FAILED is truthful and never manual completion",async()=>{
 for(const status of ["PUBLISH_COMPLETE","FAILED"]){const f=fixture({status}),r=await f.service.publishTikTokPost(org,"post",settings);assert.equal(r.published,status==="PUBLISH_COMPLETE");assert.equal(r.ok,status!=="FAILED");assert.equal(r.manualCompletionRequired,false);assert.equal(r.postId,status==="PUBLISH_COMPLETE"?"post-123":null);assert.equal(f.post.meta.tiktok_post.providerStatus,status);}
});
test("later status refresh updates the same receipt without upload",async()=>{
 const f=fixture();await f.service.publishTikTokPost(org,"post",settings);f.setStatus("PUBLISH_COMPLETE");const r=await f.service.refreshTikTokPost(org,"post","publish-fixture");assert.equal(r.published,true);assert.equal(r.postId,"post-123");assert.equal(f.calls.filter(c=>c.method==="PUT").length,1);await assert.rejects(f.service.refreshTikTokPost(org,"post","foreign-publish"),/does not belong/);
});
test("refresh preserves metadata and refresh token; rotation is saved",async()=>{
 for(const rotate of [false,true]){const f=fixture({expired:true,rotate});await f.service.getTikTokCreator(org);assert.equal(f.account.page_access_token,"ROTATED_ACCESS");assert.equal(f.account.meta.refresh_token,rotate?"ROTATED_REFRESH":"SECRET_REFRESH");assert.equal(f.account.meta.unrelated,"keep");assert.ok(Date.parse(f.account.token_expires_at)>Date.now());assert.equal(f.writes[0].filters.some(([k,v])=>k==="organisation_id"&&v===org),true);}
});
test("invalid token refreshes once, definitive rejection permits retry; no raw token in result",async()=>{
 const f=fixture({tokenReject:true});const r=await f.service.getTikTokCreator(org);assert.equal(r.videoPublishVerified,true);assert.equal(f.calls.filter(c=>c.target.includes("oauth/token")).length,1);assert.doesNotMatch(JSON.stringify(r),/SECRET|ROTATED/);
});
test("tenant isolation rejects foreign post/account before upload",async()=>{
 const f=fixture();await assert.rejects(f.service.publishTikTokPost("foreign","post",settings),/Post not found/);assert.equal(f.calls.length,0);
});
test("explicit draft fallback uses inbox only and preserves manual completion",async()=>{
 const f=fixture({scope:"video.upload",status:"SEND_TO_USER_INBOX"});const r=await f.service.publishTikTokPost(org,"post",{...settings,mode:"draft"});assert.equal(r.manualCompletionRequired,true);assert.match(r.userMessage,/inbox/);assert.ok(f.calls.some(c=>c.target.endsWith("/inbox/video/init/")));assert.ok(!f.calls.some(c=>c.target.includes("creator_info")));assert.equal(f.calls.find(c=>c.target.endsWith("/video/init/")).body.post_info,undefined);
 const other=fixture();await assert.rejects(other.service.publishTikTokPost(org,"post"),/explicitly choose/);assert.equal(other.calls.length,0);
});
test("provider audit error never falls back; ambiguous init never reinitializes",async()=>{
 const f=fixture({failInit:true});await assert.rejects(f.service.publishTikTokPost(org,"post",settings),/private account.*Only me/);assert.ok(!f.calls.some(c=>c.target.includes("inbox")));
 const uncertain=fixture({networkInit:true});await assert.rejects(uncertain.service.publishTikTokPost(org,"post",settings));const r=await uncertain.service.publishTikTokPost(org,"post",settings);assert.equal(r.pending,true);assert.equal(uncertain.calls.filter(c=>c.target.endsWith("/video/init/")).length,1);
});
test("video sources must be tenant-owned storage and cannot redirect to arbitrary hosts",async()=>{
 const f=fixture();f.post.meta.video_url="https://127.0.0.1/video.mp4";await assert.rejects(f.service.publishTikTokPost(org,"post",settings),/Upload the video through Ops/);assert.ok(!f.calls.some(c=>c.target.includes("127.0.0.1")));
});
test("MP4 duration comes from bytes, malformed or unknown metadata fails closed",()=>{
 assert.equal(duration.videoDurationSeconds(mp4(61)),61);assert.throws(()=>duration.videoDurationSeconds(new Uint8Array(8)),/Cannot verify/);
});

test("publish/now reports Direct Post completion/pending/failure truthfully and retains durable receipt",async()=>{
 for(const status of ["PUBLISH_COMPLETE","PROCESSING_UPLOAD","FAILED"]){
  const f=fixture({status});
  const route=load("app/api/publish/now/route.ts",{"next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},"../../../../lib/supabaseAdmin":{supabaseAdmin:f.db},"@/lib/tenantAuth":{requirePublishingOrganisation:async()=>({organisationId:org}),publishingHeaders:()=>({}),accessErrorResponse:()=>null}},{process:{env:{NEXT_PUBLIC_APP_URL:"https://production.invalid"}},fetch:async(target,init)=>{
   assert.match(target,/^https:\/\/preview.example\/api\/tiktok\/post$/);const body=JSON.parse(init.body);assert.equal(body.postId,"post");return new Response(JSON.stringify(await f.service.publishTikTokPost(body.organisationId,body.postId,body.settings)));
  }});
  const result=await route.POST({url:`https://preview.example/api/publish/now?organisationId=${org}`,nextUrl:new URL("https://preview.example"),json:async()=>({id:"post",platforms:["tiktok"],tiktok:settings})});
  assert.equal(result.body.results[0].published,status==="PUBLISH_COMPLETE");assert.equal(result.body.results[0].manualCompletionRequired,false);assert.equal(result.body.pending,status==="PROCESSING_UPLOAD");assert.equal(f.post.status,status==="PUBLISH_COMPLETE"?"posted":status==="FAILED"?"failed":"pending");assert.equal(f.post.meta.tiktok_post.publishId,"publish-fixture");assert.doesNotMatch(JSON.stringify(result),/SECRET|finish.*inbox/);
 }
});
test("creator/post/status routes deny cross-tenant access before any service call",async()=>{
 for(const path of ["creator-info","post","status"]){let calls=0;const route=load(`app/api/tiktok/${path}/route.ts`,{"next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},"@/lib/tenantAuth":{requireOrganisation:async()=>{throw Error("denied");},requirePublishingOrganisation:async()=>{throw Error("denied");},accessErrorResponse:error=>error.message==="denied"?{status:403}:null},"@/lib/supabaseAdmin":{supabaseAdmin:{}},"@/lib/tiktokPosting.server":{TikTokError:Error,getTikTokCreator:()=>calls++,publishTikTokPost:()=>calls++,refreshTikTokPost:()=>calls++}});
 const req={nextUrl:new URL("https://ops.example?organisationId=foreign"),json:async()=>({organisationId:"foreign",postId:"post",settings})};assert.equal((await (path==="creator-info"?route.GET(req):route.POST(req))).status,403);assert.equal(calls,0);
 }
});
