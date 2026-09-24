# Phase 4C Part 2: Email Response Intake

Email replies enter the existing Responses inbox through `POST /api/responses/email/ingest`. The sender uses the Phase 4A server-only `GROWTH_INGESTION_KEYS` credential bound to the explicit organisation and `source_engine`. This PR does not change Google Apps Script or Google OAuth. The current Google connection lacks Gmail scopes and refresh-token storage, so Ops does not pull Gmail directly.

## Intake contract

Headers: `Authorization: Bearer <dedicated ingestion secret>` and `Content-Type: application/json`.

```json
{
  "organisation_id": "78fa2ac8-e7b6-4b9b-9604-035723ece6b1",
  "source_engine": "root_health_b2b",
  "records": [{
    "message_id": "stable Gmail message ID",
    "thread_id": "Gmail thread ID",
    "in_reply_to": "original sent message ID",
    "outreach_reference": "lead or outreach record reference",
    "sender_name": "Name",
    "sender_email": "person@example.com",
    "subject": "Re: subject",
    "body": "Plain-text reply",
    "received_at": "2026-09-24T09:00:00Z",
    "classification": "optional upstream evidence",
    "metadata": {}
  }]
}
```

The same 100-record and 256 KiB limits as acquisition ingestion apply. Database uniqueness on `(organisation_id, email_message_id)` makes retries safe. Message/thread/reply/outreach identifiers are retained so a future email sender can reply in the original thread. This phase deliberately has no sender.

Ops classifies every reply consistently rather than trusting an upstream `HUMAN_REPLY_REQUIRED` flag. Supported classifications are `human_positive`, `human_neutral`, `human_negative`, `question`, `redirect`, `auto_acknowledgement`, `waiting_for_human`, `closed_or_lost`, `out_of_office`, and `bounce`. Automated receipts and “one of our team will be in touch” become `waiting_for_human`, not `needs_reply`.

## Inbox actions

Email appears beside social items in `/dashboard/responses`, badged Email with subject, classification, response state and thread/outreach references. Operators may create/edit/copy a draft, mark no reply needed, set follow-up, route to nurture, or mark closed/lost, engaged or converted. `POST /api/responses/email/:id/action` requires an authenticated owner/admin/manager for the explicit organisation and applies allowed state transitions through an idempotent audited RPC. The ingestion credential cannot call it.

The existing social send button is hidden for email. The email reply route contains no provider call, SMTP/Gmail send, or publishing action. Existing Facebook/Instagram reply behaviour is untouched.

## Deployment

Apply `supabase/migrations/20260924130000_email_response_intake.sql` after the earlier Phase 4C migration. It adds email/thread/classification fields to `inbox_items`, stable message dedupe, `response_item_events`, and the internal action RPC. No new environment variable is required if the B2B engine already has a source-scoped Phase 4A credential; add its source engine to that credential if needed. The engine must later be configured to POST the contract above—this repository does not modify it.
