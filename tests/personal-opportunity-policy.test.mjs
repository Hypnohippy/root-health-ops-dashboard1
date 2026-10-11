import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { create, act } from 'react-test-renderer';
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks = {}, globals = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { module: loadedModule, exports: loadedModule.exports, URL, Buffer, Date, URLSearchParams, AbortController, AbortSignal, setTimeout, clearTimeout, console, ...globals,
      require: n => n in mocks ? mocks[n] : n.startsWith('@/lib/') ? load(n.replace('@/', '') + '.ts', mocks, globals) : n.startsWith('./') ? load(path.join(path.dirname(file), n + '.tsx'), mocks, globals) : require(n) });
  return loadedModule.exports;
}
const org = '78fa2ac8-e7b6-4b9b-9604-035723ece6b1';
const item = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organisation_id: org, source_engine: 'root_health_personal', record_type: 'social_opportunity', source_record_id: 'SOC-123', source_url: 'https://linkedin.com/posts/discussion', status: 'new', signal: 'Switching off after work', metadata: { original_post: 'How do you switch off after work?', action_type: 'PUBLIC_RESPONSE', prepared_reply: 'What helps you unwind?', engine_safety: { public_context: true, consumer_outreach: false, health_targeting: false, verified_direct_discussion: true } } };
const interaction = { organisation_id: org, verified: true, identified: true, evidence: 'Actual inbound comment', source_record_id: 'comment-1', verified_source_url: item.source_url, kind: 'owned_asset_engagement', asset_organisation_id: org, asset_id: 'tenant-asset', asset_ownership_verified: true, authorised_next_step: { verified: true, kind: 'public_reply', evidence: 'Reply to the actual comment on tenant-owned content' } };
const prospect = () => ({ ...item, metadata: { ...item.metadata, first_party_interaction: interaction } });
const policy = load('lib/personalOpportunityPolicy.ts');
const presentation = load('lib/acquisitionPresentation.ts');
const health = load('lib/personalSourceHealth.server.ts');

test('pinned HTTPS source requests use single-address lookup without Node family-array mismatch', async () => {
  const { EventEmitter } = require('node:events');
  let pinned = false;
  const service = load('lib/personalSourceHealth.server.ts', {
    'node:dns/promises': { lookup: async () => [{ address: '93.184.216.34', family: 4 }] },
    'node:https': { request: (_url, options, onResponse) => {
      assert.equal(options.autoSelectFamily, false);
      options.lookup('linkedin.com', { all: false }, (error, address, family) => {
        assert.equal(error, null); assert.equal(address, '93.184.216.34'); assert.equal(family, 4); pinned = true;
      });
      const request = new EventEmitter();
      request.destroy = error => request.emit('error', error);
      request.end = () => {
        const response = new EventEmitter(); response.statusCode = 200; response.headers = {};
        onResponse(response); response.emit('data', Buffer.from(item.metadata.original_post)); response.emit('end'); request.emit('close');
      };
      return request;
    } },
  });
  assert.equal((await service.inspectPersonalSource(item)).evidence, 'verified');
  assert.equal(pinned, true);
});

test('source observation denies unauthorised tenants before database or external source access', async () => {
  for (const status of [401, 403]) {
    const denied = { status };
    const route = load('app/api/growth/acquisition/personal/source/route.ts', {
      'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
      '@/lib/tenantAuth': { requireOrganisation: async () => { throw denied; }, accessErrorResponse: error => ({ status: error.status }) },
      '@/lib/growthIngestion.server': { uuid: /^[0-9a-f-]{36}$/i },
      '@/lib/supabaseAdmin': { supabaseAdmin: { from: () => { throw Error('Unexpected database access'); } } },
      '@/lib/personalSourceHealth.server': { checkPersonalSource: () => { throw Error('Unexpected external source access'); } },
    });
    assert.equal((await route.GET({ url: `https://ops.example/api/source?organisationId=${org}&itemId=${item.id}` })).status, status);
  }
});

test('prospect requires a tenant-scoped verified interaction and independently authorised next step', () => {
  assert.ok(policy.personalProspect(prospect()));
  for (const change of [{ verified: false }, { evidence: '' }, { organisation_id: 'another' }, { identified: false }, { kind: 'anonymous_capacity_check' }, { asset_organisation_id: 'Fuel Geist' }, { asset_ownership_verified: false }, { authorised_next_step: { verified: false } }, { authorised_next_step: { verified: true, kind: 'cold_dm', evidence: 'public health post' } }]) assert.equal(policy.personalProspect({ ...prospect(), metadata: { ...prospect().metadata, first_party_interaction: { ...interaction, ...change } } }), null);
  for (const kind of ['anonymous_capacity_check', 'article', 'synthetic_example', 'discovered_profile']) assert.equal(policy.personalProspect({ ...item, metadata: { ...item.metadata, kind } }), null);
  assert.equal(presentation.personalCategory(item), 'content');
  assert.equal(presentation.personalCategory(prospect()), 'people');
});
test('Audience Intelligence cannot enter private outreach/pipeline or claim person engagement', () => {
  for (const action of ['prepare_outreach', 'route_outreach', 'route_responses', 'personal_responded', 'personal_engaged', 'mark_engaged', 'mark_converted', 'route_campaign', 'mark_actioned']) assert.equal(policy.personalActionPermitted(item, action), false, action);
  for (const action of ['create_content_draft', 'route_publishing', 'nurture', 'dismiss']) assert.equal(policy.personalActionPermitted(item, action), true);
  assert.equal(policy.personalActionPermitted({ ...item, source_engine: 'root_health_b2b' }, 'prepare_outreach'), true);
});
test('Reddit history is preserved, hidden before grouping/counts and blocked from every active action and ingestion', () => {
  const reddit = { ...item, source_url: 'https://old.reddit.com/r/jobs/comments/abc/topic' }, original = JSON.stringify(reddit);
  assert.equal(presentation.groupPersonalOpportunities([reddit]).length, 0);
  assert.equal(presentation.groupPersonalOpportunities([{ ...item, engine_state: { channel: "Reddit" }, source_url: "https://example.com/legacy-evidence" }]).length, 0);
  for (const action of ['create_content_draft', 'route_publishing', 'accept', 'prepare_outreach', 'personal_responded']) assert.equal(policy.personalActionPermitted(reddit, action), false);
  const parser = load('lib/growthIngestion.server.ts');
  const record = { ...reddit }; delete record.organisation_id;
  assert.throws(() => parser.parseIngestion({ organisation_id: org, records: [record] }), /historical-only/);
  assert.equal(JSON.stringify(reddit), original);
  const exporter = {}; vm.runInNewContext(fs.readFileSync('docs/google-engine-state-export.gs', 'utf8'), exporter);
  assert.equal(exporter.opsDirectSocialDiscussion_(reddit.source_url), false);
});
test('source checker refuses private/reserved addresses and credentials before requesting', async () => {
  let calls = 0;
  for (const url of ['https://127.0.0.1/post', 'https://169.254.169.254/latest', 'https://[::1]/post', 'https://[::ffff:127.0.0.1]/post', 'https://localhost/post', 'https://user:secret@example.com/post', 'http://example.com/post', 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc']) {
    const result = await health.inspectPersonalSource({ ...item, source_url: url }, { resolve: async () => { calls++; return []; }, get: async () => { calls++; } });
    assert.equal(result.accessibility, 'unavailable');
  }
  assert.equal(calls, 0);
  for (const address of ['10.1.2.3', '172.16.1.1', '192.168.1.2', '100.64.0.1', '224.0.0.1', '2001:db8::1']) assert.equal(health.publicSourceAddress(address), false);
  assert.equal(health.publicSourceAddress('8.8.8.8'), true);
  assert.equal(health.publicSourceAddress('2001:4860:4860::8888'), true);
});
test('source checks protect mixed DNS/private redirects, reject dead pages and distinguish accessibility from exact evidence', async () => {
  const resolve = async () => [{ address: '8.8.8.8', family: 4 }]; let requests = 0;
  const dead = await health.inspectPersonalSource(item, { resolve, get: async () => ({ status: 404, body: '' }) }); assert.equal(dead.message, 'Source unavailable — research again');
  const unverified = await health.inspectPersonalSource(item, { resolve, get: async () => ({ status: 200, body: 'A login page' }) }); assert.equal(unverified.accessibility, 'accessible'); assert.equal(unverified.evidence, 'unverified');
  const verified = await health.inspectPersonalSource(item, { resolve, get: async () => ({ status: 200, body: `<main>${item.metadata.original_post}</main>` }) }); assert.equal(verified.evidence, 'verified'); assert.ok(verified.checkedAt);
  const mixed = await health.inspectPersonalSource(item, { resolve: async () => [...await resolve(), { address: '10.0.0.1', family: 4 }], get: async () => { requests++; } }); assert.equal(mixed.accessibility, 'unavailable'); assert.equal(requests, 0);
  const redirect = await health.inspectPersonalSource(item, { resolve, get: async () => { requests++; return { status: 302, location: 'https://127.0.0.1/post', body: '' }; } }); assert.equal(redirect.accessibility, 'unavailable'); assert.equal(requests, 1);
});
test('source-dependent actions fail server-side when source is dead', async () => {
  const service = load('lib/personalSourceHealth.server.ts', { 'node:dns/promises': { lookup: async () => [{ address: '10.0.0.1', family: 4 }] } });
  await assert.rejects(service.requirePersonalSource(org, item), /Source unavailable/);
  await service.requirePersonalSource(org, { ...item, source_engine: 'root_health_b2b' });
});
test('Personal promotion refuses audience signals, prior contact and dead sources; Commercial skips all Personal checks', async () => {
  for (const scenario of ['audience', 'contacted', 'dead', 'commercial']) {
    let writes = 0, checks = 0;
    const row = { ...item, status: 'accepted', company: 'Business', metadata: { email: 'partner@example.com' }, record_type: scenario === 'audience' ? 'social_opportunity' : scenario === 'commercial' ? 'b2b_lead' : 'partner_opportunity', source_engine: scenario === 'commercial' ? 'root_health_b2b' : item.source_engine };
    const service = load('lib/acquisitionPromotion.server.ts', {
      '@/lib/supabaseAdmin': { supabaseAdmin: { from() { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }) }; return q; }, rpc: async () => { writes++; return { data: { targetId: 'target' } }; } } },
      '@/lib/personalOutreach.server': { readPersonalOutreach: async () => { assert.notEqual(scenario, 'commercial'); return { canStart: scenario !== 'contacted', reason: 'Previous contact exists' }; } },
      '@/lib/personalSourceHealth.server': { requirePersonalSource: async () => { checks++; throw Error('Source unavailable — research again'); } },
    });
    const run = () => service.promoteAcquisition(org, 'actor', item.id, 'key');
    if (scenario === 'commercial') { await run(); assert.equal(writes, 1); assert.equal(checks, 0); }
    else { await assert.rejects(run(), /Audience Intelligence|Previous contact|Source unavailable/); assert.equal(writes, 0); }
  }
});
test('Founder endpoints, auth and context are not imported by Personal customer paths', () => {
  for (const file of ['lib/personalOpportunityPolicy.ts', 'lib/personalOutreach.server.ts', 'lib/personalAcquisition.server.ts', 'app/api/growth/acquisition/personal/draft/route.ts', 'app/api/growth/acquisition/personal/outreach/route.ts']) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /founderIntelligence|\/api\/founder-intelligence|FOUNDER_EMAIL/);
  const draft = fs.readFileSync('app/api/growth/acquisition/personal/draft/route.ts', 'utf8'); assert.match(draft, /withTenantRoute/); assert.match(draft, /tenant\.messages/);
});
test('prepared existing-engine patch excludes Reddit from discovery, candidate qualification and generation without touching partner dispatch', () => {
  const patch = fs.readFileSync('docs/personal-social-discovery-scope.patch', 'utf8');
  const additions = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
  assert.match(additions, /Reddit discovery is disabled/);
  assert.match(additions, /personalDiscoveryActionType_/);
  assert.match(additions, /\['linkedin.com\/posts','x.com','facebook.com','instagram.com','tiktok.com'\]/);
  assert.doesNotMatch(additions, /partnerAutopilot|GmailApp|sendEmail|autoDispatch/);
  const validator = additions.match(/function personalIsDirectPublicDiscussionUrl_\(url\) \{[\s\S]*?\n\}/)[0];
  const context = { opsDirectSocialDiscussion_: () => true }; vm.runInNewContext(validator, context);
  for (const url of ['https://reddit.com/r/jobs/comments/id', 'https://www.reddit.com/r/jobs/comments/id', 'https://old.reddit.com/r/jobs/comments/id', 'https://redd.it/id']) assert.equal(context.personalIsDirectPublicDiscussionUrl_(url), false);
  assert.equal(context.personalIsDirectPublicDiscussionUrl_(item.source_url), true);
});
test('partner cards show actual contacted/replied/completed state and dead-source response is disabled', async () => {
  for (const relationship of ['contacted', 'replied', 'completed', 'new']) {
    const Card = load('app/dashboard/growth/acquisition/PersonalOpportunityCard.tsx', { react: React, 'react/jsx-runtime': jsx, './PartnerConversation': { __esModule: true, default: () => null } }, { fetch: async () => ({ ok: true, json: async () => ({ accessibility: 'unavailable', evidence: 'unverified', checkedAt: new Date().toISOString(), message: 'Source unavailable — research again' }) }) }).default;
    let renderer; await act(async () => { renderer = create(React.createElement(Card, { group: { item: { ...item, record_type: 'partner_opportunity', entity: 'SOC-20261010-technical' }, members: [item], category: 'partners', blocked: false, outreach: { relationship, canStart: relationship === 'new' } }, organisationId: org, onSaved: async () => {} })); });
    const buttons = renderer.root.findAllByType('button'), initial = buttons.find(b => b.props.children === 'Start outreach');
    if (relationship === 'new') assert.equal(initial.props.disabled, true); else assert.equal(initial, undefined);
    const text = JSON.stringify(renderer.toJSON()); assert.match(text, /Source unavailable — research again/);
    if (relationship === 'contacted') assert.match(text, /View conversation \/ Follow up/);
    if (relationship === 'replied') assert.match(text, /View response \/ Continue conversation/);
    assert.equal(renderer.root.findByType('h2').props.children, item.signal);
    await act(async () => renderer.unmount());
  }
});


test('Audience article action opens the imported editable brief without substituting generic copy or saving',async()=>{
 const imported='Editorial brief: explain the verified public wellbeing evidence and its limits. Review all source dates before use.';
 const audience={...item,evidence:'Verified public wellbeing research evidence.',record_type:'personal_opportunity',source_url:'https://research.example/article',metadata:{action_type:'SEARCH_ASSET',lane:'Intent content',content_draft:imported,engine_safety:{public_context:true,consumer_outreach:false,health_targeting:false}}};
 let writes=0;
 const Card=load('app/dashboard/growth/acquisition/PersonalOpportunityCard.tsx',{react:React,'react/jsx-runtime':jsx,'./PersonalDistributionPanel':{__esModule:true,default:p=>React.createElement('textarea',{value:p.brief,readOnly:true})}},{fetch:async(_url,options)=>{if(options?.method==='POST')writes++;return {ok:true,json:async()=>({accessibility:'accessible',evidence:'verified',checkedAt:new Date().toISOString(),message:'Source accessible � evidence checked'})};}}).default;
 let renderer;await act(async()=>{renderer=create(React.createElement(Card,{group:{item:audience,members:[audience],category:'content',blocked:false},organisationId:org,onSaved:async()=>{}}));});
 const createButton=renderer.root.findAllByType('button').find(b=>b.props.children==='Create content');assert.equal(createButton.props.disabled,false);
 await act(async()=>createButton.props.onClick());assert.equal(renderer.root.findByType('textarea').props.value,imported);assert.equal(writes,0);
 assert.equal(renderer.root.findAllByType('button').some(b=>b.props.children==='Prepare response'||b.props.children==='Start outreach'),false);
 await act(async()=>renderer.unmount());
});
