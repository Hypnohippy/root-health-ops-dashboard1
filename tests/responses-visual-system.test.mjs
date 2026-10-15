import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import ts from "typescript";
const file="app/dashboard/responses/page.tsx",current=fs.readFileSync(file,"utf8").replaceAll("\r\n","\n"),baseline=execFileSync("git",["show",`dc58d24:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n");
test("Responses visual rollout leaves thread state, drafting, fetches and every action callback unchanged",()=>{
 const beforeReturn=s=>s.slice(s.indexOf("export default"),s.indexOf('    <div className="'+(s.includes('responses-workspace')?'responses-workspace ':'')+'min-h-screen'));
 assert.equal(beforeReturn(current),beforeReturn(baseline));
 const callbacks=s=>{const f=ts.createSourceFile("page.tsx",s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.getText(f)))out.push(n.initializer?.getText(f));ts.forEachChild(n,visit)}visit(f);return out};assert.deepEqual(callbacks(current),callbacks(baseline));
});
test("Response intelligence shows existing recorded counts and preserves attention contrast",()=>{
 assert.match(current,/aria-label="Response state briefing"/);assert.match(current,/<strong>\{counts.needs_reply\}<\/strong>/);assert.match(current,/<strong>\{counts.replied\}<\/strong>/);assert.doesNotMatch(current,/Momentum: High|£150k|92\/100/);
 const css=fs.readFileSync("app/dashboard/responses/responses.css","utf8");assert.match(css,/@media\(max-width:767px\)/);assert.match(css,/\[class~="bg-red-500"\]\{background:#dc2647;color:#fff\}/);
});
