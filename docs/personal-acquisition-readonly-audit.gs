/** Manual read-only alignment evidence. No discovery, generation, source HTTP,
 * Ops requests, sheet/property writes, trigger changes or outbound actions.
 * Logs counts and configuration booleans only; never text, identities or secrets.
 */
function personalAuditAcquisitionAlignmentReadOnly() {
  var props = PropertiesService.getScriptProperties();
  var config = JSON.parse(props.getProperty('OPS_STATE_SYNC_CONFIG') || '{}');
  var mapping = (config.sheets || []).filter(function(m) { return m.name === 'Social Queue'; })[0];
  var sheet = personalSpreadsheet_().getSheetByName('Social Queue');
  var values = sheet ? sheet.getDataRange().getValues() : [];
  var headers = (values.shift() || []).map(function(v) { return String(v).trim(); });
  var counts = { rows: 0, redditHistorical: 0, eligibleAudienceIntelligence: 0,
    personalProspectsFromDiscovery: 0, skippedUnverified: 0, modes: {} };
  values.forEach(function(row) {
    if (row.every(function(v) { return v === ''; })) return;
    counts.rows++;
    function read(header) { var at = headers.indexOf(header); return at < 0 || row[at] == null ? '' : row[at]; }
    var url = String(read('Source URL'));
    var reddit = /^https:\/\/(?:[^/]+\.)?(?:reddit\.com|redd\.it)(?:[/:?#]|$)/i.test(url) || /^(?:reddit(?:\.com)?|redd\.it)$/i.test(String(read('Platform')));
    if (reddit) counts.redditHistorical++;
    var mode = String(read('Mode')); counts.modes[mode] = (counts.modes[mode] || 0) + 1;
    if (mapping && opsVerifiedSocialRow_(read, mapping)) counts.eligibleAudienceIntelligence++;
    else counts.skippedUnverified++;
  });
  var cfg = personalReadSettings_();
  var socialLanes = personalReadSearchLanes_().filter(function(l) { return personalNormalise_(l.lane) === 'social/community intent'; });
  var focused = socialLanes.reduce(function(all, lane) { return all.concat(personalSocialFocusedQueries_(lane)); }, []);
  var candidates = personalReadSocialCandidates_();
  var result = {
    readOnly: true, searches: 0, generations: 0, sheetWrites: 0, opsExports: 0, outboundActions: 0,
    configuration: {
      personalEngine: config.source_engine === 'root_health_personal',
      tenantMatches: config.organisation_id === '78fa2ac8-e7b6-4b9b-9604-035723ece6b1',
      spreadsheetMatches: config.spreadsheet_id === '1ZfyIebRh6G8HkuJrM6cizPocd8oBh3Cu1u_Lh9M2UAM',
      socialQueueOnly: !!mapping && config.sheets.length === 1,
      draftMapped: !!mapping && mapping.metadata.content_draft === 'Draft',
      syncSecretConfigured: (props.getProperty('OPS_STATE_SYNC_SECRET') || '').length >= 32,
      braveConfigured: !!props.getProperty('BRAVE_SEARCH_API_KEY')
    },
    limits: { dailyCap: cfg.discoveryGroundedCallCapPerDay, maxBatches: cfg.discoveryMaxBatchesPerRun,
      requestedPerBatch: cfg.discoveryRequestedPerBatch, socialVariants: cfg.socialVariantsPerSource },
    activeSocialLanes: socialLanes.length, focusedQueries: focused.length,
    redditFocusedQueries: focused.filter(function(q) { return /reddit\.com|redd\.it/i.test(q); }).length,
    directRedditAccepted: personalIsDirectPublicDiscussionUrl_('https://www.reddit.com/r/example/comments/example/thread'),
    discoveredLinkedInAction: personalDiscoveryActionType_('https://www.linkedin.com/posts/example-discussion'),
    socialCandidates: candidates.length,
    redditCandidates: candidates.filter(function(c) { return /reddit\.com|redd\.it/i.test(c.sourceUrl); }).length,
    publicResponseCandidates: candidates.filter(function(c) { return personalDiscoveryActionType_(c.sourceUrl) === 'PUBLIC_RESPONSE'; }).length,
    socialQueue: counts,
    triggers: ScriptApp.getProjectTriggers().map(function(t) { return { handler: t.getHandlerFunction(), event: String(t.getEventType()) }; })
  };
  Logger.log(JSON.stringify(result));
  return result;
}
