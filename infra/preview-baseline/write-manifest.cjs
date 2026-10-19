// Explicit review/cutover tool. Not invoked by tests; tests must detect artifact drift.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname, repo=path.resolve(root,'../..');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f,'utf8').replaceAll('\r\n','\n')).digest('hex');
const treatments={
 '20260923090000':'Organisation profiles and merge RPC captured in final form; base organisations/members now included.',
 '20260923120000':'Final ownership columns, constraints and policies captured. Historical row attribution is not replayed.',
 '20260923140000':'Acquisition tables, keys, indexes and policies captured.',
 '20260924100000':'Final acquisition status constraints/action functions captured; later replacements win.',
 '20260924130000':'Final inbox/email fields, constraints, indexes, tables and policies captured.',
 '20260924170000':'Final send-request schema, RPCs, grants and triggers captured.',
 '20260924190000':'Final LinkedIn target columns/identity constraints captured; no data consolidation replay.',
 '20260924193000':'Final inbox acceptance/identity columns captured; no historical acceptance update replay.',
 '20260924210000':'Final revision/repair tables, functions and triggers captured. Legacy lifecycle SQL views are absent in Production and are not resurrected.',
 '20260925100000':'Final engine-state columns and trigger/function definitions captured.',
 '20260926100000':'Final manual-completion columns, guards and RPCs captured.',
 '20260927100000':'Final acquisition action replacement captured; historical function definition superseded.',
 '20260927110000':'Final email column and canonical import RPC captured.',
 '20261001120000':'Final conversation-message schema, keys and policies captured.',
 '20261001193000':'Final reply/request unique keys and indexes captured; old unique constraint not restored.',
 '20261007100000':'Final promotion function/grants captured.',
 '20261009100000':'Final cadence columns/functions captured. No historical cadence backfill on empty data.',
 '20261009120000':'Final external-send evidence RPC captured without recording evidence.',
 '20261009140000':'Final LinkedIn conversation schema/functions/guards captured.',
 '20261009160000':'Final snapshot/direction constraints and RPC captured, not earlier constraint version.',
 '20261009170000':'Final action RPC captured. Production ledger records this SQL under 20261010054821; no ledger rewrite.',
 '20261013170000':'Final Founder tables/functions/constraints/policies captured, no research rows.',
 '20261014063937':'Final relationship workspace schema/guards/policies captured, no workspaces seeded.',
 '20261016154246':'Final identity decision schema/identity sequence/guards captured, no decisions seeded.',
 '20261018203554':'Final social dismissal RPC captured, no cleanup action executed.'
};
const legacy=fs.readdirSync(path.join(repo,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(file=>{
 const version=file.slice(0,14); if(!treatments[version])throw Error('Unreviewed migration '+file);
 return {file,version,sha256:hash(path.join(repo,'supabase/migrations',file)),treatment:'superseded-for-fresh-preview-only',reason:treatments[version]};
});
const pendingFile='20261019120000_solution_brief_foundation.sql';
const artifacts=['source/catalog.json','source/catalog.sql','source/extra.json','source/extra-catalog.sql','local-platform.sql','migrations/00000000000000_root_ops_schema_baseline.sql'];
const manifest={format:1,productionProject:'bechmxbywqhsauhctewo',snapshotDate:'2026-10-19',main:'702f2b7ab1ac2a41ca6e8c320fdcc138417e7077',pr84:'7ec8c3e5c5998386eee17eca345163964dcfb4dc',hashEncoding:'UTF-8, CRLF normalized to LF (canonical Git text)',activeFreshInstallChain:['migrations/00000000000000_root_ops_schema_baseline.sql'],retainedSubsequent:[],legacy,pending:[{file:pendingFile,sha256:hash(path.join(root,'compatibility',pendingFile)),treatment:'exact PR84 compatibility fixture only; not active until separately approved',sourceHead:'7ec8c3e5c5998386eee17eca345163964dcfb4dc'}],productionLedger:[{version:'20261010054821',name:'personal_signal_acquisition_actions',repositoryVersion:'20261009170000',treatment:'unchanged; native dashboard replay remains incomplete until separate ledger reconciliation'}],artifacts:artifacts.map(file=>({file,sha256:hash(path.join(root,file))}))};
fs.writeFileSync(path.join(root,'migration-map.json'),JSON.stringify(manifest,null,2)+'\n');
const rows=legacy.map(x=>`| ${x.file} | Superseded for fresh Preview | ${x.reason} |`);
fs.writeFileSync(path.join(root,'MIGRATION-ORDER.md'),`# Fresh Preview migration cutover\n\nSnapshot: main ${manifest.main}, before PR84 ${manifest.pr84}.\n\n1. Standard Supabase-managed platform schemas/roles (local proof uses versioned catalog-derived local-platform.sql).\n2. 00000000000000_root_ops_schema_baseline.sql, explicitly opted in, empty public application schema only.\n3. Zero retained legacy subsequent migrations at this snapshot.\n4. PR84 migration is a pending compatibility fixture, not active infrastructure/Production migration.\n5. Future approved migrations append after the snapshot and must be tested from empty.\n\nOriginal supabase/migrations files remain untouched for audit/existing installations and existing tests. They are NOT the new empty-install entry point. Never replay those 25 incremental files over this current-state baseline. No history rows are edited or marked applied by this tooling.\n\n| Existing file | Treatment | Reason |\n| --- | --- | --- |\n${rows.join('\n')}\n\nEvery file checksum is in migration-map.json. Text hashes use LF normalization to match Git across Windows/Linux. The ledger timestamp mismatch is retained explicitly in that map. No blanket idempotency corrections or historical DDL edits are made: non-idempotent CREATEs belong to the superseded chain, and the snapshot intentionally rejects replay.\n`);
