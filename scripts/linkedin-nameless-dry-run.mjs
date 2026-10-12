// SELECT only. This script deliberately has no apply/write mode.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
function load(file) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, URL, require: () => load('lib/linkedinCaptureProfile.ts') });
  return mod.exports;
}
const { resolveLinkedInName } = load('lib/linkedinCaptureName.ts');
const org = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(org || '')) throw Error('Supply the organisation UUID.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function read(table, columns, qualify) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await qualify(db.from(table).select(columns).eq('organisation_id', org)).order('id').range(offset, offset + 499);
    if (error) throw Error(`${table}: ${error.code}`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
(async () => {
  const [inbox, targets, recommendations] = await Promise.all([
    read('inbox_items', 'id,kind,author_name,linkedin_identity,permalink', q => q.eq('platform', 'linkedin')),
    read('growth_targets', 'id,target_name,linkedin_identity,linkedin_url', q => q),
    read('acquisition_items', 'id,person,source_url', q => q.eq('source_engine', 'linkedin_connection_recommendation')),
  ]);
  const evidence = [...inbox, ...targets, ...recommendations];
  const nameless = inbox.filter(row => row.kind === 'connection_accepted' && !row.author_name?.trim());
  const summary = { readOnly: true, total: nameless.length, trusted: 0, slug: 0, unresolved: 0 };
  const review = nameless.map(row => {
    const result = resolveLinkedInName(row.permalink || `https://${row.linkedin_identity || ''}`, evidence);
    summary[result.source === 'stored' ? 'trusted' : result.source === 'slug' ? 'slug' : 'unresolved']++;
    return { id: row.id, proposedName: result.name || null, basis: result.source, reviewRequired: result.source !== 'stored' };
  });
  console.log(JSON.stringify({ summary, review }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
