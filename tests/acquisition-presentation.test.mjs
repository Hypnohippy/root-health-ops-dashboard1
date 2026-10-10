import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { create, act } from 'react-test-renderer';
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, URL, URLSearchParams, AbortController, AbortSignal, Date, console, Buffer, crypto: { randomUUID }, process: { env: {} }, ...globals,
      require: n => n in mocks ? mocks[n] : n.startsWith('@/lib/') ? load(n.replace('@/', '') + '.ts', mocks, globals) : n.startsWith('./') ? load(path.join(path.dirname(file), n + '.tsx'), mocks, globals) : require(n) });
  return module.exports;
}
const org = '78fa2ac8-e7b6-4b9b-9604-035723ece6b1', id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sample = (extra = {}) => ({ id, organisation_id: org, record_type: 'social_opportunity', source_engine: 'root_health_personal', source_record_id: 'social-1', status: 'new', source_url: 'https://www.reddit.com/r/jobs/comments/abc/discussion/', signal: 'Switching off after work', created_at: '2026-10-10T12:00:00Z', metadata: { action_type: 'CONTENT_SIGNAL', original_post: 'How do you switch off after work?', prepared_reply: 'What helps you unwind?', content_draft: 'A moment to pause after work.', engine_safety: { public_context: true, consumer_outreach: false, health_targeting: false, verified_direct_discussion: true } }, acquisition_item_events: [], ...extra });
const presentation = load('lib/acquisitionPresentation.ts');
const response = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };

test('only the stored boolean test marker hides records; never guesses from names, IDs or wording', () => {
  assert.equal(presentation.explicitTestRecord(sample({ metadata: { test: true } })), true);
  for (const metadata of [{ test: 'true' }, { test: false }, { is_test: true }, { name: 'test lead' }, {}]) assert.equal(presentation.explicitTestRecord(sample({ metadata })), false);
  assert.equal(presentation.groupPersonalOpportunities([sample({ metadata: { ...sample().metadata, test: true } })]).length, 0);
  assert.equal(presentation.groupPersonalOpportunities([sample({ source_record_id: 'SOCIAL-test-name' })]).length, 1);
});
test('groups Personal content by exact source and evidence; preserves each record, never merges tenants, comments or distinct source text', () => {
  const a = sample(), b = sample({ id: 'b', source_record_id: 'social-variant-2', source_url: a.source_url + '?utm_source=google' });
  const group = presentation.groupPersonalOpportunities([a, b]); assert.equal(group.length, 1); assert.equal(group[0].members.length, 2); assert.equal(group[0].members[1].metadata.original_post, b.metadata.original_post);
  for (const more of [{ organisation_id: 'other' }, { source_url: a.source_url + 'comment123/' }, { metadata: { ...a.metadata, original_post: 'Different exact source text about recovery.' } }]) assert.equal(presentation.groupPersonalOpportunities([a, { ...b, ...more }]).length, 2);
  assert.equal(presentation.groupPersonalOpportunities([sample({ source_engine: 'root_health_b2b', record_type: 'b2b_lead' })]).length, 0);
});
test('existing action owner wins over a fresh duplicate; conflicting completion evidence blocks another action', () => {
  const sent = sample({ id: 'b', status: 'actioned', acquisition_item_events: [{ action: 'route_publishing', created_at: '2026-10-10T13:00:00Z' }] });
  const group = presentation.groupPersonalOpportunities([sample(), sent])[0]; assert.equal(group.item.id, 'b'); assert.equal(group.blocked, false);
  const conflict = presentation.groupPersonalOpportunities([sent, sample({ id: 'c', status: 'dismissed', acquisition_item_events: [{ action: 'dismiss', created_at: '2026-10-10T14:00:00Z' }] })])[0]; assert.equal(conflict.blocked, true);
});
test('Reddit remains content-only; LinkedIn can be a response; partner and unqualified evidence are separate categories', () => {
  assert.equal(presentation.personalCategory(sample()), 'content');
  assert.equal(presentation.personalCategory(sample({ source_url: 'https://linkedin.com/posts/discussion', metadata: { ...sample().metadata, action_type: 'PUBLIC_RESPONSE' } })), 'people');
  assert.equal(presentation.personalCategory(sample({ record_type: 'partner_opportunity' })), 'partners');
  assert.equal(presentation.personalCategory(sample({ metadata: {} })), 'review');
});
test('server reads all source batches before grouping and API paginates opportunities, not variants', async () => {
  const rows = Array.from({ length: 510 }, (_, i) => sample({ id: String(i), source_record_id: 'variant-' + i })); const ranges = [], filters = [];
  const admin = { from() { let bounds; const q = { select() { return q; }, eq(k, v) { filters.push([k, v]); return q; }, order() { return q; }, range(a, b) { bounds = [a, b]; ranges.push(bounds); return q; }, then(resolve) { resolve({ data: rows.slice(bounds[0], bounds[1] + 1) }); } }; return q; } };
  const reader = load('lib/personalAcquisition.server.ts', { '@/lib/supabaseAdmin': { supabaseAdmin: admin } });
  const groups = await reader.readPersonalOpportunities(org); assert.equal(groups.length, 1); assert.equal(groups[0].members.length, 510); assert.deepEqual(ranges, [[0, 499], [500, 999]]); assert.ok(filters.every(([key, value]) => key === 'organisation_id' ? value === org : value === 'root_health_personal'));
  const api = load('app/api/growth/acquisition/personal/route.ts', { 'next/server': response, '@/lib/supabaseAdmin': { supabaseAdmin: {} }, '@/lib/personalAcquisition.server': { readPersonalOpportunities: async () => groups }, '@/lib/personalDistribution.server': { personalPerformance: async () => ({}) }, '@/lib/tenantAuth': { requireOrganisation: async () => ({ organisationId: org }), accessErrorResponse: () => null } });
  const result = await api.GET(new Request(`https://ops/api?organisationId=${org}`)); assert.equal(result.body.total, 1); assert.equal(result.body.groups.length, 1); assert.equal(result.body.counts.content, 1);
});
test('Personal list rejects invalid filters and denied membership before reading any records', async () => {
  let reads = 0; const api = load('app/api/growth/acquisition/personal/route.ts', { 'next/server': response, '@/lib/supabaseAdmin': { supabaseAdmin: {} }, '@/lib/personalAcquisition.server': { readPersonalOpportunities: async () => { reads++; return []; } }, '@/lib/tenantAuth': { requireOrganisation: async () => { throw Error('denied'); }, accessErrorResponse: () => ({ status: 403 }) } });
  assert.equal((await api.GET(new Request(`https://ops/api?organisationId=${org}`))).status, 403); assert.equal(reads, 0);
  assert.equal((await api.GET(new Request(`https://ops/api?organisationId=${org}&category=commercial`))).status, 400);
});
test('saved content displays the actual tenant-scoped Publishing draft, including the tagged CTA', async () => {
  const filters = [], text = 'Saved edited content\n\nExplore the Root Capacity Check: https://www.roothealth.app/capacity-check?asset_id=one';
  const db = { from(table) { assert.equal(table, 'scheduled_posts'); const q = { select(value) { assert.equal(value, 'id,message'); return q; }, eq(k,v) { filters.push([k,v]); return q; }, in(k,v) { assert.equal(k,'id'); assert.deepEqual(Array.from(v), ['post-one']); return Promise.resolve({data:[{id:'post-one',message:text}]}); } }; return q; } };
  const groups = presentation.groupPersonalOpportunities([sample()]);
  const api = load('app/api/growth/acquisition/personal/route.ts', { 'next/server': response, '@/lib/supabaseAdmin': {supabaseAdmin:db}, '@/lib/personalAcquisition.server': {readPersonalOpportunities:async()=>groups}, '@/lib/personalDistribution.server': {personalPerformance:async()=>({[id]:{publishing:{id:'post-one'}}})}, '@/lib/tenantAuth':{requireOrganisation:async()=>({organisationId:org}),accessErrorResponse:()=>null} });
  const result=await api.GET(new Request(`https://ops/api?organisationId=${org}`));
  assert.equal(result.body.groups[0].savedDraft,text); assert.deepEqual(filters,[['organisation_id',org]]);
});
async function cardFixture(request = async () => ({ ok: true, json: async () => ({ success: true }) })) {
  const item = sample({ source_url: 'https://linkedin.com/posts/discussion', metadata: { ...sample().metadata, action_type: 'PUBLIC_RESPONSE' } });
  const copies = [], requests = [], opens = []; let saved = 0;
  const Card = load('app/dashboard/growth/acquisition/PersonalSignalCard.tsx', { react: React, 'react/jsx-runtime': jsx }, { navigator: { clipboard: { writeText: async text => copies.push(text) } }, window: { open: (...args) => { opens.push(args); return { opener: null, location: { replace: url => opens.push(url) } }; } }, fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return request(url, options); } }).default;
  let renderer; await act(async () => { renderer = create(React.createElement(Card, { item, signal: load('lib/personalSignal.ts').personalSignal(item), organisationId: org, onSaved: async () => saved++, onDismiss() {} })); });
  return { renderer, copies, requests, opens, saved: () => saved, button: text => renderer.root.findAllByType('button').find(b => b.props.children === text), close: async () => act(async () => renderer.unmount()) };
}
test('response copies current edited text, opens source, and never mutates lifecycle until explicit confirmed Mark responded', async () => {
  const f = await cardFixture(); const edited = 'What helps you finish the workday and unwind?';
  await act(async () => f.renderer.root.findByType('textarea').props.onChange({ target: { value: edited } }));
  await act(async () => f.button('Copy current text').props.onClick()); await act(async () => f.button('Open post & copy').props.onClick());
  assert.deepEqual(f.copies, [edited, edited]); assert.equal(f.requests.length, 0); assert.ok(f.opens.length);
  assert.equal(f.button('Mark responded').props.disabled, true); await act(async () => f.renderer.root.findByType('input').props.onChange({ target: { checked: true } }));
  await act(async () => f.button('Mark responded').props.onClick()); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].body.message, edited); assert.equal(f.requests[0].body.confirmed, true); assert.equal(f.saved(), 1); await f.close();
});
for (const status of [409, 503]) test(`response generation ${status} clears busy, retains text and permits retry/manual editing`, async () => {
  const f = await cardFixture(async () => ({ ok: false, json: async () => ({ error: 'Unavailable' }) }));
  const prior = f.renderer.root.findByType('textarea').props.value; await act(async () => f.button('Prepare response').props.onClick());
  assert.equal(f.renderer.root.findByType('textarea').props.value, prior); assert.equal(f.button('Prepare response').props.disabled, false); assert.match(JSON.stringify(f.renderer.toJSON()), /retained/); await f.close();
});
test('SOCIAL_CONTENT in-context panel uses existing review/action and pending Publishing contract; brief uses editorial action only', async () => {
  for (const searchAsset of [false, true]) {
    const calls = []; const Panel = load('app/dashboard/growth/acquisition/PersonalDistributionPanel.tsx', { react: React, 'react/jsx-runtime': jsx }, { fetch: async (_url, opts) => { calls.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ success: true, scheduledPostId: searchAsset ? undefined : id }) }; } }).default;
    let renderer; await act(async () => { renderer = create(React.createElement(Panel, { organisationId: org, itemId: id, personalMode: true, initialStatus: 'new', searchAsset, initialDraft: 'Standalone editorial content', brief: 'An exact edited article brief' })); });
    const button = renderer.root.findAllByType('button')[0]; await act(async () => button.props.onClick());
    assert.deepEqual(calls.map(c => c.action), ['start_review', searchAsset ? 'create_content_draft' : 'route_publishing']); assert.ok(calls.every(c => c.personalPresentation));
    assert.equal(searchAsset ? calls[1].brief : calls[1].publication.message, searchAsset ? 'An exact edited article brief' : 'Standalone editorial content');
    assert.match(JSON.stringify(renderer.toJSON()), searchAsset ? /Editorial brief saved/ : /pending approval/); await act(async () => renderer.unmount());
  }
});
test('Personal outreach blocks previous sends and replies without modifying targets or dispatching', async () => {
  for (const extra of [{ engine_state: { last_outbound_at: '2026-10-09T12:00:00Z' } }, { engine_state: { last_inbound_at: '2026-10-09T12:00:00Z' } }, { manual_completion: { key: 'confirmed' } }]) {
    const item = { ...sample({ record_type: 'partner_opportunity', metadata: { email: 'business@example.com', engine_safety: { public_context: true, consumer_outreach: false, health_targeting: false, verified_public_business: true } } }), ...extra };
    const input = { acquisition_items: [item], inbox_items: [], growth_targets: [] };
    const service = load('lib/personalOutreach.server.ts', { '@/lib/lifecycleSnapshot.server': { readLifecycleInput: async () => input } });
    assert.equal((await service.readPersonalOutreach(org, id)).canStart, false);
  }
});
test('Commercial, LinkedIn intake/Responses/cadence, growth targets and partner dispatch implementation stays byte-for-byte unchanged', () => {
  for (const file of ['lib/acquisitionPromotion.server.ts', 'lib/acquisitionWorkflow.ts', 'lib/contactLifecycle.ts', 'lib/responseLifecycle.ts', 'lib/growthOutreach.ts', 'lib/linkedinCadenceBackfill.ts', 'app/api/growth/linkedin-console/route.ts', 'app/api/responses/list/route.ts', 'lib/partnerConversation.server.ts', 'lib/partnerConversation.ts']) {
    const baseline = execFileSync('git', ['show', `08cdb6185b292fdfebaad52278feaa7db1c37513:${file}`], { encoding: 'utf8' });
    assert.equal(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), baseline.replaceAll('\r\n', '\n'), file);
  }
});
