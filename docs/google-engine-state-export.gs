/** Optional, manual-only adapter. Add as a separate file after verifying sheet mappings.
 * No triggers, writes, Gmail, message generation, approvals or existing engine hooks.
 * Configuration is in Script Properties; never log credentials or payloads.
 */
function opsStableB2BSourceId_(organisation, email, sourceUrl) {
  // Exact existing rootOpsStableLeadId_ rule: trim/lowercase each input; no URL rewriting.
  var input = [organisation, email, sourceUrl].map(function(value) { return String(value == null ? '' : value).trim().toLowerCase(); }).join('|');
  return 'b2b-' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
}

// Apps Script has no browser URL API. Keep this fail-closed host/path guard in
// parity with personalSignal() and the Personal acquisition RPC. Never fetch or
// resolve grounding redirects; query parameters cannot supply a post path.
function opsDirectSocialDiscussion_(value) {
  var parts = String(value == null ? '' : value).match(/^https:\/\/([A-Za-z0-9.-]+)(:443)?(\/[^?#\s\\]*)(\?[^#\s\\]*)?(#[^\s\\]*)?$/i);
  if (!parts) return false;
  var host = parts[1].toLowerCase().replace(/^(www|m)\./, '');
  var path = parts[3];
  if (['reddit.com', 'old.reddit.com', 'new.reddit.com'].indexOf(host) >= 0) return /\/comments\/[^/]+/.test(path);
  if (host === 'facebook.com') return /\/(posts|videos|reel)\/[^/]+/.test(path) || (/\/(permalink|story)\.php$/.test(path) && /[?&]story_fbid=[^&#]+/.test(parts[4] || ''));
  if (host === 'instagram.com') return /^\/(p|reel)\/[^/]+/.test(path);
  if (['threads.net', 'threads.com'].indexOf(host) >= 0) return /\/post\/[^/]+/.test(path);
  if (['x.com', 'twitter.com'].indexOf(host) >= 0) return /\/status\/[^/]+/.test(path);
  if (host === 'linkedin.com') return /\/posts\/[^/]+|\/feed\/update\/urn:li:/.test(path);
  if (host === 'tiktok.com') return /\/video\/[^/]+/.test(path);
  return false;
}
function opsExplicitSocialBoolean_(value) {
  if (value === true || value === false) return value;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return null;
}
function opsVerifiedSocialRow_(read, mapping) {
  var id = read(mapping.id_header);
  return id != null && String(id).trim() !== '' &&
    opsDirectSocialDiscussion_(read(mapping.fields.source_url)) &&
    String(read(mapping.metadata.original_post)).trim() !== '' &&
    String(read(mapping.metadata.prepared_reply)).trim() !== '' &&
    !/search.?demand|article|blog|partner|referr/i.test(String(read(mapping.state.opportunity_type))) &&
    opsExplicitSocialBoolean_(read(mapping.safety.public_context)) === true &&
    opsExplicitSocialBoolean_(read(mapping.safety.consumer_outreach)) === false &&
    opsExplicitSocialBoolean_(read(mapping.safety.health_targeting)) === false &&
    opsExplicitSocialBoolean_(read(mapping.safety.verified_direct_discussion)) === true;
}

function opsExportEngineState() {
  var properties = PropertiesService.getScriptProperties();
  var config = JSON.parse(properties.getProperty('OPS_STATE_SYNC_CONFIG') || '{}');
  var secret = properties.getProperty('OPS_STATE_SYNC_SECRET');
  if (!secret || secret.length < 32 || !config.organisation_id ||
      ['root_health_b2b', 'root_health_personal'].indexOf(config.source_engine) < 0 || !Array.isArray(config.sheets) || !config.sheets.length) {
    throw new Error('Missing Ops state sync configuration.');
  }
  var book = SpreadsheetApp.openById(config.spreadsheet_id);
  var records = [];
  var pending = [];
  var observedAt = new Date().toISOString();
  config.sheets.forEach(function(mapping) {
    if (Array.isArray(mapping.pending) && mapping.pending.length) {
      pending.push({ sheet: mapping.name, pending: mapping.pending });
      return;
    }
    var allowedFields = ['source_url', 'evidence', 'entity', 'person', 'company', 'reason', 'signal', 'suggested_action'];
    if (Object.keys(mapping.fields || {}).some(function(field) { return allowedFields.indexOf(field) < 0; })) throw new Error('Unsupported acquisition field mapping.');
    var sheet = book.getSheetByName(mapping.name);
    if (!sheet) throw new Error('Configured source sheet is missing.');
    var rows = sheet.getDataRange().getValues();
    if (!rows.length) return;
    var headers = rows[0].map(function(value) { return String(value).trim(); });
    var hashId = mapping.id_rule === 'rootOpsStableLeadId_';
    if (mapping.id_rule && !hashId) throw new Error('Unsupported source ID rule.');
    if (hashId && (config.source_engine !== 'root_health_b2b' || mapping.id_prefix || mapping.id_header)) throw new Error('B2B ID rule cannot be combined with another identity format.');
    var required = (hashId ? ['Organisation', 'Email', 'Source URL'] : [mapping.id_header]).concat(Object.values(mapping.fields || {}), Object.values(mapping.state || {}), Object.values(mapping.safety || {}), Object.values(mapping.metadata || {})).flat();
    if ((!hashId && !mapping.id_header) || required.some(function(header) { return headers.indexOf(header) < 0 || headers.indexOf(header) !== headers.lastIndexOf(header); })) throw new Error('Missing or duplicate mapped source header.');
    var socialQueue = config.source_engine === 'root_health_personal' && mapping.name === 'Social Queue';
    var skippedSocialRows = 0;
    rows.slice(1).forEach(function(row) {
      if (row.every(function(value) { return value === ''; })) return;
      // Ordered fallbacks use the first populated verified column, never guessed headers.
      function read(header) {
        var candidates = Array.isArray(header) ? header : [header];
        for (var i = 0; i < candidates.length; i++) {
          var candidate = row[headers.indexOf(candidates[i])];
          if (candidate !== '' && candidate != null) return candidate;
        }
        return '';
      }
      // Legacy rows are not evidence. Skip before identity/safety conversion so
      // one unverified Social row cannot abort verified rows or other queues.
      if (socialQueue && !opsVerifiedSocialRow_(read, mapping)) { skippedSocialRows++; return; }
      if (hashId && !read('Organisation') && !read('Email') && !read('Source URL')) throw new Error('Source record has no stable identity evidence.');
      var id = hashId ? opsStableB2BSourceId_(read('Organisation'), read('Email'), read('Source URL')) : read(mapping.id_header);
      if (id === '' || id == null) throw new Error('Source record has no stable identifier.');
      var record = { source_engine: config.source_engine, source_record_id: (mapping.id_prefix || '') + String(id), record_type: mapping.record_type,
        observed_at: observedAt, state: {}, metadata: { sheet_tab: mapping.name } };
      Object.keys(mapping.fields || {}).forEach(function(field) { var value = read(mapping.fields[field]); record[field] = value === '' ? null : String(value); });
      Object.keys(mapping.state || {}).forEach(function(field) {
        var value = read(mapping.state[field]);
        record.state[field] = value === '' ? null : value instanceof Date ? value.toISOString() : String(value);
      });
      Object.keys(mapping.metadata || {}).forEach(function(field) {
        if (field === 'sheet_tab' || field === 'engine_safety') throw new Error('Reserved metadata field.');
        var value = read(mapping.metadata[field]);
        record.metadata[field] = value === '' ? null : value instanceof Date ? value.toISOString() : String(value);
      });
      if (config.source_engine === 'root_health_personal') {
        record.safety = {};
        Object.keys(mapping.safety || {}).forEach(function(field) {
          var value = read(mapping.safety[field]);
          if (value === true || value === false) record.safety[field] = value;
          else if (String(value).toLowerCase() === 'true') record.safety[field] = true;
          else if (String(value).toLowerCase() === 'false') record.safety[field] = false;
          else throw new Error('Personal safety evidence must be an explicit boolean.');
        });
      }
      records.push(record);
    });
    if (socialQueue && skippedSocialRows) pending.push({ sheet: mapping.name, skipped_unverified_rows: skippedSocialRows });
  });
  // Validate the entire local export before the first request; never infer stable IDs.
  var seen = Object.create(null);
  records.forEach(function(record) { if (seen[record.source_record_id]) throw new Error('Duplicate stable source ID in export.'); seen[record.source_record_id] = true; });
  var results = pending.slice();
  for (var offset = 0; offset < records.length; offset += 25) {
    var payload = JSON.stringify({ organisation_id: config.organisation_id, records: records.slice(offset, offset + 25) });
    if (Utilities.newBlob(payload).getBytes().length > 262144) throw new Error('Export batch exceeds Ops payload limit.');
    var response = UrlFetchApp.fetch('https://roothealthops.com/api/growth/engine-state', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + secret },
      payload: payload, muteHttpExceptions: true, followRedirects: false,
    });
    if (response.getResponseCode() !== 200) throw new Error('Ops state sync failed with HTTP ' + response.getResponseCode() + '. Stop and inspect the receiver; earlier batches may have applied.');
    var result = JSON.parse(response.getContentText());
    if (result.success !== true) throw new Error('Ops did not acknowledge state sync.');
    results.push({ received: result.received, inserted: result.inserted, updated: result.updated, duplicates: result.duplicates, stale: result.stale, conflicts: result.conflicts });
  }
  return results;
}
