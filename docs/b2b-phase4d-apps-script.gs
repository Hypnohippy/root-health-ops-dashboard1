/* Phase 4D: replace the existing doPost(e) with this function. */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');

    if (isPhase4DOpsEmailSendRequest_(body)) {
      return handlePhase4DOpsEmailSend_(body);
    }

    const message = body.message || {};
    const type = message.type || '';

    Logger.log('VAPI WEBHOOK TYPE: ' + type);

    if (type === 'end-of-call-report') {
      const call = message.call || {};
      const callId = String(call.id || '').trim();

      if (callId) {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName('Leads');

        const headers =
          sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

        const col = index_(headers);

        if (col.vapiCallId !== undefined && col.vapiCallId >= 0) {
          const lastRow = sheet.getLastRow();

          if (lastRow >= 2) {
            const callIds =
              sheet
                .getRange(2, col.vapiCallId + 1, lastRow - 1, 1)
                .getValues();

            let matchedRow = null;

            for (let i = 0; i < callIds.length; i++) {
              if (String(callIds[i][0] || '').trim() === callId) {
                matchedRow = i + 2;
                break;
              }
            }

            if (matchedRow) {
              const endedReason =
                String(
                  call.endedReason ||
                  message.endedReason ||
                  ''
                ).trim();

              let finalStatus = 'COMPLETED';

              if (endedReason === 'customer-did-not-answer') {
                finalStatus = 'NO ANSWER';
              } else if (endedReason === 'customer-busy') {
                finalStatus = 'BUSY';
              } else if (endedReason === 'voicemail') {
                finalStatus = 'VOICEMAIL';
              }

              sheet
                .getRange(matchedRow, col.callStatus + 1)
                .setValue(finalStatus);

              if (
                col.callOutcome !== undefined &&
                col.callOutcome >= 0
              ) {
                sheet
                  .getRange(matchedRow, col.callOutcome + 1)
                  .setValue(endedReason || 'COMPLETED');
              }

              const transcript =
                String(message.transcript || '').trim();

              const summary =
                String(message.summary || '').trim();

              const noteParts = [];

              if (summary) {
                noteParts.push('Summary: ' + summary);
              }

              if (transcript) {
                noteParts.push('Transcript: ' + transcript);
              }

              if (
                col.callNotes !== undefined &&
                col.callNotes >= 0
              ) {
                sheet
                  .getRange(matchedRow, col.callNotes + 1)
                  .setValue(noteParts.join('\n\n'));
              }

              Logger.log(
                'Matched Vapi call ' +
                callId +
                ' to Leads row ' +
                matchedRow
              );
            } else {
              Logger.log(
                'No matching lead row found for Vapi call ID: ' +
                callId
              );
            }
          }
        }
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('VAPI WEBHOOK ERROR: ' + error);

    return ContentService
      .createTextOutput(
        JSON.stringify({
          ok: false,
          error: String(error)
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }
}

const PHASE4D_EXPECTED_ORGANISATION_ID_ = '78fa2ac8-e7b6-4b9b-9604-035723ece6b1';
const PHASE4D_EXPECTED_SOURCE_ENGINE_ = 'root_health_b2b';
const PHASE4D_ACK_URL_ = 'https://roothealthops.com/api/responses/email/send-acknowledgement';

function isPhase4DOpsEmailSendRequest_(body) {
  return !!body && typeof body === 'object' && (
    body.source_engine === PHASE4D_EXPECTED_SOURCE_ENGINE_ ||
    body.organisation_id === PHASE4D_EXPECTED_ORGANISATION_ID_ ||
    body.response_item_id !== undefined || body.send_request_id !== undefined ||
    body.idempotency_key !== undefined || body.approved_body !== undefined
  );
}

function handlePhase4DOpsEmailSend_(body) {
  try {
    const instruction = validatePhase4DOpsEmailSend_(body);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('PHASE4D_LOCK_UNAVAILABLE');
    try {
      const result = processPhase4DInstruction_(instruction, phase4DProductionDependencies_());
      return phase4DJsonResponse_(result);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log('PHASE4D REQUEST ERROR: ' + phase4DSafeError_(error));
    return phase4DJsonResponse_({ accepted: false, status: 'rejected', error: phase4DSafeError_(error) });
  }
}

/* Pure state machine. Tests inject non-sending dependencies. */
function processPhase4DInstruction_(instruction, deps) {
  let record = deps.read(instruction.idempotencyKey);
  if (record) {
    assertPhase4DRetryMatches_(record, instruction);
    if (record.deliveryStatus === 'sent') {
      if (record.ackStatus !== 'acknowledged') record = attemptPhase4DAcknowledgement_(record, deps);
      return phase4DResult_(record, true);
    }
    if (record.deliveryStatus === 'sending') return phase4DResult_(record, true);
  }

  record = {
    organisationId: instruction.organisationId,
    sourceEngine: instruction.sourceEngine,
    responseItemId: instruction.responseItemId,
    sendRequestId: instruction.sendRequestId,
    idempotencyKey: instruction.idempotencyKey,
    recipient: instruction.recipient,
    subject: instruction.subject,
    bodyHash: instruction.bodyHash,
    requestedThreadId: instruction.gmailThreadId,
    deliveryStatus: 'sending',
    ackStatus: 'not_required',
    updatedAt: deps.now()
  };
  deps.write(instruction.idempotencyKey, record);

  let delivery;
  try {
    delivery = deps.send(instruction);
  } catch (error) {
    record.deliveryStatus = 'failed';
    record.ackStatus = 'pending';
    record.deliveryError = phase4DSafeError_(error);
    record.updatedAt = deps.now();
    deps.write(instruction.idempotencyKey, record);
    attemptPhase4DAcknowledgement_(record, deps);
    return phase4DResult_(record, false);
  }

  /* Delivery is irreversible from here. No later code may set failed. */
  record.deliveryStatus = 'sent';
  record.ackStatus = 'pending';
  record.gmailMessageId = delivery.gmailMessageId || null;
  record.gmailThreadId = delivery.gmailThreadId || instruction.gmailThreadId || null;
  record.sentAt = deps.now();
  record.updatedAt = record.sentAt;
  delete record.deliveryError;
  deps.write(instruction.idempotencyKey, record);

  record = attemptPhase4DAcknowledgement_(record, deps);
  return phase4DResult_(record, false);
}

function attemptPhase4DAcknowledgement_(record, deps) {
  if (record.deliveryStatus === 'sent' && !record.gmailMessageId && deps.recover) {
    const recovered = deps.recover(record);
    if (recovered) {
      record.gmailMessageId = recovered.gmailMessageId || null;
      record.gmailThreadId = recovered.gmailThreadId || record.gmailThreadId || null;
    }
  }
  try {
    deps.ack(record);
    record.ackStatus = 'acknowledged';
    delete record.ackError;
  } catch (error) {
    record.ackStatus = 'ack_pending';
    record.ackError = phase4DSafeError_(error);
    Logger.log('PHASE4D ACK PENDING: ' + record.ackError);
  }
  record.updatedAt = deps.now();
  deps.write(record.idempotencyKey, record);
  return record;
}

function phase4DProductionDependencies_() {
  return {
    read: readPhase4DDeliveryResult_, write: writePhase4DDeliveryResult_,
    send: sendPhase4DApprovedEmail_, ack: sendPhase4DAcknowledgement_, recover: recoverPhase4DSentMetadata_,
    now: function() { return new Date().toISOString(); }
  };
}

function validatePhase4DOpsEmailSend_(body) {
  const expectedSecret = String(PropertiesService.getScriptProperties().getProperty('B2B_ENGINE_SECRET') || '');
  if (expectedSecret.length < 32) throw new Error('PHASE4D_NOT_CONFIGURED');
  if (!phase4DConstantTimeEqual_(body.engine_secret, expectedSecret)) throw new Error('PHASE4D_UNAUTHORIZED');
  const organisationId = requirePhase4DUuid_(body.organisation_id, 'organisation_id');
  if (organisationId !== PHASE4D_EXPECTED_ORGANISATION_ID_) throw new Error('PHASE4D_WRONG_ORGANISATION');
  const sourceEngine = requirePhase4DText_(body.source_engine, 'source_engine', 100);
  if (sourceEngine !== PHASE4D_EXPECTED_SOURCE_ENGINE_) throw new Error('PHASE4D_WRONG_SOURCE');
  const responseItemId = requirePhase4DUuid_(body.response_item_id, 'response_item_id');
  const sendRequestId = requirePhase4DUuid_(body.send_request_id, 'send_request_id');
  const idempotencyKey = requirePhase4DUuid_(body.idempotency_key, 'idempotency_key');
  if (sendRequestId !== idempotencyKey) throw new Error('PHASE4D_IDEMPOTENCY_MISMATCH');
  const recipient = requirePhase4DEmail_(body.recipient);
  const subject = requirePhase4DText_(body.subject, 'subject', 1000);
  if (typeof body.approved_body !== 'string' || !body.approved_body.trim() || body.approved_body.length > 50000) throw new Error('PHASE4D_INVALID_APPROVED_BODY');
  return {
    organisationId: organisationId, sourceEngine: sourceEngine, responseItemId: responseItemId,
    sendRequestId: sendRequestId, idempotencyKey: idempotencyKey, recipient: recipient, subject: subject,
    approvedBody: body.approved_body, bodyHash: phase4DBodyDigest_(body.approved_body),
    gmailThreadId: optionalPhase4DText_(body.gmail_thread_id, 500),
    gmailMessageId: optionalPhase4DText_(body.gmail_message_id, 500),
    inReplyTo: optionalPhase4DText_(body.in_reply_to, 500)
  };
}

function sendPhase4DApprovedEmail_(instruction) {
  const safeThread = resolvePhase4DGmailThread_(instruction.gmailThreadId, instruction.recipient);
  const startedAt = new Date();
  rootSendEmailV63_(instruction.recipient, instruction.subject, instruction.approvedBody, {});
  const sent = findPhase4DSentMessage_(instruction.recipient, instruction.subject, startedAt);
  return {
    gmailMessageId: sent ? sent.getId() : null,
    gmailThreadId: sent ? sent.getThread().getId() : (safeThread ? safeThread.getId() : null)
  };
}

function recoverPhase4DSentMetadata_(record) {
  const sent = findPhase4DSentMessage_(record.recipient, record.subject, new Date(record.sentAt));
  return sent ? { gmailMessageId: sent.getId(), gmailThreadId: sent.getThread().getId() } : null;
}

function resolvePhase4DGmailThread_(threadId, recipient) {
  if (!threadId) return null;
  try {
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) return null;
    const target = recipient.toLowerCase();
    const matches = thread.getMessages().some(function(message) {
      return [message.getFrom(), message.getTo(), message.getCc(), message.getBcc()].join(',').toLowerCase().indexOf(target) !== -1;
    });
    return matches ? thread : null;
  } catch (error) {
    Logger.log('PHASE4D THREAD UNAVAILABLE: ' + phase4DSafeError_(error));
    return null;
  }
}

function findPhase4DSentMessage_(recipient, subject, startedAt) {
  try {
    const query = 'in:sent to:"' + recipient.replace(/"/g, '') + '" subject:"' + subject.replace(/"/g, '') + '" newer_than:1d';
    const threads = GmailApp.search(query, 0, 10);
    const candidates = [];
    threads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
        if (message.isInChats && message.isInChats()) return;
        if (message.getDate().getTime() >= startedAt.getTime() - 5000 &&
            message.getSubject() === subject && message.getTo().toLowerCase().indexOf(recipient.toLowerCase()) !== -1) candidates.push(message);
      });
    });
    candidates.sort(function(a, b) { return b.getDate().getTime() - a.getDate().getTime(); });
    return candidates[0] || null;
  } catch (error) {
    Logger.log('PHASE4D SENT MESSAGE LOOKUP FAILED: ' + phase4DSafeError_(error));
    return null;
  }
}

function sendPhase4DAcknowledgement_(record) {
  const props = PropertiesService.getScriptProperties();
  const organisationId = String(props.getProperty('OPS_ORGANISATION_ID') || '').trim();
  const secret = String(props.getProperty('OPS_INGESTION_SECRET') || '');
  if (organisationId !== PHASE4D_EXPECTED_ORGANISATION_ID_ || secret.length < 32) throw new Error('PHASE4D_ACK_NOT_CONFIGURED');
  const payload = {
    organisation_id: organisationId, source_engine: PHASE4D_EXPECTED_SOURCE_ENGINE_,
    response_item_id: record.responseItemId, send_request_id: record.sendRequestId,
    status: record.deliveryStatus
  };
  if (record.deliveryStatus === 'sent') {
    if (!record.gmailMessageId || !record.sentAt) throw new Error('PHASE4D_SENT_METADATA_PENDING');
    payload.gmail_message_id = record.gmailMessageId;
    payload.gmail_thread_id = record.gmailThreadId || null;
    payload.sent_at = record.sentAt;
  } else {
    payload.error = String(record.deliveryError || 'B2B engine send failed').slice(0, 2000);
  }
  const response = UrlFetchApp.fetch(PHASE4D_ACK_URL_, {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('PHASE4D_ACK_FAILED_HTTP_' + code);
}

function phase4DResult_(record, duplicate) {
  return {
    accepted: record.deliveryStatus === 'sent' || record.deliveryStatus === 'sending',
    duplicate: duplicate, status: record.deliveryStatus, acknowledgement_status: record.ackStatus,
    idempotency_key: record.idempotencyKey,
    gmail_message_id: record.gmailMessageId || null, gmail_thread_id: record.gmailThreadId || null,
    sent_at: record.sentAt || null
  };
}

function assertPhase4DRetryMatches_(record, instruction) {
  if (record.organisationId !== instruction.organisationId || record.sourceEngine !== instruction.sourceEngine ||
      record.responseItemId !== instruction.responseItemId || record.sendRequestId !== instruction.sendRequestId ||
      record.recipient !== instruction.recipient || record.subject !== instruction.subject || record.bodyHash !== instruction.bodyHash) {
    throw new Error('PHASE4D_RETRY_MISMATCH');
  }
}

function phase4DBodyDigest_(body) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8);
  return bytes.map(function(value) { const unsigned = value < 0 ? value + 256 : value; return ('0' + unsigned.toString(16)).slice(-2); }).join('');
}

function phase4DDeliveryPropertyKey_(key) { return 'PHASE4D_SEND_' + key; }
function readPhase4DDeliveryResult_(key) {
  const raw = PropertiesService.getScriptProperties().getProperty(phase4DDeliveryPropertyKey_(key));
  return raw ? JSON.parse(raw) : null;
}
function writePhase4DDeliveryResult_(key, record) {
  /* record contains bodyHash only; approvedBody and engine_secret are never persisted. */
  PropertiesService.getScriptProperties().setProperty(phase4DDeliveryPropertyKey_(key), JSON.stringify(record));
}

function requirePhase4DUuid_(value, field) {
  const text = requirePhase4DText_(value, field, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) throw new Error('PHASE4D_INVALID_' + field.toUpperCase());
  return text;
}
function requirePhase4DEmail_(value) {
  const text = requirePhase4DText_(value, 'recipient', 500).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('PHASE4D_INVALID_RECIPIENT');
  return text;
}
function requirePhase4DText_(value, field, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('PHASE4D_INVALID_' + field.toUpperCase());
  return value.trim();
}
function optionalPhase4DText_(value, max) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new Error('PHASE4D_INVALID_OPTIONAL_FIELD');
  return value.trim() || null;
}
function phase4DConstantTimeEqual_(supplied, expected) {
  const a = String(supplied || ''), b = String(expected || ''); let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a.charCodeAt(i % Math.max(a.length, 1)) || 0) ^ (b.charCodeAt(i % Math.max(b.length, 1)) || 0);
  return mismatch === 0;
}
function phase4DSafeError_(error) {
  return String(error && error.message ? error.message : error || 'Unknown Phase 4D error').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}
function phase4DJsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/* Safe diagnostic: no Gmail, Leads, Vapi or HTTP calls. */
function testPhase4DConfigurationSafe_() {
  const props = PropertiesService.getScriptProperties();
  const checks = {
    b2bEngineSecretPresent: String(props.getProperty('B2B_ENGINE_SECRET') || '').length >= 32,
    opsOrganisationCorrect: String(props.getProperty('OPS_ORGANISATION_ID') || '').trim() === PHASE4D_EXPECTED_ORGANISATION_ID_,
    opsIngestionSecretPresent: String(props.getProperty('OPS_INGESTION_SECRET') || '').length >= 32,
    vapiRoutingPreserved: !isPhase4DOpsEmailSendRequest_({ message: { type: 'end-of-call-report' } }),
    phase4DRoutingDetected: isPhase4DOpsEmailSendRequest_({ source_engine: PHASE4D_EXPECTED_SOURCE_ENGINE_ })
  };
  checks.ok = checks.b2bEngineSecretPresent && checks.opsOrganisationCorrect && checks.opsIngestionSecretPresent && checks.vapiRoutingPreserved && checks.phase4DRoutingDetected;
  Logger.log('PHASE4D SAFE DIAGNOSTIC: ' + JSON.stringify(checks));
  return checks;
}

/* Safe state-machine regression: mocks Gmail and Ops acknowledgement. */
function testPhase4DAckFailureCannotDuplicateSafe_() {
  const memory = {}, calls = { gmail: 0, ack: 0 };
  const instruction = {
    organisationId: PHASE4D_EXPECTED_ORGANISATION_ID_, sourceEngine: PHASE4D_EXPECTED_SOURCE_ENGINE_,
    responseItemId: '11111111-1111-4111-8111-111111111111', sendRequestId: '22222222-2222-4222-8222-222222222222',
    idempotencyKey: '22222222-2222-4222-8222-222222222222', recipient: 'diagnostic@example.com',
    subject: 'Safe diagnostic', approvedBody: 'Never sent', bodyHash: 'diagnostic-hash', gmailThreadId: null
  };
  const deps = {
    read: function(key) { return memory[key] || null; },
    write: function(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); },
    send: function() { calls.gmail++; return { gmailMessageId: 'mock-message', gmailThreadId: 'mock-thread' }; },
    ack: function() { calls.ack++; if (calls.ack === 1) throw new Error('simulated acknowledgement outage'); },
    now: function() { return '2026-09-24T12:00:00.000Z'; }
  };
  const first = processPhase4DInstruction_(instruction, deps);
  const duplicate = processPhase4DInstruction_(instruction, deps);
  const result = { ok: calls.gmail === 1 && calls.ack === 2 && first.status === 'sent' && first.acknowledgement_status === 'ack_pending' && duplicate.status === 'sent' && duplicate.acknowledgement_status === 'acknowledged', gmailCalls: calls.gmail, acknowledgementCalls: calls.ack, first: first, duplicate: duplicate };
  Logger.log('PHASE4D ACK FAILURE REGRESSION: ' + JSON.stringify(result));
  if (!result.ok) throw new Error('PHASE4D_SAFE_REGRESSION_FAILED');
  return result;
}

/* Phase 4G LinkedIn acceptance discovery. Separate from doPost, reply classification and Phase 4D sending. */
const LINKEDIN_ACCEPTANCE_OPS_URL_ = 'https://roothealthops.com/api/growth/linkedin-connections/ingest';
const LINKEDIN_ACCEPTANCE_SOURCE_ENGINE_ = 'root_health_b2b';
const LINKEDIN_ACCEPTANCE_LABEL_ = 'RootOps/LinkedIn-Acceptance-Imported';

/* Install this as a time-driven trigger after deployment. It never sends email or LinkedIn messages. */
function runLinkedInAcceptanceIntake_() {
  return processLinkedInAcceptanceIntake_('newer_than:14d from:(invitations@linkedin.com OR invitations@e.linkedin.com) {subject:"accepted your invitation" subject:connections}', 50, true);
}

/* Safe bounded backfill. It deliberately ignores the old thread label because earlier runs may have imported only one person from a digest. */
function backfillLinkedInAcceptanceLast30Days_() {
  return processLinkedInAcceptanceIntake_('newer_than:30d from:(invitations@linkedin.com OR invitations@e.linkedin.com) {subject:"accepted your invitation" subject:connections}', 200, false);
}

function processLinkedInAcceptanceIntake_(query, maxThreads, applyLabel) {
  const props = PropertiesService.getScriptProperties();
  const organisationId = String(props.getProperty('OPS_ORGANISATION_ID') || '').trim();
  const secret = String(props.getProperty('OPS_INGESTION_SECRET') || '');
  if (organisationId !== PHASE4D_EXPECTED_ORGANISATION_ID_ || secret.length < 32) throw new Error('LINKEDIN_INTAKE_NOT_CONFIGURED');
  const label = GmailApp.getUserLabelByName(LINKEDIN_ACCEPTANCE_LABEL_) || GmailApp.createLabel(LINKEDIN_ACCEPTANCE_LABEL_);
  const threads = GmailApp.search(query, 0, Math.max(1, Math.min(Number(maxThreads || 50), 200)));
  let imported = 0, duplicates = 0, candidates = 0, failed = 0;
  threads.forEach(function(thread) {
    let threadSucceeded = true;
    thread.getMessages().forEach(function(message) {
      if (!isLinkedInAcceptanceMessage_(message)) return;
      try {
        const result = sendLinkedInAcceptanceToOps_(message, organisationId, secret);
        imported += Number(result.acceptedConnectionsRecorded || 0);
        duplicates += Number(result.acceptedConnectionsDuplicate || 0);
        candidates += Number(result.candidatesInserted || 0);
      } catch (error) {
        threadSucceeded = false; failed++;
        Logger.log('LINKEDIN ACCEPTANCE INTAKE FAILED: ' + phase4DSafeError_(error));
      }
    });
    if (threadSucceeded && applyLabel) thread.addLabel(label);
  });
  const result = { ok: failed === 0, threads: threads.length, acceptedConnectionsImported: imported, acceptedConnectionsDuplicate: duplicates, networkCandidatesImported: candidates, failed: failed };
  Logger.log('LINKEDIN ACCEPTANCE INTAKE: ' + JSON.stringify(result));
  return result;
}

function isLinkedInAcceptanceMessage_(message) {
  const subject = String(message.getSubject() || '');
  const from = String(message.getFrom() || '').toLowerCase();
  if (!/(?:^|[<@])(?:invitations@)?(?:e\.)?linkedin\.com(?:>|$)/i.test(from)) return false;
  if (/accepted your invitation/i.test(subject)) return true;
  const body = String(message.getBody ? message.getBody() : '');
  return /\bconnections?(?:,|\b)/i.test(subject) && /You have\s+\d+\s+new connections?\b/i.test(body) && /linkedin\.com\/(?:comm\/)?in\//i.test(body) && /linkedin\.com\/(?:messaging|comm\/messaging)/i.test(body);
}

function sendLinkedInAcceptanceToOps_(message, organisationId, secret) {
  const payload = {
    organisation_id: organisationId,
    source_engine: LINKEDIN_ACCEPTANCE_SOURCE_ENGINE_,
    subject: String(message.getSubject() || ''),
    sender: String(message.getFrom() || ''),
    html: String(message.getBody() || ''),
    gmail_message_id: String(message.getId() || ''),
    discovered_at: message.getDate().toISOString()
  };
  const response = UrlFetchApp.fetch(LINKEDIN_ACCEPTANCE_OPS_URL_, {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('LINKEDIN_INTAKE_HTTP_' + code);
  const body = JSON.parse(response.getContentText() || '{}');
  if (!body.success) throw new Error('LINKEDIN_INTAKE_REJECTED');
  return body;
}

/* Safe diagnostic: reads Script Properties and tests detection only. No Gmail search, labels or HTTP calls. */
function testLinkedInAcceptanceIntakeSafe_() {
  const props = PropertiesService.getScriptProperties();
  const fake = { getSubject: function() { return 'Nick Fahy accepted your invitation'; }, getFrom: function() { return 'LinkedIn <invitations@e.linkedin.com>'; }, getBody: function() { return ''; } };
  const digest = { getSubject: function() { return 'See Kate’s and other people’s connections, experience, and more'; }, getFrom: function() { return 'LinkedIn <invitations@linkedin.com>'; }, getBody: function() { return 'You have 2 new connections <a href="https://linkedin.com/in/kate">Kate</a> <a href="https://linkedin.com/messaging/compose/?recipient=kate">Message</a>'; } };
  const rejected = { getSubject: function() { return 'People you may know'; }, getFrom: function() { return 'news@e.linkedin.com'; } };
  const result = {
    organisationCorrect: String(props.getProperty('OPS_ORGANISATION_ID') || '').trim() === PHASE4D_EXPECTED_ORGANISATION_ID_,
    ingestionSecretPresent: String(props.getProperty('OPS_INGESTION_SECRET') || '').length >= 32,
    acceptanceDetected: isLinkedInAcceptanceMessage_(fake), digestDetected: isLinkedInAcceptanceMessage_(digest), promotionalMailRejected: !isLinkedInAcceptanceMessage_(rejected)
  };
  result.ok = result.organisationCorrect && result.ingestionSecretPresent && result.acceptanceDetected && result.digestDetected && result.promotionalMailRejected;
  Logger.log('LINKEDIN ACCEPTANCE SAFE DIAGNOSTIC: ' + JSON.stringify(result));
  return result;
}
