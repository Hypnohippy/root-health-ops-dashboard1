/* Add as a separate file in the existing Root Health Lead Engine. No trigger installer.
 * Call runOpsGmailReplyIntake() after scheduledConversationEngine's existing try/catch.
 */
function opsGmailReplyConfig_(verifyAliases) {
  const props = PropertiesService.getScriptProperties();
  const organisationId = String(props.getProperty('OPS_ORGANISATION_ID') || '').trim();
  const secret = String(props.getProperty('OPS_INGESTION_SECRET') || '').trim();
  if (organisationId !== '78fa2ac8-e7b6-4b9b-9604-035723ece6b1' || secret.length < 32) throw new Error('OPS_REPLY_CONFIG');
  let account;
  let ownAddresses;
  if (verifyAliases === true) {
    account = String(Gmail.Users.getProfile('me').emailAddress || '').trim().toLowerCase();
    if (!account || opsGmailReplyAddresses_(account)[0] !== account) throw new Error('OPS_REPLY_ACCOUNT');
    ownAddresses = [account].concat(GmailApp.getAliases())
      .map(function(value) { return String(value || '').trim().toLowerCase(); }).filter(Boolean);
  } else {
    const verified = JSON.parse(props.getProperty('OPS_GMAIL_REPLY_VERIFIED_IDENTITY') || 'null');
    if (!verified || verified.version !== 2 || verified.mailbox !== 'enquiries@roothealth.app' || verified.organisationId !== organisationId ||
        typeof verified.account !== 'string' || opsGmailReplyAddresses_(verified.account)[0] !== verified.account ||
        !Array.isArray(verified.ownAddresses) || !verified.ownAddresses.every(function(value) { return typeof value === 'string' && value.length > 0; }) ||
        verified.ownAddresses.indexOf(verified.account) === -1) throw new Error('OPS_REPLY_VERIFICATION_REQUIRED');
    account = verified.account;
    ownAddresses = verified.ownAddresses;
  }
  if (ownAddresses.indexOf('enquiries@roothealth.app') === -1) throw new Error('OPS_REPLY_MAILBOX');
  return { organisationId: organisationId, secret: secret, account: account, ownAddresses: ownAddresses };
}

function opsGmailReplyPost_(config, records) {
  const payload = JSON.stringify({ organisation_id: config.organisationId, source_engine: 'root_health_b2b', records: records });
  if (Utilities.newBlob(payload).getBytes().length > 262144) throw new Error('OPS_REPLY_SIZE');
  return UrlFetchApp.fetch('https://roothealthops.com/api/responses/email/ingest', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + config.secret },
    payload: payload, muteHttpExceptions: true, followRedirects: false
  });
}

/* No mail is read/sent, no rows inserted, no triggers changed.
 * Refreshes the account/org-bound alias snapshot only after both checks pass.
 * A nonempty records array reaches auth, then fails required message-field validation.
 */
function testOpsGmailReplyIntakeSafe() {
  const result = { ok: false, configuration: false, receiverAuthenticated: false };
  try {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty('OPS_GMAIL_REPLY_VERIFIED_IDENTITY');
    const config = opsGmailReplyConfig_(true);
    result.configuration = true;
    const response = opsGmailReplyPost_(config, [{}]);
    result.httpStatus = response.getResponseCode();
    const body = JSON.parse(response.getContentText());
    result.receiverAuthenticated = result.httpStatus === 400 && body.error === 'Invalid email response field.';
    if (result.receiverAuthenticated) {
      props.setProperty('OPS_GMAIL_REPLY_VERIFIED_IDENTITY', JSON.stringify({
        version: 2, organisationId: config.organisationId, mailbox: 'enquiries@roothealth.app', account: config.account, ownAddresses: config.ownAddresses
      }));
      result.ok = true;
    }
  } catch (error) { /* Never log provider exceptions or response bodies. */ }
  Logger.log('OPS GMAIL REPLY SAFE TEST: ' + JSON.stringify(result));
  return result;
}

function runOpsGmailReplyIntake() {
  const result = { ok: true, enabled: false, threads: 0, scanned: 0, forwarded: 0, duplicate: 0, skipped: 0, failed: 0, scanLimitReached: false };
  const started = Date.now();
  try {
    result.enabled = PropertiesService.getScriptProperties().getProperty('OPS_GMAIL_REPLY_INTAKE_ENABLED') === 'true';
    if (result.enabled) {
      const config = opsGmailReplyConfig_();
      const threads = GmailApp.search('to:enquiries@roothealth.app newer_than:14d -in:spam -in:trash', 0, 50);
      result.threads = threads.length;
      result.scanLimitReached = threads.length === 50;
      const cutoff = new Date(started - 14 * 86400000);
      const seen = new Set();
      scan: for (const thread of threads) {
        if (Date.now() - started >= 45000) { result.scanLimitReached = true; break; }
        let messages, excluded;
        try {
          excluded = thread.isInSpam() || thread.isInTrash();
          messages = thread.getMessages().slice().reverse();
        } catch (error) { result.failed++; continue; }
        for (const message of messages) {
          // Bound added work in the shared invocation. In-flight calls may exceed this soft time budget.
          if (result.scanned >= 100 || Date.now() - started >= 45000) { result.scanLimitReached = true; break scan; }
          try {
            const id = String(message.getId());
            if (seen.has(id)) continue;
            seen.add(id);
            result.scanned++;
            const record = excluded ? null : opsGmailReplyRecord_(message, thread.getId(), config.ownAddresses, cutoff);
            if (!record) { result.skipped++; continue; }
            const response = opsGmailReplyPost_(config, [record]);
            const status = response.getResponseCode();
            if (status < 200 || status >= 300) throw new Error('OPS_REPLY_HTTP');
            const reply = JSON.parse(response.getContentText());
            if (reply.success !== true || reply.received !== 1 ||
                !((reply.inserted === 1 && reply.duplicates === 0) || (reply.inserted === 0 && reply.duplicates === 1))) throw new Error('OPS_REPLY_ACK');
            result.forwarded += reply.inserted;
            result.duplicate += reply.duplicates;
          } catch (error) { result.failed++; }
        }
      }
    }
  } catch (error) { result.failed++; }
  result.ok = result.failed === 0;
  Logger.log('OPS GMAIL REPLY INTAKE: ' + JSON.stringify(result));
  return result;
}

function opsGmailReplyAddresses_(value) {
  return (String(value || '').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
    .map(function(address) { return address.toLowerCase(); });
}

function opsGmailReplyRecord_(message, threadId, ownAddresses, cutoff) {
  if (message.isDraft() || message.isInTrash() || message.getDate() < cutoff) return null;
  const senders = opsGmailReplyAddresses_(message.getFrom());
  const recipients = opsGmailReplyAddresses_(message.getTo()).concat(opsGmailReplyAddresses_(message.getCc()));
  if (senders.length !== 1 || ownAddresses.indexOf(senders[0]) !== -1 || recipients.indexOf('enquiries@roothealth.app') === -1) return null;
  const inReplyTo = String(message.getHeader('In-Reply-To') || '').trim();
  if (!/^<[^<>\s]+@[^<>\s]+>(?:\s+<[^<>\s]+@[^<>\s]+>)*$/.test(inReplyTo)) return null;
  const body = String(message.getPlainBody() || '').trim();
  const subject = String(message.getSubject() || '');
  if (!body || body.length > 50000 || subject.length > 1000 || inReplyTo.length > 500) throw new Error('OPS_REPLY_SIZE');
  return {
    message_id: String(message.getId()), thread_id: String(threadId), in_reply_to: inReplyTo,
    sender_email: senders[0], subject: subject, body: body, received_at: message.getDate().toISOString(),
    metadata: { source: 'gmail_reply_intake', recipient: 'enquiries@roothealth.app' }
  };
}
