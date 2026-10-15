import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import ts from "typescript";
for(const file of ["app/dashboard/publishing/page.tsx","app/dashboard/approvals/page.tsx","app/dashboard/scheduled/page.tsx","app/dashboard/stories/new/page.tsx"]){
 test(`${file}: existing channel, approval, schedule, asset and publish handlers unchanged`,()=>{
 const current=fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),base=execFileSync("git",["show",`26c019c:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n");
 const logic=s=>s.slice(s.indexOf("export default"),s.indexOf('    <div className="'+(s.includes('publishing-workspace')?'publishing-workspace ':'')+'min-h-screen'));
 assert.equal(logic(current),logic(base));
 const callbacks=s=>{const f=ts.createSourceFile("page.tsx",s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.getText(f)))out.push(n.initializer?.getText(f));ts.forEachChild(n,visit)}visit(f);return out};assert.deepEqual(callbacks(current),callbacks(base));
 });
}
test("Publishing distinguishes local draft evidence from unknown schedule and delivery without new data paths",()=>{
 const page=fs.readFileSync("app/dashboard/publishing/page.tsx","utf8");assert.match(page,/<strong>\{drafts.length\}<\/strong>/);assert.match(page,/Schedule totals are not loaded in this composer/);assert.match(page,/A draft or approval does not confirm delivery/);assert.match(page,/href="\/dashboard\/scheduled"/);assert.match(page,/href="\/dashboard\/approvals"/);
 const css=fs.readFileSync("app/dashboard/publishing/publishing.css","utf8");assert.match(css,/@media\(max-width:767px\)/);assert.match(css,/\.publishing-workspace/);
});
