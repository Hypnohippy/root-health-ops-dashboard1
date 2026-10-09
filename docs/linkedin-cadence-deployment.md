# LinkedIn cadence deployment

Cadence: connection, day3_followup, day7_parity, day14_insight, day28_relevance, day42_close, parked. Dates are 3, 7, 14, 28 and 42 days from the confirmed original outbound timestamp. Elapsed time selects a due action; it never records a send.

## Read-only analysis

Open /dashboard/growth/cadence-report?organisationId=<authorised tenant>. The report reads the shared database and performs no writes. It reports proposed stage changes, eligible-stage totals and mutually exclusive primary exclusions. GET /api/growth/linkedin-cadence/backfill is also read-only.

## One-time deployment step (not executed during analysis)

1. Review dry-run counts for every tenant. Resolve missing/ambiguous evidence; never invent messages or times.
2. Apply supabase/migrations/20261009100000_linkedin_absolute_cadence.sql using the authorised database release process.
3. Deploy the reviewed application.
4. For each authorised tenant, POST /api/growth/linkedin-cadence/backfill with body {"confirm":"apply_evidence_only_backfill"}. Tenant authorization and a locked lifecycle revision protect the operation. It preserves existing outbound text/times and receipts, creates missing targets only from confirmed accepted-connection sends, and does not send messages.
5. Re-read the dry run: no further repairs should be required until elapsed time moves a still-silent contact to another due stage.

Read-time projection also updates existing target presentation to the current elapsed due stage, without writing or creating phantom actionable target IDs. Actual sends require the existing explicit LinkedIn manual confirmation workflow. Final close parks the target. Replies and stronger states continue to override outreach.

No production migration, backfill or outbound send was executed while implementing this change.
