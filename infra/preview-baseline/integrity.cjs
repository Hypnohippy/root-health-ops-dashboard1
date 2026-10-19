const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root,'migration-map.json')));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')).digest('hex');
for (const item of manifest.legacy) assert.equal(hash(path.join(root,'../../supabase/migrations',item.file)),item.sha256,`${item.file} changed`);
const pending=manifest.pending[0];
assert.equal(hash(path.join(root,'compatibility',pending.file)),pending.sha256,'PR84 migration changed');
assert.equal(manifest.legacy.length,25);
assert.equal(manifest.retainedSubsequent.length,0);
for (const item of manifest.artifacts) assert.equal(hash(path.join(root,item.file)),item.sha256,`${item.file} changed`);
const report=JSON.parse(fs.readFileSync(path.join(root,'verification.json')));
assert.equal(report.structuralMismatches,0);
// Metadata files must never acquire key material, raw auth users, or provider credentials.
for (const file of ['source/catalog.json','source/extra.json','migrations/00000000000000_root_ops_schema_baseline.sql','local-platform.sql']) {
  const text=fs.readFileSync(path.join(root,file),'utf8');
  assert(!/(?:sb_secret_|sb_publishable_|sk_live_|sk_test_)[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}\./.test(text),`${file} contains credential-like content`);
}
console.log('Integrity: 25 unchanged historical migrations; exact PR84 fixture; all artifact hashes; zero schema drift; credential scan passed.');
