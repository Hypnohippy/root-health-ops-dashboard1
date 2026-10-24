// Managed defaults are platform prerequisites, not permission to impersonate a
// managed role. Every mutation below is confined to a synthetic local database.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const baseline = read('migrations/00000000000000_root_ops_schema_baseline.sql');
const platform = read('local-platform.sql');
const catalog = JSON.parse(read('source/catalog.json'));
const blocks = [...baseline.matchAll(/DO \$managed_default_acl\$[\s\S]*?END \$managed_default_acl\$;/g)].map(x => x[0]);
const managedSetup = platform.split('\n').filter(line => line.startsWith('ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public"')).join('\n');
const reader = 'root_ops_default_acl_reader';
let db;
before(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(platform);
  await db.exec("SET root_ops.empty_preview_baseline='on'");
  await db.exec(baseline);
  await db.exec(`CREATE ROLE ${reader} NOLOGIN NOSUPERUSER NOBYPASSRLS;`);
});
after(async () => { await db?.close(); });
async function asReader(sql) {
  await db.exec(`SET ROLE ${reader}`);
  try { return await db.exec(sql); } finally { await db.exec('RESET ROLE'); }
}
test('exact original managed default statement requires unavailable role authority', async () => {
  assert.equal((await db.query(`SELECT pg_has_role('${reader}','supabase_admin','MEMBER') AS member`)).rows[0].member, false);
  await assert.rejects(asReader('ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC'), e => e.code === '42501' && /permission denied to change default privileges|must be member/.test(e.message));
});
test('all exact managed-default assertions succeed under a non-owner with no writes', async () => {
  assert.equal(blocks.length, 3);
  assert.doesNotMatch(baseline, /ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/);
  assert.match(baseline, /ALTER DEFAULT PRIVILEGES FOR ROLE "postgres"/);
  const before = (await db.query('SELECT * FROM pg_default_acl ORDER BY oid')).rows;
  await asReader(blocks.join('\n'));
  assert.deepEqual((await db.query('SELECT * FROM pg_default_acl ORDER BY oid')).rows, before);
});
test('missing required managed default grant fails closed', async () => {
  await db.exec('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE USAGE ON SEQUENCES FROM anon');
  try { await assert.rejects(asReader(blocks[0]), /differs from the captured contract/); }
  finally { await db.exec(managedSetup); }
});
test('extra PUBLIC access is rejected rather than broadening the captured schema contract', async () => {
  await db.exec('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC');
  try { await assert.rejects(asReader(blocks.join('\n')), /differs from the captured contract/); }
  finally { await db.exec(managedSetup); }
});
test('unexpected browser grant option fails closed', async () => {
  await db.exec('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon WITH GRANT OPTION');
  try { await assert.rejects(asReader(blocks[0]), /differs from the captured contract/); }
  finally { await db.exec(managedSetup); }
});
test('schema defaults cannot hide a broadened global default ACL', async () => {
  await db.exec('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin GRANT SELECT ON TABLES TO PUBLIC');
  try { await assert.rejects(asReader(blocks.join('\n')), /Managed global default ACL r differs/); }
  finally { await db.exec('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE SELECT ON TABLES FROM PUBLIC'); }
  await asReader(blocks.join('\n'));
});
test('existing application ACLs, RLS and function execution contracts remain captured equivalents', async () => {
  const actual = (await db.query(read('source/catalog.sql'))).rows[0].schema_snapshot;
  for (const t of catalog.tables.filter(t => t.schema === 'public')) {
    const restored = actual.tables.find(x => x.schema === t.schema && x.name === t.name);
    assert.deepEqual(restored.acl, t.acl, t.name);
    assert.equal(restored.rls, t.rls, t.name);
    assert.equal(restored.force_rls, t.force_rls, t.name);
  }
  for (const f of catalog.functions.filter(f => f.schema === 'public')) {
    assert.deepEqual(actual.functions.find(x => x.schema === f.schema && x.name === f.name && x.signature === f.signature).acl, f.acl, f.name);
  }
});
test('future tables, functions and sequences keep creator-specific effective default grants', async () => {
  // The local platform intentionally has no managed superuser. Permit only
  // synthetic object creation here to model Supabase's platform creator role.
  await db.exec('GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin');
  try {
  for (const owner of ['postgres', 'supabase_admin']) {
    await db.exec(`SET ROLE ${owner}`);
    try { await db.exec(`CREATE TABLE public.synthetic_future_${owner}(id int);
      CREATE SEQUENCE public.synthetic_seq_${owner};
      CREATE FUNCTION public.synthetic_fn_${owner}() RETURNS int LANGUAGE sql AS 'SELECT 1';`);
    } finally { await db.exec('RESET ROLE'); }
    for (const d of catalog.defaults.filter(d => d.schema === 'public' && d.owner === owner)) {
      const kind = { r: 'future', S: 'seq', f: 'fn' }[d.type];
      const expected = (await db.query(`SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
        x.privilege_type AS privilege,x.is_grantable AS grantable FROM aclexplode(acldefault($1::"char",$2::regrole)) x`, [d.type === 'S' ? 's' : d.type, owner])).rows.concat(d.acl);
      const actual = d.type === 'f'
        ? (await db.query(`SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,x.privilege_type AS privilege,x.is_grantable AS grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=$1::regprocedure`, [`public.synthetic_${kind}_${owner}()`])).rows
        : (await db.query(`SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,x.privilege_type AS privilege,x.is_grantable AS grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault($1::"char",c.relowner))) x WHERE c.oid=$2::regclass`, [d.type === 'S' ? 's' : d.type, `public.synthetic_${kind}_${owner}`])).rows;
      const entries = acl => [...new Set(acl.map(a => `${a.grantee}:${a.privilege}:${a.grantable}`))].sort();
      assert.deepEqual(entries(actual), entries(expected), `${owner} ${d.type}`);
    }
  }
  } finally { await db.exec('REVOKE USAGE, CREATE ON SCHEMA public FROM supabase_admin'); }
});
test('later service-only migrations override broad defaults without changing required RLS', async () => {
  await db.exec(read('compatibility/20261019120000_solution_brief_foundation.sql'));
  await db.exec(fs.readFileSync(new URL('../../../supabase/migrations/20261023193032_reviewed_identity_decisions.sql', import.meta.url), 'utf8'));
  const { rows } = await db.query(`SELECT has_table_privilege('anon','public.relationship_review_receipts','SELECT') AS anon,
    has_table_privilege('authenticated','public.relationship_review_receipts','SELECT') AS authenticated,
    has_table_privilege('service_role','public.relationship_review_receipts','SELECT') AS service,
    has_function_privilege('anon','public.relationship_review_snapshot(uuid,uuid)','EXECUTE') AS anon_rpc,
    has_function_privilege('service_role','public.relationship_review_snapshot(uuid,uuid)','EXECUTE') AS service_rpc,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.relationship_review_receipts'::regclass) AS rls`);
  assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true, anon_rpc: false, service_rpc: true, rls: true });
});
