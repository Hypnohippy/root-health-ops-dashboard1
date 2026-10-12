/** Add this file only AFTER the Ops notification endpoint is deployed.
 * Uses existing OPS_ORGANISATION_ID / OPS_INGESTION_SECRET properties.
 * No trigger, label, invitation, send or acceptance/recommendation parser changes.
 */
function runLinkedInMessageNotificationIntake() {
  const props = PropertiesService.getScriptProperties();
  const organisationId = String(props.getProperty('OPS_ORGANISATION_ID') || '').trim();
  const secret = String(props.getProperty('OPS_INGESTION_SECRET') || '');
  if (organisationId !== PHASE4D_EXPECTED_ORGANISATION_ID_ || secret.length < 32) throw new Error('LINKEDIN_MESSAGE_INTAKE_NOT_CONFIGURED');
  const threads = GmailApp.search('newer_than:14d from:(messaging-digest-noreply@linkedin.com OR messaging-digest-noreply@e.linkedin.com) subject:"just messaged you"', 0, 50);
  const result = { examined: 0, imported: 0, duplicates: 0, failed: 0 };
  threads.forEach(function(thread) {
    rootGetThreadMessages_(thread).forEach(function(message) {
      const sender = String(message.getFrom() || '');
      const subject = String(message.getSubject() || '');
      if (!/(?:<|^)messaging-digest-noreply@(?:e\.)?linkedin\.com(?:>|$)/i.test(sender) || !/^.{1,200} just messaged you[.!]?$/i.test(subject)) return;
      result.examined++;
      try {
        const response = UrlFetchApp.fetch('https://roothealthops.com/api/growth/linkedin-connections/message-notifications', {
          method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + secret },
          payload: JSON.stringify({ organisation_id: organisationId, source_engine: 'root_health_b2b',
            sender: sender, subject: subject, html: String(message.getBody() || ''),
            gmail_message_id: String(message.getId() || ''), received_at: message.getDate().toISOString() }), muteHttpExceptions: true
        });
        if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('LINKEDIN_MESSAGE_INTAKE_REJECTED');
        const body = JSON.parse(response.getContentText() || '{}');
        if (!body.success) throw new Error('LINKEDIN_MESSAGE_INTAKE_REJECTED');
        if (body.duplicate) result.duplicates++; else result.imported++;
      } catch (error) { result.failed++; }
    });
  });
  Logger.log('LINKEDIN_MESSAGE_NOTIFICATIONS: ' + JSON.stringify(result)); // Counts only.
  return result;
}

/** Add ONLY this call inside existing runLinkedInAcceptanceIntake_(), before return acceptances:
 *
 * if (typeof runLinkedInMessageNotificationIntake === 'function') {
 *   try { acceptances.messageNotifications = runLinkedInMessageNotificationIntake(); }
 *   catch (error) { acceptances.messageNotifications = { failed: 1 }; Logger.log('LINKEDIN_MESSAGE_INTAKE_UNAVAILABLE'); }
 * }
 *
 * Existing runLinkedInAcceptanceIntake Head timer remains unchanged. Do not add a timer.
 */
