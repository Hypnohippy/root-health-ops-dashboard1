/* REVIEW SOURCE ONLY. Not installed. Requires separately authorised versioned deployment/configuration.
 * Existing doPost delta (before any existing send/intake dispatch):
 *   const advisorEnvelope = JSON.parse(e.postData.contents || '{}');
 *   if (Object.prototype.hasOwnProperty.call(advisorEnvelope, 'payload') ||
 *       Object.prototype.hasOwnProperty.call(advisorEnvelope, 'signature')) return rootAdvisorMailboxPost_(e);
 * No second doPost, no doGet, no timer/worker changes. Malformed adapter envelopes never fall through.
 */
function rootAdvisorMailboxPost_(e) {
  try {
    if (!e || !e.postData || e.postData.type !== 'application/json' || e.postData.contents.length > 8192) throw Error('REQUEST');
    const envelope = JSON.parse(e.postData.contents);
    if (Object.keys(envelope).sort().join(',') !== 'payload,signature' || typeof envelope.payload !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature)) throw Error('ENVELOPE');
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('ROOT_ADVISOR_MAILBOX_SIGNING_KEY');
    if (!key || key.length < 32) throw Error('DISABLED');
    const expected = Utilities.computeHmacSha256Signature(envelope.payload, key).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    let mismatch = 0; for (let i = 0; i < 64; i++) mismatch |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (mismatch) throw Error('AUTH');
    const request = JSON.parse(envelope.payload), now = Date.now(), lookup = request.lookup;
    if (Object.keys(request).sort().join(',') !== 'audience,expiresAt,issuedAt,issuer,keyId,lookup,nonce,purpose,version' || request.version !== 1 || request.purpose !== 'root_advisor_mailbox' || request.issuer !== 'root_ops' || request.audience !== 'root_mailbox' || request.keyId !== props.getProperty('ROOT_ADVISOR_MAILBOX_KEY_ID') || !Number.isFinite(request.issuedAt) || !Number.isFinite(request.expiresAt) || request.issuedAt > now + 5000 || request.expiresAt <= now || request.expiresAt - request.issuedAt > 30000 || request.expiresAt <= request.issuedAt || !/^[a-f0-9-]{36}$/i.test(request.nonce)) throw Error('AUTH');
    if (!lookup || Object.keys(lookup).some(function(k) { return ['organisationId','account','relationshipLocator','operation','emails','threadIds','selectedThreadId'].indexOf(k) === -1; }) || lookup.organisationId !== props.getProperty('ROOT_ADVISOR_MAILBOX_ORGANISATION_ID') || lookup.account !== props.getProperty('ROOT_ADVISOR_MAILBOX_ACCOUNT') || !lookup.organisationId || !lookup.account || !/^(inbox|target|acquisition|founder|workspace)_[a-f0-9-]{36}$/i.test(lookup.relationshipLocator) || ['candidates','thread'].indexOf(lookup.operation) === -1) throw Error('BINDING');
    const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    if (!Array.isArray(lookup.emails) || !lookup.emails.length || lookup.emails.length > 5 || lookup.emails.some(function(v) { return typeof v !== 'string' || !emailPattern.test(v); }) || !Array.isArray(lookup.threadIds) || lookup.threadIds.length > 5 || lookup.threadIds.some(function(v) { return !/^[a-f0-9]{1,64}$/i.test(v); })) throw Error('IDENTITY');
    if (lookup.operation === 'thread' && (!/^[a-f0-9]{1,64}$/i.test(lookup.selectedThreadId) || lookup.threadIds.length && lookup.threadIds.indexOf(lookup.selectedThreadId) === -1)) throw Error('THREAD');
    const own = String(props.getProperty('ROOT_ADVISOR_MAILBOX_OWN_ADDRESSES') || '').split(',').map(function(s) { return s.trim().toLowerCase(); });
    if (own.indexOf(lookup.account) === -1 || own.some(function(v) { return !emailPattern.test(v); }) || lookup.emails.some(function(v) { return own.indexOf(v) !== -1; })) throw Error('ACCOUNT');
    const verified = JSON.parse(props.getProperty('OPS_GMAIL_REPLY_VERIFIED_IDENTITY') || 'null');
    if (!verified || verified.version !== 2 || verified.organisationId !== lookup.organisationId || verified.account !== lookup.account || !Array.isArray(verified.ownAddresses) || own.some(function(address) { return verified.ownAddresses.indexOf(address) === -1; })) throw Error('ACCOUNT');
    // Security-only nonce metadata; no message bodies or operational records are persisted.
    const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) throw Error('BUSY');
    try {
      const nonceKey = 'ROOT_ADVISOR_NONCE_' + request.nonce, all = props.getProperties();
      if (props.getProperty(nonceKey)) throw Error('REPLAY');
      const keys = Object.keys(all).filter(function(k) { return k.indexOf('ROOT_ADVISOR_NONCE_') === 0; });
      keys.forEach(function(k) { if (Number(all[k]) <= now) props.deleteProperty(k); });
      if (keys.filter(function(k) { return Number(all[k]) > now; }).length >= 100) throw Error('BUSY');
      props.setProperty(nonceKey, String(request.expiresAt + 5000));
    } finally { lock.releaseLock(); }
    // Authentication and bindings precede EVERY Gmail call.
    if (String(Gmail.Users.getProfile('me').emailAddress || '').toLowerCase() !== lookup.account) throw Error('ACCOUNT');
    const candidates = [], messages = []; let partial = false;
    let ids = lookup.threadIds.slice();
    if (!ids.length) {
      const query = '{' + lookup.emails.map(function(email) { return 'from:"' + email + '" to:"' + email + '"'; }).join(' ') + '} -in:spam -in:trash';
      const found = Gmail.Users.Threads.list('me', { q: query, maxResults: 6 });
      ids = (found.threads || []).map(function(t) { return t.id; }); partial = !!found.nextPageToken || ids.length > 5; ids = ids.slice(0, 5);
    }
    // Thread selection is re-discovered from the same constrained identities on every call.
    if (lookup.operation === 'thread' && ids.indexOf(lookup.selectedThreadId) === -1) throw Error('THREAD');
    for (let i = 0; i < ids.length; i++) {
      if (lookup.operation === 'thread' && ids[i] !== lookup.selectedThreadId) continue;
      const thread = Gmail.Users.Threads.get('me', ids[i], { format: lookup.operation === 'thread' ? 'full' : 'metadata', metadataHeaders: ['From','To','Cc','Bcc','Subject'] });
      const entries = thread.messages || []; if (!entries.length) continue;
      const checked = entries.map(function(m) { return rootAdvisorMailboxMessage_(m, lookup.emails, own, lookup.operation === 'thread'); });
      // Do not return bodies OR subjects from ambiguous/group/unexpected-participant threads.
      if (checked.some(function(m) { return !m || m.gmailThreadId !== ids[i]; })) { partial = true; continue; }
      checked.sort(function(a,b) { return a.sentAt.localeCompare(b.sentAt); });
      candidates.push({ threadId: ids[i], subject: checked[checked.length - 1].subject.slice(0,1000), latestAt: checked[checked.length - 1].sentAt });
      if (lookup.operation === 'thread') {
        if (checked.length > 20) partial = true;
        checked.slice(-20).forEach(function(m) { delete m.subject; if (m.text.length > 12000) partial = true; m.text = m.text.slice(0,12000); messages.push(m); });
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, nonce: request.nonce, organisationId: lookup.organisationId, account: lookup.account, relationshipLocator: lookup.relationshipLocator, operation: lookup.operation, messages: messages, candidates: candidates, partial: partial, retrievedAt: new Date().toISOString() })).setMimeType(ContentService.MimeType.JSON);
  } catch (ignored) {
    // Never log exceptions, addresses, query material, message IDs or message bodies.
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Mailbox lookup unavailable or request rejected.' })).setMimeType(ContentService.MimeType.JSON);
  }
}
function rootAdvisorMailboxMessage_(message, emails, own, includeText) {
  const headers = (message.payload || {}).headers || [];
  const header = function(name) { return headers.filter(function(h) { return String(h.name).toLowerCase() === name.toLowerCase(); }).map(function(h) { return h.value; }).join(','); };
  const addresses = function(value) { return (String(value).toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []); };
  const from = addresses(header('From')), recipients = addresses([header('To'),header('Cc'),header('Bcc')].join(','));
  if (from.length !== 1 || !recipients.length || [from[0]].concat(recipients).some(function(e) { return emails.indexOf(e) === -1 && own.indexOf(e) === -1; })) return null;
  const inbound = emails.indexOf(from[0]) !== -1;
  if (inbound ? !recipients.some(function(e) { return own.indexOf(e) !== -1; }) : own.indexOf(from[0]) === -1 || !recipients.some(function(e) { return emails.indexOf(e) !== -1; })) return null;
  if (!/^[a-f0-9]{1,64}$/i.test(message.id) || !/^[a-f0-9]{1,64}$/i.test(message.threadId) || !Number.isFinite(Number(message.internalDate))) return null;
  const plain = function(part) {
    if (part.filename) return ''; // Never fetch attachments, remote images or HTML resources.
    if (part.mimeType === 'text/plain' && part.body && part.body.data) return Utilities.newBlob(Utilities.base64DecodeWebSafe(part.body.data)).getDataAsString();
    return (part.parts || []).map(plain).filter(Boolean).join('\n');
  };
  return { gmailMessageId: message.id, gmailThreadId: message.threadId, senderEmail: from[0], recipientEmails: recipients, direction: inbound ? 'inbound' : 'outbound', text: includeText ? plain(message.payload || {}) : '', subject: header('Subject'), sentAt: new Date(Number(message.internalDate)).toISOString() };
}
