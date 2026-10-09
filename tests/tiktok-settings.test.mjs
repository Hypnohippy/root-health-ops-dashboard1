import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import {renderToStaticMarkup} from "react-dom/server";
function render(options){
 const creator={creator_username:"fixture",creator_nickname:"Real Creator",privacy_level_options:options,comment_disabled:true,duet_disabled:true,stitch_disabled:false,max_video_post_duration_sec:60};
 const values=["tenant-a","",creator,["video.publish"],false,"",{mode:"direct",privacyLevel:"",allowComment:false,allowDuet:false,allowStitch:false,caption:"Current caption",brandOrganic:false,brandContent:false,consent:false},"","",null,0];let index=0;
 const module={exports:{}};const deps={react:{useState:()=>[values[index++],()=>{}],useEffect:()=>{},useCallback:fn=>fn},"react/jsx-runtime":jsx,"@/app/dashboard/components/MediaDropzone":{default:()=>null}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/dashboard/publishing/tiktok/AuditComposer.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>deps[id]});return renderToStaticMarkup(module.exports.default());
}
test("private-only creator renders only actual privacy values; public never appears as an invented option",()=>{
 const html=render(["SELF_ONLY"]);assert.match(html,/Only me is available/);assert.match(html,/value="SELF_ONLY"/);assert.doesNotMatch(html,/value="PUBLIC_TO_EVERYONE"/);assert.match(html,/Select privacy/);assert.match(html,/Comments.*disabled by TikTok account settings/);assert.match(html,/Duet.*disabled by TikTok account settings/);assert.match(html,/Current caption/);
});
test("public is selectable only when creator returns it; interactions start off and provider restrictions are shown",()=>{
 const html=render(["SELF_ONLY","PUBLIC_TO_EVERYONE"]);assert.match(html,/value="PUBLIC_TO_EVERYONE"/);assert.doesNotMatch(html,/checked=""/);assert.match(html,/unaudited clients/);assert.match(html,/Music Usage Confirmation/);assert.match(html,/Upload draft to TikTok/);
});
