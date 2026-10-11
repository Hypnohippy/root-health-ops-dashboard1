import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const patch = fs.readFileSync('docs/personal-social-discovery-scope.patch', 'utf8');
const additions = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');

test('live patch cycles through existing non-Reddit platforms without changing volume settings or adding channels', () => {
  assert.match(additions, /% personalSocialFocusedQueries_\(lane\)\.length/);
  assert.match(additions, /% personalSocialFocusedQueries_\(meta\.lane\)\.length/);
  assert.match(additions, /platformIndex<5/);
  assert.match(additions, /\['linkedin.com\/posts','x.com','facebook.com','instagram.com','tiktok.com'\]/);
  assert.doesNotMatch(additions, /newTrigger|deleteTrigger|discoveryMaxBatchesPerRun\s*[:=]|discoveryGroundedCallCapPerDay\s*[:=]|Pinterest|site:threads/);
});

test('discovered Social records cannot become generic public response actions or first-party prospects', () => {
  assert.match(additions, /personalNormalise_\(lane\) === 'social\/community intent'\) return/);
  assert.match(additions, /Discovered public discussions are CONTENT_SIGNAL demand intelligence only, never Personal prospects/);
  const classifier = additions.match(/function personalDiscoveryActionType_\(url\) \{[^\n]+/)[0];
  const scope = { personalIsDirectPublicDiscussionUrl_: url => /linkedin.com\/posts\//.test(url) };
  vm.runInNewContext(classifier, scope);
  assert.equal(scope.personalDiscoveryActionType_('https://linkedin.com/posts/discussion', 'PUBLIC_RESPONSE', { publicEngagementSurfaceVerified: true }), 'CONTENT_SIGNAL');
  assert.equal(scope.personalDiscoveryActionType_('https://reddit.com/r/example/comments/thread'), null);
  assert.equal(scope.personalDiscoveryActionType_('https://example.com/article'), null);
  assert.doesNotMatch(additions, /first_party_interaction\s*[:=]/);
});

test('undated content freshness requires content evidence rather than an individual prepared reply', () => {
  assert.match(additions, /typeof evidence\.contentAngle==='string'/);
  assert.match(additions, /typeof evidence\.assetType==='string'/);
  assert.doesNotMatch(additions, /personalSafeOpsReply_\(evidence\.preparedReply\)/);
  assert.match(additions, /content_draft:'Draft'/);
});

test('live audit logs only aggregate evidence and performs no writes, discovery or external request', () => {
  const logs = [];
  const config = { organisation_id: '78fa2ac8-e7b6-4b9b-9604-035723ece6b1', source_engine: 'root_health_personal', spreadsheet_id: '1ZfyIebRh6G8HkuJrM6cizPocd8oBh3Cu1u_Lh9M2UAM', sheets: [{ name: 'Social Queue', metadata: { content_draft: 'Draft' } }] };
  const headers = ['Social ID', 'Source URL', 'Platform', 'Mode'];
  const rows = [headers, ['fixture-only', 'https://reddit.com/r/example/comments/thread', 'reddit.com', 'CONTENT_SIGNAL']];
  const scope = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'OPS_STATE_SYNC_CONFIG' ? JSON.stringify(config) : key === 'OPS_STATE_SYNC_SECRET' ? 'fixture-only-secret-12345678901234567890' : null, setProperty: () => { throw Error('Write prohibited'); } }) },
    personalSpreadsheet_: () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }) }) }),
    personalReadSettings_: () => ({ discoveryGroundedCallCapPerDay: 3, discoveryMaxBatchesPerRun: 1, discoveryRequestedPerBatch: 1, socialVariantsPerSource: 1 }),
    personalReadSearchLanes_: () => [{ lane: 'Social/community intent' }],
    personalNormalise_: value => value.toLowerCase(), personalSocialFocusedQueries_: () => ['site:linkedin.com/posts "fixture"'],
    personalReadSocialCandidates_: () => [], personalIsDirectPublicDiscussionUrl_: () => false, personalDiscoveryActionType_: () => 'CONTENT_SIGNAL',
    opsVerifiedSocialRow_: () => false,
    ScriptApp: { getProjectTriggers: () => [{ getHandlerFunction: () => 'personalRunPartnerAutopilot', getEventType: () => 'CLOCK' }] },
    Logger: { log: value => logs.push(value) },
  };
  vm.runInNewContext(fs.readFileSync('docs/personal-acquisition-readonly-audit.gs', 'utf8'), scope);
  const result = scope.personalAuditAcquisitionAlignmentReadOnly();
  assert.equal(result.socialQueue.redditHistorical, 1);
  assert.equal(result.socialQueue.eligibleAudienceIntelligence, 0);
  assert.equal(result.socialQueue.personalProspectsFromDiscovery, 0);
  assert.equal(result.sheetWrites, 0); assert.equal(result.opsExports, 0);
  assert.doesNotMatch(logs[0], /fixture-only|reddit\.com|sourceUrl|originalPost/);
});

test('controlled Social diagnostic performs one write-free query with no Reddit override or export', () => {
  let calls = 0;
  const logs = [];
  const scope = { personalResearchOpportunities: options => {
    calls++;
    assert.equal(options.socialOnly, true); assert.equal(options.queryLimit, 1);
    assert.equal(options.writeFree, true); assert.equal(options.redditOnly, undefined);
    options.diagnostics.braveResults = 10;
    options.diagnostics.queryTemplates = [{ query: 'untrusted-source-context' }];
  }, Logger: { log: value => logs.push(value) } };
  vm.runInNewContext(fs.readFileSync('docs/personal-acquisition-readonly-audit.gs', 'utf8'), scope);
  const result = scope.personalTestOneSocialDiscoveryReadOnly();
  assert.equal(calls, 1); assert.equal(result.braveResults, 10);
  assert.equal(result.queryTemplates, undefined);
  assert.doesNotMatch(logs[0], /untrusted-source-context/);
  assert.match(logs[0], /"rowsWritten":0,"opsExports":0,"outboundActions":0/);
});
