import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { execFileSync } from "node:child_process";
const shell=fs.readFileSync("app/dashboard/ClientDashboardLayout.tsx","utf8"),component=fs.readFileSync("app/dashboard/components/RootCoach.tsx","utf8"),css=fs.readFileSync("app/dashboard/components/root-coach.css","utf8");
test("one shell mount receives only existing workspace and permission state",()=>{
 assert.equal((shell.match(/<RootCoach\s/g)||[]).length,1);assert.match(shell,/pathname=\{pathname\} organisationId=\{orgId\} founderAllowed=\{founderAccess\}/);
 assert.match(component,/className="root-coach-launcher" disabled=\{!organisationId\}/);
 assert.doesNotMatch(component,/setInterval|document\.body\.innerHTML|supabase|localStorage|window\.location|router\.push/);
});
test("drawer is modal, labelled, keyboard-dismissable and restores focus",()=>{
 assert.match(component,/<dialog /);assert.match(component,/aria-labelledby="root-coach-title"/);assert.match(component,/aria-describedby="root-coach-boundary"/);assert.match(component,/\.showModal\(\)/);assert.match(component,/onCancel=\{close\}/);assert.match(component,/launcher\.current\?\.focus\(\)/);assert.match(component,/aria-label="Close Ask Root"/);
});
test("drawer revalidates links, requires explicit clicks and bounds question input",()=>{
 assert.match(component,/guideAnswerDestination\(destination/);assert.match(component,/href=\{safe.href\}/);assert.match(component,/maxLength=\{600\}/);assert.match(component,/mode: "guidance"/);assert.match(component,/role="status"/);assert.match(component,/role="alert"/);assert.match(component,/AbortController/);
 const urls=[...component.matchAll(/fetch\("([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(urls,["/api/coach"]);assert.doesNotMatch(component,/dangerouslySetInnerHTML/);
});
test("drawer uses bounded viewport and its own scrolling surface on mobile",()=>{
 assert.match(css,/100dvh/);assert.match(css,/overflow-y:auto/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/@media\(max-width:767px\)/);assert.match(css,/\.root-coach-launcher\{top:8px;right:54px;bottom:auto/);assert.match(css,/safe-area-inset-bottom/);
});
test("shell behaviour and all page-specific helpers remain unchanged",()=>{
 const base=execFileSync("git",["show","1aee8d03a5cdcb0c9a0042d9342c2779a0949dc4:app/dashboard/ClientDashboardLayout.tsx"],{encoding:"utf8"});
 const callbacks=s=>{const file=ts.createSourceFile("shell.tsx",s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[];const visit=n=>{if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.getText(file)))out.push(n.initializer.getText(file));ts.forEachChild(n,visit)};visit(file);return out};assert.deepEqual(callbacks(shell),callbacks(base));
 for(const f of ["app/dashboard/page.tsx","app/dashboard/sequences/page.tsx","app/dashboard/growth/page.tsx","app/dashboard/resources/page.tsx","app/dashboard/connect/page.tsx","app/dashboard/growth/acquisition/page.tsx","app/dashboard/responses/page.tsx","app/org-setup/page.tsx","app/connect/page.tsx"]){assert.equal(fs.readFileSync(f,"utf8").replaceAll("\r\n","\n"),execFileSync("git",["show",`1aee8d03a5cdcb0c9a0042d9342c2779a0949dc4:${f}`],{encoding:"utf8"}).replaceAll("\r\n","\n"),f);}
});
