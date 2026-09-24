# B2B engine email send contract

Ops remains the approval surface. The existing Google Apps Script B2B engine remains the Gmail sender.

## Engine webhook

Configure `B2B_ENGINE_ENDPOINTS` in Ops as a JSON array. Each entry is scoped to one organisation and source engine:

```json
[{"organisation_id":"78fa2ac8-e7b6-4b9b-9604-035723ece6b1","source_engine":"root_health_b2b","url":"https://script.google.com/macros/s/DEPLOYMENT_ID/exec","secret":"32-or-more-character-secret"}]
```

Ops sends `POST` JSON with `Authorization: Bearer <secret>`. Because Apps Script web apps do not expose that header to `doPost(e)`, the server-only dispatcher also includes the same secret in `engine_secret`:

```json
{
  "organisation_id": "uuid",
  "response_item_id": "uuid",
  "send_request_id": "uuid",
  "source_engine": "root_health_b2b",
  "engine_secret": "same server-only shared secret",
  "gmail_thread_id": "optional Gmail thread ID",
  "gmail_message_id": "optional inbound Gmail message ID",
  "in_reply_to": "optional original outreach reference",
  "recipient": "buyer@example.com",
  "subject": "Re: original subject",
  "approved_body": "Exact text approved by the user",
  "idempotency_key": "same UUID as send_request_id"
}
```

The Apps Script handler must:

1. Compare `engine_secret` with the `B2B_ENGINE_SECRET` Script Property and reject a mismatched organisation/source engine. The value must never be logged or persisted.
2. Persist `idempotency_key`, delivery state, addressing metadata, and a SHA-256 digest of the approved body before attempting Gmail delivery. Never persist the full approved body in Script Properties.
3. pass `approved_body` directly to Gmail without generation, rewriting, templating, signatures, or other text changes.
4. Use `gmail_thread_id` to reply in the original thread when it resolves. If references are absent or stale, safely send to `recipient` with `subject` rather than guessing a different thread.
5. Return HTTP 2xx with `{ "accepted": true, "idempotency_key": "..." }` only after the instruction is durably queued or sent.
6. Never send an instruction that has not passed these checks.
7. Keep delivery and acknowledgement state separate. Once Gmail delivery is recorded as sent, acknowledgement failures must retain the sent state and retries may only repeat the acknowledgement.

## Delivery acknowledgement

After Gmail reports success or failure, the engine calls:

`POST /api/responses/email/send-acknowledgement`

It uses the existing organisation/source-scoped `GROWTH_INGESTION_KEYS` bearer credential and sends:

```json
{
  "organisation_id": "uuid",
  "source_engine": "root_health_b2b",
  "response_item_id": "uuid",
  "send_request_id": "uuid",
  "status": "sent",
  "gmail_message_id": "sent Gmail message ID",
  "gmail_thread_id": "Gmail thread ID",
  "sent_at": "2026-09-24T12:00:00.000Z"
}
```

For a failure, send `status: "failed"` and a short sanitized `error`. A failed item remains retryable. The engine must not include credentials, message bodies, or stack traces in `error`.
