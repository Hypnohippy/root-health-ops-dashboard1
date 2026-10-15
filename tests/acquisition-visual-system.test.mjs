import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import ts from "typescript";
const file="app/dashboard/growth/acquisition/page.tsx",current=fs.readFileSync(file,"utf8"),before=execFileSync("git",["show",`4d6a551:${file}`],{encoding:"utf8"}).replaceAll("\r\n","\n");
test("Acquisition state, fetches, filters and action handlers remain identical to frozen Founder HEAD",()=>{
 assert.equal(current.slice(current.indexOf("export default"),current.indexOf(" return <div")),before.slice(before.indexOf("export default"),before.indexOf(" return <div")));
 const callbacks=source=>{const f=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.getText(f)))out.push(n.initializer?.getText(f));ts.forEachChild(n,visit)}visit(f);return out};assert.deepEqual(callbacks(current),callbacks(before));
});
test("Acquisition visual scope reuses approved components without altering protected screens or child workflows",()=>{
 assert.match(current,/acquisition-workspace/);assert.match(current,/OpsIntelligenceCard/);assert.match(current,/aria-label="Acquisition briefing"/);
 const changes=execFileSync("git",["diff","4d6a551","--name-only","--","app/dashboard/growth/acquisition","tests/acquisition*.test.mjs"],{encoding:"utf8"}).trim().split("\n").filter(x=>x&&!x.startsWith("docs/"));assert.ok(changes.every(x=>[file,"tests/acquisition-presentation.test.mjs","tests/acquisition-actions.test.mjs","tests/acquisition-promotion.test.mjs","app/dashboard/growth/acquisition/acquisition.css","tests/acquisition-visual-system.test.mjs"].includes(x)));
 const css=fs.readFileSync("app/dashboard/growth/acquisition/acquisition.css","utf8");assert.match(css,/@media\(max-width:767px\)/);assert.match(css,/\.acquisition-workspace/);assert.doesNotMatch(current,/Momentum: High|£150k|92\/100/);
});
