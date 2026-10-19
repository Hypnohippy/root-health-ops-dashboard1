import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url);
export const ids = { org: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", other: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", request: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", foreign: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" };
export function load(file, mocks = {}, globals = {}, cache = new Map()) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} }; cache.set(absolute, mod);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, Request, Response, Headers, URL, URLSearchParams, Date, Buffer, File, console, setTimeout, clearTimeout, AbortController, process: { env: { OPENAI_API_KEY: "controlled-fixture", PROPOSAL_REQUEST_ORGANISATION_ID: ids.org } }, ...globals,
    require: name => name in mocks ? mocks[name] : name.endsWith(".css") ? {} : name.startsWith("@/") ? load(name.replace("@/", "") + (name.endsWith("route") ? ".ts" : ".ts"), mocks, globals, cache) : name.startsWith(".") ? load(path.resolve(path.dirname(file), name) + ".tsx", mocks, globals, cache) : require(name),
  }, { filename: file });
  return mod.exports;
}
export const migration = fs.readFileSync("supabase/migrations/20261019120000_solution_brief_foundation.sql", "utf8");
export async function fixture() {
  const sql = new PGlite();
  await sql.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table organisations(id uuid primary key, name text);
    create table organisation_members(organisation_id uuid, user_id uuid, role text);
    create table proposal_requests(id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), initiative text, workshop_title text, audience text, duration text, delivery_preference text, delivery_format text, location text, estimated_investment text, notes text, status text, source text, notify_email text, contact_name text, contact_email text, contact_phone text, wants_discussion boolean);
    create table resource_library(id uuid primary key default gen_random_uuid(), organisation_id uuid references organisations(id), sequence_id uuid, title text, resource_type text, content jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    create table sequences(id uuid, organisation_id uuid);
    insert into organisations values ('${ids.org}','Controlled Learning'),('${ids.other}','Other tenant');
    insert into organisation_members values ('${ids.org}','${ids.user}','owner');
    insert into proposal_requests(id,workshop_title,audience,duration,delivery_format,notes,status,estimated_investment,contact_name) values ('${ids.request}','Burnout workshop','Nursing-home managers','45 minutes','In person','Help managers recognise workload pressure and discuss practical prevention.','pending','Budget to confirm','Controlled HR requester');
    insert into proposal_requests(id,workshop_title) values ('${ids.foreign}','PRIVATE OTHER TENANT');
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;`);
  const original = (await sql.query("select to_jsonb(p) as row from proposal_requests p order by id")).rows.map(r => r.row);
  await sql.exec(migration);
  // Explicit fixture assignment is not a production ownership/backfill policy.
  await sql.query("update proposal_requests set organisation_id = $1 where id = $2", [ids.org, ids.request]);
  await sql.query("update proposal_requests set organisation_id = $1 where id = $2", [ids.other, ids.foreign]);
  const calls = [], generation = [];
  let currentUser = ids.user, failAI = false, pauseAI = null;
  const db = {
    from(table) {
      const filters = [], params = []; let operation = "select", payload = null, returning = "*", ordering = "", limit = "";
      const ident = x => { if (!/^[a-z_]+$/.test(x)) throw Error("Invalid SQL identifier"); return `"${x}"`; };
      const execute = async () => {
        calls.push({ table, operation, filters: [...filters] });
        const values = [...params]; let query;
        const where = filters.length ? " where " + filters.join(" and ") : "";
        if (operation === "insert") {
          const keys = Object.keys(payload); const slots = keys.map(k => { values.push(typeof payload[k] === "object" && payload[k] !== null ? JSON.stringify(payload[k]) : payload[k]); return `$${values.length}`; });
          query = `insert into ${ident(table)} (${keys.map(ident)}) values (${slots}) returning ${returning}`;
        } else if (operation === "update") {
          const sets = Object.keys(payload).map(k => { values.push(typeof payload[k] === "object" && payload[k] !== null ? JSON.stringify(payload[k]) : payload[k]); return `${ident(k)}=$${values.length}`; });
          query = `update ${ident(table)} set ${sets.join(",")}${where} returning ${returning}`;
        } else if (operation === "delete") query = `delete from ${ident(table)}${where} returning ${returning}`;
        else query = `select ${returning} from ${ident(table)}${where}${ordering}${limit}`;
        try { return { data: (await sql.query(query, values)).rows, error: null }; }
        catch (error) { return { data: null, error }; }
      };
      const q = { select(columns = "*") { returning = columns; return q; }, eq(k,v) { params.push(v); filters.push(`${ident(k)}=$${params.length}`); return q; }, is(k,v) { if (v !== null) throw Error("Fixture only supports IS NULL"); filters.push(`${ident(k)} is null`); return q; }, order(k,{ascending}) { ordering = ` order by ${ident(k)} ${ascending ? "asc" : "desc"}`; return q; }, limit(n) { limit=` limit ${Number(n)}`;return q; }, insert(v) { operation="insert";payload=v;return q; }, update(v) { operation="update";payload=v;return q; }, delete() { operation="delete";return q; }, async maybeSingle() { const r=await execute();return {...r,data:r.data?.[0]||null}; }, async single() { return q.maybeSingle(); }, then(resolve,reject) { return execute().then(resolve,reject); } }; return q;
    },
    async rpc(name, args) {
      calls.push({ rpc: name });
      const jsonKeys = new Set(["p_recommendation", "p_content"]);
      const values = Object.entries(args).map(([key,v]) => jsonKeys.has(key) ? JSON.stringify(v) : v);
      const placeholders = Object.keys(args).map((key,i) => `${key} => $${i+1}${jsonKeys.has(key) ? "::jsonb" : ""}`);
      try {
        const r=await sql.query(`select to_jsonb(public.${name}(${placeholders.join(",")})) as result`,values);
        return { data:r.rows[0].result,error:null };
      } catch(error) { return {data:null,error}; }
    },
  };
  class NextRequest extends Request { constructor(...args) { super(...args);this.nextUrl=new URL(this.url); } }
  const next = { NextRequest, NextResponse: { json: (body,options) => Response.json(body,options) } };
  class OpenAI { responses = { create: async payload => {
    generation.push(payload); if (pauseAI) await pauseAI;
    if (failAI) throw Error("Controlled provider failure");
    return { output_text:JSON.stringify({ title:"Practical workload prevention",objective:"Recognise pressure and choose supportive actions",audience_takeaway:"A practical first step",slides:Array.from({length:8},(_,i)=>({slide_title:["Practical prevention","Understand the need","A useful framework","Review evidence","Apply the framework","Try it together","Reflect","Take it forward"][i],slide_goal:"PRIVATE GOAL",bullets:["Recognise workload pressure","Choose a practical supportive action"],speaker_notes:"PRIVATE PRESENTER SCRIPT\nFacilitation: pause for discussion\nTransition: introduce the next idea\nTiming: review before delivery",audience_prompt:i===5?"Reflect on one change you could try.":"",visual_direction:"PRIVATE ART DIRECTION",image_prompt:"PRIVATE IMAGE PROMPT"})) }) };
  } }; }
  const cache = new Map();
  const mocks = { "next/server":next, "@/lib/supabaseAdmin":{supabaseAdmin:db}, "@supabase/supabase-js":{createClient:()=>db}, "@/lib/supabaseServer":{getCurrentUserId:async()=>currentUser}, "@/lib/organisationProfile.server":{getOrganisationGenerationProfile:async()=>null}, "@/lib/tenantGeneration":{generationMessages:()=>[]}, openai:OpenAI, "@/lib/usage":{ getCurrentOrganisationPlan:async()=>"team",getMonthlyUsageForOrganisation:async()=>0,getPlanLimit:()=>150,logUsageForOrganisation:async()=>{} } };
  const route = file => load(file,mocks,{},cache);
  const req = (body, method="POST", url="/api/solution-briefs") => new NextRequest(`http://localhost${url}`, {method,...(method==="GET" ? {} : {headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
  return { sql,original,db,calls,generation,route,req, user:v=>currentUser=v, failAI:v=>failAI=v, pauseAI:v=>pauseAI=v, close:()=>sql.close() };
}
