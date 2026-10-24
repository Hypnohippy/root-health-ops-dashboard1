import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { compare, functionLineEndings } = require('../compare.cjs');
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const catalog = JSON.parse(read('source/catalog.json'));
const hosted = JSON.parse(read('workflow/fixtures/hosted-function-line-endings.json')).function;
const expected = catalog.functions.find(f => f.schema === 'public' && f.name === hosted.name && f.signature === hosted.signature);
const change = fields => ({ ...hosted, ...fields });

test('captured hosted mismatch is exactly 85 CRLF pairs, with every other field identical', () => {
  assert.notEqual(hosted.definition, expected.definition);
  assert.equal((hosted.definition.match(/\r\n/g) || []).length, 85);
  assert.equal(hosted.definition.replaceAll('\r\n', '\n'), expected.definition);
  assert.deepEqual({ ...hosted, definition: '' }, { ...expected, definition: '' });
  assert.deepEqual(compare(expected, hosted), []);
});

test('executable statement and literal changes still fail', () => {
  for (const [from, to] of [['SECURITY DEFINER', 'SECURITY INVOKER'], ["'public', 'pg_temp'", "'public'"], ['v_item', 'v_other_item']]) {
    assert.ok(hosted.definition.includes(from));
    assert.ok(compare(expected, change({ definition: hosted.definition.replace(from, to) })).length);
  }
  for (const attribute of ['STRICT', 'PARALLEL SAFE', 'LEAKPROOF', 'IMMUTABLE']) {
    assert.ok(compare(expected, change({ definition: hosted.definition.replace(' LANGUAGE plpgsql', ' LANGUAGE plpgsql\n ' + attribute) })).length);
  }
  const literal = functionRecord("BEGIN\n RETURN 'safe';\nEND;");
  assert.ok(compare(literal, { ...literal, definition: literal.definition.replace("'safe'", "'changed'") }).length);
});

test('indentation, trailing spaces, final newline and dollar tag differences are not erased', () => {
  for (const definition of [hosted.definition + ' ', hosted.definition + '\n', hosted.definition.replace('declare', ' declare'), hosted.definition.replaceAll('$function$', '$changed$')]) {
    assert.ok(compare(expected, change({ definition })).length);
  }
});

test('owner, execute ACL, grant option, signature and additional catalog attributes remain strict', () => {
  for (const fields of [{ owner: 'service_role' }, { signature: hosted.signature + ', unexpected text' }, { acl: [] },
    { acl: [...hosted.acl, { grantee: 'PUBLIC', privilege: 'EXECUTE', grantable: true }] },
    { language: 'sql' }, { volatility: 'i' }, { parallel: 's' }, { leakproof: true }, { strict: true }]) {
    assert.ok(compare(expected, change(fields)).length);
  }
});

const functionRecord = body => ({ schema: 'public', name: 'synthetic', signature: '', definition: `CREATE OR REPLACE FUNCTION public.synthetic()\n RETURNS text\n LANGUAGE plpgsql\nAS $function$\n${body}\n$function$\n`, owner: 'postgres', acl: [] });
const bodyCRLF = definition => definition.replace(/(AS \$function\$)([\s\S]*)(\$function\$)/, (_, start, body, end) => start + body.replaceAll('\n', '\r\n') + end);
test('ordinary code line endings normalize; bare carriage returns and blank-line changes do not', () => {
  const f = functionRecord('BEGIN\n RETURN 1;\nEND;');
  assert.deepEqual(compare(f, { ...f, definition: bodyCRLF(f.definition) }), []);
  assert.ok(compare(f, { ...f, definition: f.definition.replace('RETURN 1;', 'RETURN\r1;') }).length);
  assert.ok(compare(f, { ...f, definition: f.definition.replace('RETURN 1;', '\nRETURN 1;') }).length);
});

test('quoted value/identifier newlines, escaped text and dynamic SQL remain meaningful', () => {
  for (const literal of ["'a\nb'", '"a\nb"', '$sql$a\nb$sql$', "E'a\\\'\nb'", "'a''\nb'"]) {
    const f = functionRecord('BEGIN\n RETURN ' + literal + ';\nEND;');
    const changed = { ...f, definition: f.definition.replace(literal, literal.replaceAll('\n', '\r\n')) };
    assert.ok(compare(f, changed).length, literal);
  }
  const escaped = functionRecord("BEGIN\n RETURN E'\\r\\n';\nEND;");
  assert.deepEqual(compare(escaped, { ...escaped, definition: bodyCRLF(escaped.definition) }), []);
});

test('unsupported or incomplete quoting is compared unchanged', () => {
  for (const definition of ["AS 'BEGIN\r\nEND'", 'AS $function$\r\nRETURN \'broken\r\n$function$', 'AS $function$\r\n$sql$broken\r\n$function$']) {
    assert.equal(functionLineEndings(definition), definition);
  }
});

test('table columns, RLS, indexes, constraints, policies and enum ordering remain strict', () => {
  const table = { schema: 'public', name: 'synthetic', rls: true, columns: [{ name: 'a' }, { name: 'b' }], indexes: [{ definition: 'CREATE INDEX a ON t(a)' }], constraints: [{ type: 'c', definition: 'CHECK (a > 0)' }], policy: { qual: 'tenant = auth.uid()' }, labels: ['a', 'b'] };
  for (const fields of [{ rls: false }, { columns: [...table.columns].reverse() }, { labels: ['b', 'a'] }, { indexes: [{ definition: 'CREATE INDEX a ON t(b)' }] }, { constraints: [{ type: 'c', definition: 'CHECK (a >= 0)' }] }, { policy: { qual: 'true' } }]) {
    assert.ok(compare(table, { ...table, ...fields }).length);
  }
  assert.ok(compare({ definition: 'table\ntext' }, { definition: 'table\r\ntext' }).length);
});

test('source capture, generated SQL and stored catalog attributes prove the same function contract', async () => {
  const baseline = read('migrations/00000000000000_root_ops_schema_baseline.sql');
  // Renderer trims the final deparser newline and adds a statement terminator only.
  assert.ok(baseline.includes(expected.definition.trim().replace(/;?$/, ';')));
  const db = new PGlite(); await db.waitReady;
  try {
    await db.exec(read('local-platform.sql'));
    await db.exec("SET root_ops.empty_preview_baseline='on'");
    await db.exec(baseline);
    const metadata = async () => (await db.query(`SELECT p.prosrc, l.lanname language,
      pg_get_function_identity_arguments(p.oid) arguments, pg_get_function_result(p.oid) result,
      p.provolatile volatility,p.prosecdef security_definer,p.proisstrict strict,
      p.proparallel parallel,p.proleakproof leakproof,p.proconfig config,
      pg_get_userbyid(p.proowner) owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname='public' AND p.proname='apply_acquisition_action'`)).rows[0];
    const before = await metadata();
    await db.exec(hosted.definition);
    const after = await metadata();
    assert.equal(after.prosrc.replaceAll('\r\n', '\n'), before.prosrc);
    assert.equal(after.definition.replaceAll('\r\n', '\n'), before.definition);
    assert.deepEqual({ ...after, prosrc: '', definition: '' }, { ...before, prosrc: '', definition: '' });
    assert.ok(after.prosrc.includes('\r\n')); // PostgreSQL preserves body text; deparser is not an EOL converter.
  } finally { await db.close(); }
});
