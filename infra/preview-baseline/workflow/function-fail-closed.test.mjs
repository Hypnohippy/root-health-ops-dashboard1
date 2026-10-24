import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
// Local before/after rehearsal only; this test never accepts a database URL.
const { compare, functionLineEndings, functionCodeIndentation } = require(
  process.env.ROOT_OPS_COMPARATOR_UNDER_TEST ? path.resolve(process.env.ROOT_OPS_COMPARATOR_UNDER_TEST) : '../compare.cjs');
const definition = body => `CREATE OR REPLACE FUNCTION public.review_literal_probe()\n RETURNS text\n LANGUAGE plpgsql\n SET standard_conforming_strings TO 'off'\nAS $function$\n${body}\n$function$\n`;
const record = text => ({ schema: 'public', name: 'review_literal_probe', signature: '', definition: text, owner: 'postgres', acl: [] });
const different = (a, b) => assert.ok(compare(record(a), record(b)).length, 'Executable/protected difference must not become equality');

test('exact final-review probe: different PostgreSQL literal values MUST compare differently', async () => {
  const body = "BEGIN\n RETURN 'first\\'\r\n  middle\\'end';\nEND;";
  const a = definition(body), b = definition(body.replace('\r\n', '\n'));
  const db = new PGlite(); await db.waitReady;
  try {
    await db.exec(a);
    const first = (await db.query('select review_literal_probe() value')).rows[0].value;
    await db.exec(b);
    const second = (await db.query('select review_literal_probe() value')).rows[0].value;
    assert.equal(first, "first'\r\n  middle'end");
    assert.equal(second, "first'\n  middle'end");
    assert.notEqual(first, second);
    different(a, b); // Incorrect equality on c3f7326: permanent blocker regression.
    assert.equal(functionLineEndings(a), a);
    assert.equal(functionCodeIndentation(a), a);
  } finally { await db.close(); }
});

test('late ambiguity discards ALL prospective EOL/indent changes', () => {
  const a = definition("BEGIN\r\n    PERFORM 1;\r\n RETURN 'odd\\slash';\r\nEND;");
  assert.equal(functionLineEndings(a), a);
  assert.equal(functionCodeIndentation(a), a);
  different(a, a.replace('    PERFORM', ' PERFORM'));
  different(a, a.replace('BEGIN\r\n', 'BEGIN\n'));
});

test('even backslash pairs retain literal bytes while safe code EOL can normalize', () => {
  const a = definition("BEGIN\r\n RETURN 'two\\\\slashes';\r\nEND;");
  const b = definition("BEGIN\n RETURN 'two\\\\slashes';\nEND;");
  assert.deepEqual(compare(record(a), record(b)), []);
  different(a, a.replace('two\\\\slashes', 'two\\slashes'));
});

for (const language of ['sql', 'plpython3u', 'plv8']) test(`unsupported ${language} receives no normalization`, () => {
  const a = definition('BEGIN\r\n    RETURN 1;\r\nEND;').replace('LANGUAGE plpgsql', 'LANGUAGE ' + language);
  assert.equal(functionLineEndings(a), a);
  assert.equal(functionCodeIndentation(a), a);
  different(a, a.replace('    RETURN', ' RETURN'));
});

const unsupported = [
  "BEGIN\r\n  RETURN 'unfinished;",
  'BEGIN\r\n  RETURN "unfinished;',
  'BEGIN\r\n /* outer /* nested */\r\n  RETURN 1;',
  'BEGIN\r\n  RETURN $nested$unfinished;',
  "BEGIN\r\n  RETURN U&'unicode';\r\nEND;",
  'BEGIN\r\n  RETURN U&"unicode";\r\nEND;',
  'BEGIN\r\n  RETURN $é$unicode-tag$é$;\r\nEND;',
];
for (const [index, body] of unsupported.entries()) test(`unsupported/incomplete lexical structure ${index + 1} stays wholly strict`, () => {
  const a = definition(body);
  assert.equal(functionLineEndings(a), a);
  assert.equal(functionCodeIndentation(a), a);
  different(a, a.replace('BEGIN\r\n', 'BEGIN\n'));
});

test('apparent AS marker inside a multiline header value cannot start normalization', () => {
  const a = definition('BEGIN\r\n  RETURN 1;\r\nEND;').replace(" SET standard_conforming_strings TO 'off'", " SET app.label TO 'x\nAS $fake$\n LANGUAGE plpgsql\ny'");
  assert.equal(functionLineEndings(a), a);
  assert.equal(functionCodeIndentation(a), a);
});

const changes = [
  ['quoted text', "BEGIN\n RETURN 'one';\nEND;", "'one'", "'two'"],
  ['quoted indentation', "BEGIN\n RETURN 'one\n  two';\nEND;", '  two', ' two'],
  ['quoted identifier', 'BEGIN\n RETURN "one\n  two";\nEND;', '  two', ' two'],
  ['nested dollar literal', 'BEGIN\n RETURN $nested$one\r\n  two$nested$;\nEND;', '\r\n', '\n'],
  ['dynamic SQL', "BEGIN\n EXECUTE 'SELECT\r\n  1';\nEND;", '\r\n', '\n'],
  ['line comment content', 'BEGIN\n --  do not change\n RETURN 1;\nEND;', '--  do', '-- do'],
  ['block comment content', 'BEGIN\n /* outer\r\n /* nested */\r\n  text */\n RETURN 1;\nEND;', '\r\n', '\n'],
  ['comment-like string content', "BEGIN\n RETURN '-- /* quoted */\r\n  text';\nEND;", '\r\n', '\n'],
  ['quote-like comment content', "BEGIN\n /* ' \' $tag$\r\n  text */\n RETURN 1;\nEND;", '  text', ' text'],
  ['escaped string', "BEGIN\n RETURN E'quote\\\' -- /*\r\n  data';\nEND;", '\r\n', '\n'],
  ['keyword', 'BEGIN\n RETURN 1;\nEND;', 'RETURN', 'PERFORM'],
  ['numeric value', 'BEGIN\n RETURN 1;\nEND;', 'RETURN 1', 'RETURN 2'],
  ['identifier', 'BEGIN\n RETURN original;\nEND;', 'original', 'replacement'],
  ['statement order', 'BEGIN\n PERFORM 1;\n RETURN 2;\nEND;', 'PERFORM 1;\n RETURN 2;', 'RETURN 2;\n PERFORM 1;'],
];
for (const [name, body, from, to] of changes) test(`${name} cannot normalize into equality`, () => {
  assert.ok(body.includes(from));
  different(definition(body), definition(body.replace(from, to)));
});

for (const attribute of ['IMMUTABLE', 'STRICT', 'PARALLEL SAFE', 'LEAKPROOF', 'SECURITY DEFINER']) test(`${attribute} remains strict`, () => {
  const a = definition('BEGIN\n RETURN 1;\nEND;');
  different(a, a.replace(' LANGUAGE plpgsql', ' LANGUAGE plpgsql\n ' + attribute));
});

test('signature, return, SET, owner and grants remain strict', () => {
  const a = definition('BEGIN\n RETURN 1;\nEND;');
  for (const [from, to] of [['review_literal_probe()', 'review_literal_probe(input text)'], ['RETURNS text', 'RETURNS jsonb'], ["TO 'off'", "TO 'on'"]]) different(a, a.replace(from, to));
  assert.ok(compare(record(a), { ...record(a), owner: 'service_role' }).length);
  assert.ok(compare(record(a), { ...record(a), acl: [{ grantee: 'PUBLIC', privilege: 'EXECUTE', grantable: true }] }).length);
});
