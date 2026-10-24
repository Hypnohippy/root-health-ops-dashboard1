import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { compare, functionLineEndings, functionCodeIndentation } = require('../compare.cjs');
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const { pairs } = JSON.parse(read('./fixtures/hosted-function-indentation.json'));
const record = body => ({ schema: 'public', name: 'synthetic', signature: '', owner: 'postgres', acl: [],
  definition: `CREATE OR REPLACE FUNCTION public.synthetic()\n RETURNS text\n LANGUAGE plpgsql\nAS $function$\n${body}\n$function$\n` });

for (const [index, { expected, captured }] of pairs.entries()) {
  test(`exact attempt-five ${expected.name}: pre-repair failure and bounded compatibility`, () => {
    assert.notEqual(functionLineEndings(expected.definition), functionLineEndings(captured.definition));
    const a = expected.definition.split('\n'), b = captured.definition.split('\n');
    const changed = a.flatMap((line, i) => line === b[i] ? [] : [{ line, other: b[i] }]);
    assert.equal(changed.length, index === 0 ? 69 : 2);
    assert.equal(a.length, b.length);
    for (const { line, other } of changed) {
      assert.equal(line.replace(/^ +/, ''), other.replace(/^ +/, ''));
      assert.match(line, /^ {2,}\S/);
      assert.match(other, /^ \S/);
    }
    assert.equal((expected.definition + captured.definition).includes('\r'), false);
    assert.equal((expected.definition + captured.definition).includes('\t'), false);
    assert.deepEqual({ ...expected, definition: '' }, { ...captured, definition: '' });
    assert.deepEqual(compare(expected, captured), []);
  });
}

test('PostgreSQL preserves both bodies; explicit attributes and migration-generated definitions match', async () => {
  const db = new PGlite(); await db.waitReady;
  try {
    await db.exec(read('../local-platform.sql'));
    await db.exec("SET root_ops.empty_preview_baseline='on'");
    await db.exec(read('../migrations/00000000000000_root_ops_schema_baseline.sql'));
    // LF is a controlled local transport input, never a rewrite of migration bytes.
    await db.exec(read('../../../supabase/migrations/20261023193032_reviewed_identity_decisions.sql').replaceAll('\r\n', '\n'));
    for (const { expected, captured } of pairs) {
      const metadata = async () => (await db.query(`SELECT p.prosrc, pg_get_functiondef(p.oid) definition,
        pg_get_function_identity_arguments(p.oid) identity, pg_get_function_result(p.oid) result,
        p.proargnames,p.proargmodes,p.proargtypes::text,p.proallargtypes,p.prorettype::regtype::text,
        p.provolatile,p.proisstrict,p.proparallel,p.proleakproof,p.prosecdef,p.proconfig,
        l.lanname,pg_get_userbyid(p.proowner) owner,p.proacl::text
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
        WHERE n.nspname='public' AND p.proname=$1`, [expected.name])).rows[0];
      const before = await metadata();
      assert.equal(before.definition, expected.definition);
      await db.exec(captured.definition);
      const after = await metadata();
      assert.equal(after.definition, captured.definition);
      assert.deepEqual({ ...before, prosrc: '', definition: '' }, { ...after, prosrc: '', definition: '' });
      // This is local replay of a rendered capture, not a missing hosted prosrc claim.
      assert.equal(functionCodeIndentation(expected.definition), functionCodeIndentation(after.definition));
    }
  } finally { await db.close(); }
});

test('only indentation outside protected tokens normalizes; code CRLF remains supported', () => {
  const a = record('BEGIN\n RETURN 1;\nEND;');
  const b = record('BEGIN\n\t    RETURN 1;\nEND;');
  assert.deepEqual(compare(a, b), []);
  const crlf = b.definition.replace(/(AS \$function\$)([\s\S]*)(\$function\$)/,
    (_, start, body, end) => start + body.replaceAll('\n', '\r\n') + end);
  assert.deepEqual(compare(a, { ...b, definition: crlf }), []);
});

const strictCases = [
  ['plain literal', "BEGIN\n RETURN 'line\n  value';\nEND;", '  value', ' value'],
  ['escaped literal', "BEGIN\n RETURN E'line\\n\n  value';\nEND;", '  value', '\tvalue'],
  ['quoted identifier', 'BEGIN\n RETURN "line\n  value";\nEND;', '  value', ' value'],
  ['dynamic SQL', "BEGIN\n EXECUTE 'SELECT\n  1';\nEND;", '  1', ' 2'],
  ['dynamic SQL indentation', "BEGIN\n EXECUTE 'SELECT\n  1';\nEND;", '  1', ' 1'],
  ['nested dollar literal', 'BEGIN\n EXECUTE $sql$SELECT\n  1$sql$;\nEND;', '  1', ' 1'],
  ['comment text', 'BEGIN\n /* outer\n /* inner */\n  text */\n RETURN 1;\nEND;', '  text', ' text'],
  ['line comment', 'BEGIN\n --  comment\n RETURN 1;\nEND;', '--  comment', '-- comment'],
  ['code token', 'BEGIN\n RETURN 1;\nEND;', 'RETURN', 'PERFORM'],
  ['statement order', 'BEGIN\n PERFORM 1;\n RETURN 2;\nEND;', 'PERFORM 1;\n RETURN 2;', 'RETURN 2;\n PERFORM 1;'],
  ['trailing whitespace', 'BEGIN\n RETURN 1;\nEND;', 'RETURN 1;', 'RETURN 1; '],
  ['meaningful newline', "BEGIN\n RETURN 'a'\n 'b';\nEND;", "'a'\n 'b'", "'a' 'b'"],
  ['literal tabs versus spaces', "BEGIN\n RETURN 'a\n  b';\nEND;", '  b', '\tb'],
];
for (const [name, body, from, to] of strictCases) test(`${name} remains strict`, () => {
  assert.ok(body.includes(from));
  assert.ok(compare(record(body), record(body.replace(from, to))).length);
});

for (const [name, fields] of [
  ['security', { definition: pairs[0].captured.definition.replace('SECURITY DEFINER', 'SECURITY INVOKER') }],
  ['SET config', { definition: pairs[0].captured.definition.replace("SET search_path TO ''", "SET search_path TO 'public'") }],
  ['return type', { definition: pairs[0].captured.definition.replace('RETURNS jsonb', 'RETURNS text') }],
  ['signature', { signature: pairs[0].expected.signature + ', other text' }],
  ['owner', { owner: 'service_role' }], ['grants', { acl: [] }],
  ['volatility', { definition: pairs[0].captured.definition.replace(' LANGUAGE plpgsql', ' LANGUAGE plpgsql\n IMMUTABLE') }],
]) test(`${name} metadata remains strict`, () => {
  assert.ok(compare(pairs[0].expected, { ...pairs[0].captured, ...fields }).length);
});

test('incomplete nested comments/strings/dollar literals and unknown languages fail closed', () => {
  for (const body of ["BEGIN\n  RETURN 'broken", 'BEGIN\n /* outer /* nested */\n  RETURN 1;',
    'BEGIN\n  RETURN $sql$broken', "BEGIN\n  RETURN 'back\\slash';\nEND;"]) {
    const f = record(body);
    assert.equal(functionCodeIndentation(f.definition), f.definition);
  }
  const sql = record('BEGIN\n  RETURN 1;\nEND;').definition.replace('LANGUAGE plpgsql', 'LANGUAGE sql');
  assert.equal(functionCodeIndentation(sql), sql);
});

test('lossy display-space collapse reproduces capture but must never be a comparator rule', () => {
  for (const { expected, captured } of pairs) assert.equal(expected.definition.replace(/ {2,}/g, ' '), captured.definition);
  const literal = record("BEGIN\n RETURN 'two  spaces';\nEND;");
  assert.ok(compare(literal, { ...literal, definition: literal.definition.replace(/ {2,}/g, ' ') }).length);
});

test('newline-sensitive adjacent string semantics are checked by PostgreSQL', async () => {
  const db = new PGlite(); await db.waitReady;
  try {
    assert.equal((await db.query("SELECT 'a'\n 'b' value")).rows[0].value, 'ab');
    await assert.rejects(db.query("SELECT 'a' 'b' value"));
  } finally { await db.close(); }
});
