/* Add to the EXISTING Corporate/B2B Gmail Apps Script after the Ops PR is deployed.
 * No trigger installation, sending, labels, or personal discovery changes.
 * Calls the existing tenant-scoped ingestion credentials, never logs them.
 */
function runLinkedInRecommendationIntake() {
  const props = PropertiesService.getScriptProperties();
  const organisationId = String(props.getProperty('OPS_ORGANISATION_ID') || '').trim();
  const secret = String(props.getProperty('OPS_INGESTION_SECRET') || '');
  if (organisationId !== PHASE4D_EXPECTED_ORGANISATION_ID_ || secret.length < 32) throw new Error('LINKEDIN_INTAKE_NOT_CONFIGURED');
  const query = 'newer_than:14d from:(linkedin.com) {subject:"you may know" subject:connections subject:"popular in your network"}';
  const threads = GmailApp.search(query, 0, 50);
  let messages = 0, inserted = 0, skipped = 0, failed = 0;
  threads.forEach(function(thread) { thread.getMessages().forEach(function(message) {
    if (message.getDate().getTime() < Date.now() - 14 * 24 * 60 * 60 * 1000) return;
    if (isLinkedInAcceptanceMessage_(message)) return;
    const subject = String(message.getSubject() || '');
    if (!/someone at .+ you may know|people you may know|connections, experience, and more|popular in your network/i.test(subject)) return;
    messages++;
    try {
      const response = UrlFetchApp.fetch('https://roothealthops.com/api/growth/linkedin-connections/recommendations', {
        method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true,
        payload: JSON.stringify({ organisation_id: organisationId, source_engine: 'root_health_b2b', sender: String(message.getFrom()), subject: subject,
          html: String(message.getBody()), gmail_message_id: String(message.getId()), discovered_at: message.getDate().toISOString() })
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('HTTP_' + response.getResponseCode());
      const result = JSON.parse(response.getContentText());
      if (result.success !== true) throw new Error('IMPORT_NOT_CONFIRMED');
      inserted += Number(result.inserted || 0); skipped += Number(result.skipped || 0);
    } catch (error) { failed++; Logger.log('LINKEDIN_RECOMMENDATION_IMPORT_FAILED'); }
  }); });
  const result = { messages: messages, inserted: inserted, skipped: skipped, failed: failed };
  Logger.log(JSON.stringify(result)); return result;
}
