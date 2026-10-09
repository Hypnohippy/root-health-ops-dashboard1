# LinkedIn cadence deployment

Cadence: connection, day3_followup, day7_parity, day14_insight, day28_relevance, day42_close, parked. Dates are 3, 7, 14, 28 and 42 days from the verified external original LinkedIn sent_at. Elapsed time selects a due action; it never records a send.

## Read-only analysis

Open /dashboard/growth/cadence-report?organisationId=<authorised tenant>. The report reads the shared database and performs no writes. It reports proposed stage changes, eligible-stage totals and mutually exclusive primary exclusions. GET /api/growth/linkedin-cadence/backfill is also read-only.

## One-time deployment step (not executed during analysis)

1. Review dry-run counts for every tenant. Resolve missing/ambiguous evidence; never invent messages or times.
2. Apply both 20261009100000_linkedin_absolute_cadence.sql and 20261009120000_linkedin_external_send_evidence.sql using the separately authorised database release process.
3. Deploy the reviewed application.
4. For each authorised tenant, POST /api/growth/linkedin-cadence/backfill with body {"confirm":"apply_evidence_only_backfill"}. Tenant authorization and a locked lifecycle revision protect the operation. It preserves existing outbound text/times and receipts, creates missing targets only from confirmed accepted-connection sends, and does not send messages.
5. Re-read the dry run: no further repairs should be required until elapsed time moves a still-silent contact to another due stage.

Read-time projection also updates existing target presentation to the current elapsed due stage, without writing or creating phantom actionable target IDs. Actual sends require the existing explicit LinkedIn manual confirmation workflow. Final close parks the target. Replies and stronger states continue to override outreach.

No production migration, backfill or outbound send was executed while implementing this change.

## External send date reconciliation (PR #50)

Do not apply migrations or run backfill against Production during review. Preview currently shares the Production Supabase database: only read-only report/UI checks are permitted there. The new `20261009120000_linkedin_external_send_evidence.sql` migration is tested in local PGlite, not applied remotely. Saving send confirmations requires this migration after separately authorized rollout.

Legacy `manual_completion.completed_at` records the Ops confirmation, not necessarily the LinkedIn send. It must never populate cadence anchors. Existing valid receipts remain previously contacted, with Actual send date unverified (including the 28 confirmations inspected on 9 October). The older receipt also needs verification unless independent external send evidence is provided.

Sent now records external `sent_at` and database `confirmed_at` separately. Already sent previously requires exact message text, date/time where known, timezone and explicit confirmation. A date without a time is labelled date precision and represented by the start of the local day. Unknown dates retain the message, set `historical_send_date_status=unknown`, block timing and prevent another first message.

The report includes a tenant-scoped review screen. Classification appends an immutable prior receipt to history, stores actor/source/evidence/correction type, and uses the verified external date to project the current absolute stage without fabricating missed sends. Revision locking and receipt-key idempotency prevent concurrent/double confirmation. Genuine replies and stronger states override review and cadence. The legacy complete endpoint rejects stale clients and asks them to reload so they cannot silently record ambiguous evidence.
