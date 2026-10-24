// Real local PostgreSQL privilege checks; no hosted database or Auth user data.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const baseline = read('migrations/00000000000000_root_ops_schema_baseline.sql');
const block = baseline.match(/CREATE TRIGGER on_auth_user_created_create_org[^\n]+;\n(DO \$auth_trigger_state\$[\s\S]*?END \$auth_trigger_state\$;)/);
const installer = 'root_ops_hosted_installer';
let db;
before(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(read('local-platform.sql'));
  await db.exec("SET root_ops.empty_preview_baseline='on'");
  await db.exec(baseline);
  await db.exec(`CREATE ROLE ${installer} NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA auth, public TO ${installer};
    GRANT TRIGGER ON auth.users TO ${installer};
    GRANT EXECUTE ON FUNCTION public.handle_new_user_create_org() TO ${installer};`);
});
after(async () => { await db?.close(); });
async function asInstaller(sql) {
  await db.exec(`SET ROLE ${installer}`);
  try { return await db.exec(sql); } finally { await db.exec('RESET ROLE'); }
}

test('fresh Auth trigger retains the captured Production origin-enabled state without ALTER', () => {
  const captured = JSON.parse(read('source/catalog.json')).triggers.find(t => t.schema === 'auth' && t.name === 'on_auth_user_created_create_org');
  assert.equal(captured.enabled, 'O');
  assert.ok(block, 'generated create plus catalog assertion is required');
  assert.ok(block[0].startsWith(captured.definition + ';'));
  assert.doesNotMatch(baseline, /ALTER TABLE "auth"\."users" (?:ENABLE|DISABLE).*TRIGGER/);
});

test('non-owner installer reproduces the original hosted ownership failure', async () => {
  const { rows } = await db.query(`SELECT pg_get_userbyid(relowner) AS owner,
    has_table_privilege('${installer}','auth.users','TRIGGER') AS can_trigger,
    pg_has_role('${installer}',relowner,'USAGE') AS owner_role
    FROM pg_class WHERE oid='auth.users'::regclass`);
  assert.deepEqual(rows[0], { owner: 'supabase_auth_admin', can_trigger: true, owner_role: false });
  await assert.rejects(asInstaller('ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created_create_org'), error => error.code === '42501' && /must be owner/.test(error.message));
});

test('exact generated create/assertion block succeeds with TRIGGER privilege and no table ownership', async () => {
  await db.exec('DROP TRIGGER on_auth_user_created_create_org ON auth.users');
  await asInstaller(block[0]);
  const { rows } = await db.query("SELECT tgenabled, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created_create_org'");
  assert.equal(rows[0].tgenabled, 'O');
  assert.equal(rows[0].definition + ';', block[0].split('\n')[0]);
});

test('signup still creates exactly one owned organisation and owner membership', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await db.exec('SET ROLE supabase_auth_admin');
  try {
    await db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,'phase2d_test_signup@example.invalid','{"organisation_name":"PHASE2D_TEST_SIGNUP"}')`, [id]);
  } finally { await db.exec('RESET ROLE'); }
  const { rows } = await db.query(`SELECT o.name, m.role, count(*)::int AS n
    FROM public.organisations o JOIN public.organisation_members m ON m.organisation_id=o.id
    WHERE o.owner_id=$1 AND m.user_id=$1 GROUP BY o.name,m.role`, [id]);
  assert.deepEqual(rows, [{ name: 'PHASE2D_TEST_SIGNUP', role: 'owner', n: 1 }]);
});

test('verification fails closed for a missing trigger instead of silently skipping it', async () => {
  await db.exec('DROP TRIGGER on_auth_user_created_create_org ON auth.users');
  await assert.rejects(asInstaller(block[1]), /does not match the required enabled state/);
  await asInstaller(block[0]);
});

test('verification fails closed for a disabled trigger without attempting to change managed state', async () => {
  // Only the local test superuser changes state to exercise the assertion.
  await db.exec('ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created_create_org');
  await assert.rejects(asInstaller(block[1]), /does not match the required enabled state/);
  assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created_create_org'")).rows[0].tgenabled, 'D');
  await db.exec('ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created_create_org');
  await asInstaller(block[1]);
});

test('verification rejects the same trigger name pointing at a different function', async () => {
  await db.exec(`DROP TRIGGER on_auth_user_created_create_org ON auth.users;
    CREATE FUNCTION public.synthetic_wrong_signup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER on_auth_user_created_create_org AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.synthetic_wrong_signup();`);
  await assert.rejects(asInstaller(block[1]), /does not match the required enabled state/);
});
