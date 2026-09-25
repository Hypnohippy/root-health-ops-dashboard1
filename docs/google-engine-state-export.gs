/** Optional, manual-only adapter. Add as a separate file after verifying sheet mappings.
 * No triggers, writes, Gmail, message generation, approvals or existing engine hooks.
 * Configuration is in Script Properties; never log credentials or payloads.
 */
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
    var required = [mapping.id_header].concat(Object.values(mapping.fields || {}), Object.values(mapping.state || {}), Object.values(mapping.safety || {}), Object.values(mapping.metadata || {})).flat();
    if (!mapping.id_header || required.some(function(header) { return headers.indexOf(header) < 0 || headers.indexOf(header) !== headers.lastIndexOf(header); })) throw new Error('Missing or duplicate mapped source header.');
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
      var id = read(mapping.id_header);
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
