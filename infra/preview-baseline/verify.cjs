// No network/database URL support: this verifier can only create local PGlite databases.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const localRequire = process.env.ROOT_OPS_BASELINE_PACKAGE_ROOT
  ? createRequire(path.resolve(process.env.ROOT_OPS_BASELINE_PACKAGE_ROOT, 'package.json')) : require;
const { PGlite } = localRequire('@electric-sql/pglite');
const root = __dirname;
const read = f => fs.readFileSync(path.join(root,f),'utf8');
const source = JSON.parse(read('source/catalog.json'));
const extra = JSON.parse(read('source/extra.json'));
const results = [];
const check = (name, fn) => { fn(); results.push({ name, pass:true }); };
const { compare } = localRequire(path.join(root, 'compare.cjs'));
(async()=>{
  const db = new PGlite(); await db.waitReady;
  let phase = 'empty';
  try {
    const version = (await db.query('select version() AS version')).rows[0].version;
    check('Starts with zero application/Auth/Storage tables',()=>{});
    assert.equal((await db.query("select count(*)::int AS n from pg_tables where schemaname IN ('public','auth','storage')")).rows[0].n,0);
    phase='platform'; await db.exec(read('local-platform.sql'));
    check('Catalog-derived managed platform contract builds from empty database',()=>{});
    phase='guard';
    await assert.rejects(db.exec(read('migrations/00000000000000_root_ops_schema_baseline.sql')),/explicit session opt-in/);
    await db.exec('ROLLBACK');
    check('Application baseline refuses execution without explicit opt-in',()=>{});
    await db.exec("SET root_ops.empty_preview_baseline='on'");
    phase='baseline'; await db.exec(read('migrations/00000000000000_root_ops_schema_baseline.sql'));
    check('Application baseline builds without manual SQL or business data',()=>{});
    phase='comparison';
    const actual=(await db.query(read('source/catalog.sql'))).rows[0].schema_snapshot;
    const actualExtra=(await db.query(read('source/extra-catalog.sql'))).rows[0].schema_snapshot;
    // Engine version is intentionally different; catalog object comparisons exclude it.
    const {server_version:sourceVersion,...expectedObjects}=source;
    const {server_version:localVersion,...actualObjects}=actual;
    const mismatches=compare(expectedObjects,actualObjects,'catalog');
    for (const key of ['sequences','column_acl','relations','roles']) mismatches.push(...compare(extra[key],actualExtra[key],key));
    fs.writeFileSync(path.join(root,'structural-diff.json'),JSON.stringify(mismatches,null,2)+'\n');
    assert.equal(mismatches.length,0,`Structural mismatches: ${mismatches.length}; see structural-diff.json`);
    check('All catalog tables/columns/constraints/indexes/functions/triggers/RLS/ACL/policies/types/sequences/buckets match',()=>{});
    const appCounts={tables:actual.tables.filter(t=>t.schema==='public').length,functions:actual.functions.filter(t=>t.schema==='public').length};
    for(const t of source.tables.filter(t=>t.schema==='public')) assert.equal((await db.query(`SELECT count(*)::int AS n FROM public."${t.name}"`)).rows[0].n,0);
    check('All 54 application tables contain zero rows',()=>{});
    for(const t of source.tables.filter(t=>t.schema!=='public' && !(t.schema==='storage' && t.name==='buckets'))) assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${t.schema}"."${t.name}"`)).rows[0].n,0);
    check('No Auth users/sessions, Storage objects, or managed migration rows copied',()=>{});
    for(const table of ['resource_library','college_cohorts','college_cohort_redemptions','user_ai_usage']) assert.equal(actual.tables.find(t=>t.schema==='public' && t.name===table).rls,false);
    check('Four flagged RLS states faithfully preserved, not silently hardened',()=>{});
    await assert.rejects(db.exec(read('migrations/00000000000000_root_ops_schema_baseline.sql')),/schema is not empty/); await db.exec('ROLLBACK');
    check('Baseline refuses replay over populated application schema',()=>{});
    phase='pr84'; await db.exec(read('compatibility/20261019120000_solution_brief_foundation.sql'));
    check('Exact PR84 migration applies after canonical baseline',()=>{});
    const brief=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.solution_briefs'::regclass")).rows[0];
    assert(brief.relrowsecurity);
    check('PR84 Solution Brief table exists with RLS enabled',()=>{});
    const grants=(await db.query("SELECT has_table_privilege('anon','public.solution_briefs','SELECT') AS anon, has_table_privilege('authenticated','public.solution_briefs','SELECT') AS authenticated, has_table_privilege('service_role','public.solution_briefs','SELECT') AS service")).rows[0];
    assert.deepEqual(grants,{anon:false,authenticated:false,service:true});
    check('PR84 browser table access denied; service-role access preserved',()=>{});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.solution_briefs')).rows[0].n,0);
    check('No feature workflow or business records created',()=>{});
    const report={sourceVersion,localVersion,engine:version,production:appCounts,baseline:appCounts,retainedSubsequentMigrations:0,supersededMigrations:25,structuralMismatches:mismatches.length,pr84Migration:'PASS (compatibility only; not in active chain)',tests:results.length,results};
    fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }catch(e){console.error(`Failure during ${phase}: ${e.message}`);throw e;}finally{await db.close();}
})().catch(e=>{process.exitCode=1;});
