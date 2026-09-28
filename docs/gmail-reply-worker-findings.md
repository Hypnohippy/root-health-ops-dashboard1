# Gmail reply worker: live inspection, 2026-09-28

Inspected the saved source and trigger list in the active [Root Health Lead Engine](https://script.google.com/home/projects/1Ls1biijXon2ifiX0mRg5JlWvMi2HxuaCos1g36lsxzfB-MIsDF1QN4gf/edit). No live functions were run, edited or deployed. Code.gs, Untitled.gs and google-engine-state-export.gs were inspected through the editor.

## Existing implementation

- `classifyInboundReplies()` exists in Code.gs. The installed time-based `scheduledConversationEngine` trigger calls it alongside other routines, including sending routines. Do not run that wrapper as an intake diagnostic.
- Human reply search: `rootFindLeadThreads_(email, 90)` builds `{to:EXACT from:EXACT to:CANONICAL from:CANONICAL} newer_than:90d`, removing duplicate address variants. Canonicalisation strips plus suffixes. The classifier requires a Leads email and sentAt, matches the incoming sender, ignores mail before sentAt, picks the latest reply and skips timestamps at/before lastInboundAt.
- Automated response search: `in:inbox newer_than:14d`, up to 200 threads, followed by automated-message detection and conservative lead scoring.
- These paths update the Leads sheet and prepare routing/drafts. They do not POST replies to Ops. Their timestamp gating is sheet processing state, not Ops ingestion dedupe.
- `testPhase4DCreateInboundInOps()` exists, but creates a synthetic message with a random `phase4d-test-` ID and hardcoded sample text. It does not read Gmail and is not a production forwarding worker.
- The test uses `https://roothealthops.com/api/responses/email/ingest`, source engine `root_health_b2b`, organisation from `OPS_ORGANISATION_ID`, and bearer `OPS_INGESTION_SECRET`. The server matches that secret through `GROWTH_INGESTION_KEYS`. No secret values were inspected.
- `sendToOps_` is the Phase 4B acquisition sender using `OPS_INGEST_URL` and the acquisition records contract. It is not the missing email forwarder. The separate state exporter posts engine state, not inbox messages.

The earlier Phase 4C docs and Git history define the receiver but leave engine forwarding for later. There is no historical production Ops reply-forwarding function name or search query in those reference files. The live project has reply classification, but lacks the production Gmail-to-Ops forwarding step. This establishes a missing integration, not the eligibility or status of the particular reported Gmail message, which was not inspected.

## Prepared, not installed

`b2b-gmail-reply-intake.gs` supplies `runOpsGmailReplyIntake()` as a separate file for the same existing project/mailbox. It reuses the existing receiver and credentials. The only integration edit is one call at the end of the existing `scheduledConversationEngine`, after its existing try/catch. Do not replace the function or change its existing statements:

```js
function scheduledConversationEngine() {
  try {
    rebuildFollowUpQueueFromGmail();
    classifyInboundReplies();
    sendWarmReplyActions();
    processNotNowReentries_();
    sendDueRootFollowUps();
  } catch (e) {
    log_('CONVERSATION_ENGINE_ERROR', '', '', '', String(e), '');
  }
  runOpsGmailReplyIntake(); // The only added line.
}
```

The bridge catches configuration, Gmail and HTTP failures. It does not call any outbound or classification routine, install triggers, change labels/read state, write Leads, or generate drafts. The existing conversation trigger and classification/sending statements stay as they are. If the original engine times out before reaching this call, forwarding does not run; use the standalone intake for diagnosis, never the conversation wrapper.

Query: `to:enquiries@roothealth.app newer_than:14d -in:spam -in:trash`, first 50 threads. Recheck thread spam/trash flags, then each message's age, recipient, draft/trash state, external sender and syntactically valid `In-Reply-To` message IDs. Read and archived replies remain eligible; self-sent mail and notifications without reply evidence are excluded. Headers are reply evidence, not sender authentication. Ops supplies classification. Dedupe is `(organisation_id, email_message_id)` using the incoming Gmail message ID, not its thread ID, RFC header or original sent ID. Concurrent/repeated runs rely on that existing database uniqueness.

One message is posted per request; the worker verifies both HTTP success and insert/duplicate acknowledgement. Redirects are disabled. Failures leave no checkpoint or processed marker, so later runs retry. Oversized/empty messages fail without truncation. Logs contain counts only, not message IDs, subjects, bodies, addresses, provider error text, responses or secrets.

Deliberate limits: headerless replies and mail without an explicit recipient match are skipped; older mail is outside the 14-day window. Added work is capped at 100 messages and a 45-second soft budget because this invocation shares the conversation engine's execution limit. In-flight Gmail/HTTP calls can exceed that budget. `scanLimitReached: true` means coverage may be incomplete; repeated first-page scans may repeatedly defer older messages. This is not a full backfill. Do not claim full recovery when the flag is true.

## Deployment and manual test plan (not executed)

1. Add `b2b-gmail-reply-intake.gs` to the existing Root Health Lead Engine project. Keep `OPS_GMAIL_REPLY_INTAKE_ENABLED` absent or `false` while installing. Add only the single call shown above after the existing conversation-engine try/catch. Save the project; its existing Head time-based trigger uses saved code. Do not create a trigger or change the web-app deployment.
2. Required existing properties: `OPS_ORGANISATION_ID=78fa2ac8-e7b6-4b9b-9604-035723ece6b1` and `OPS_INGESTION_SECRET` (reuse its existing value; never paste into logs). The source engine is fixed to `root_health_b2b`. The executing account must own `enquiries@roothealth.app` or have it as a Gmail alias. No URL property or new secret is needed. The only new property is `OPS_GMAIL_REPLY_INTAKE_ENABLED=true` to enable; missing/any other value disables.
3. Select and run **only** `testOpsGmailReplyIntakeSafe`. It checks configuration and alias availability, then posts `records:[{}]` to the existing receiver. The receiver authenticates first and rejects the missing required message fields before any DB call. Expected log: `OPS GMAIL REPLY SAFE TEST: {"ok":true,"configuration":true,"receiverAuthenticated":true,"httpStatus":400}`. This expected 400 proves the authenticated receiver-validation path; it does not prove DB availability. The test reads no email, inserts no synthetic row and sends no mail. A 403, 503, redirect, unexpected error or missing configuration yields `ok:false`; do not enable in that case.
4. Select and run `runOpsGmailReplyIntake` while disabled. Expect `enabled:false`, zero counts, and no Gmail search or receiver POST. Then set `OPS_GMAIL_REPLY_INTAKE_ENABLED=true` and run that function once. The scheduled trigger can also run during this interval; server dedupe covers overlap. Do not manually run `scheduledConversationEngine`, which retains its existing outbound routines.
5. In Executions, read `OPS GMAIL REPLY INTAKE`. `scanned` counts unique messages examined; `forwarded` counts acknowledged new rows; `duplicate` counts acknowledged existing rows; `skipped` counts excluded messages; `failed` counts message, thread or setup failures. Expect `ok:true`, `failed:0`. Also check `scanLimitReached` before judging coverage. Locate the known eligible reply in Ops Responses by sender/subject and compare its Gmail message ID. If no eligible reply exists in the scan, zero forwarding does not prove end-to-end insertion.
6. Rerun the intake. With the same mailbox and no previous limits/failures, expect zero new rows and duplicates for previously imported messages. Inspect one later normal `scheduledConversationEngine` execution for the intake summary to verify the single-call wiring. No message is sent by either new function.

## Rollback

Set `OPS_GMAIL_REPLY_INTAKE_ENABLED=false` or remove it. The next call becomes a no-op; a currently running call may finish. Remove the one added call and the bridge file to fully revert. Leave the existing trigger, secret, classification and outbound code untouched. Imported Ops rows remain; rollback does not delete them.
