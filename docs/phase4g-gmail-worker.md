# Phase 4G Gmail acceptance worker

The existing B2B Apps Script now contains `runLinkedInAcceptanceIntake_`. It is deliberately separate from `doPost(e)`, Phase 4D sending and inbound reply classification.

The worker searches recent LinkedIn invitation mail for individual `accepted your invitation` notifications and accepted-invitation digests whose body confirms `You have X new connections`. It validates the sender and structure again, then posts the original HTML plus Gmail message identity to `/api/growth/linkedin-connections/ingest`. Ops parses every accepted person, keeps suggestion sections separate, and applies tenant-scoped person-level deduplication. The regular worker may label successfully processed threads, but correctness never depends on that label.

Run `backfillLinkedInAcceptanceLast30Days_()` once after deployment to scan up to 200 matching threads from the last 30 days. It deliberately includes previously labelled mail because older runs may have only imported the first person in a digest. Repeating it is safe: Ops deduplicates each accepted person by canonical LinkedIn identity.

It reuses `OPS_ORGANISATION_ID` and `OPS_INGESTION_SECRET`; no new secret is introduced. `root_health_b2b` must remain in that organisation's `GROWTH_INGESTION_KEYS.source_engines` list in Ops.

Run `testLinkedInAcceptanceIntakeSafe_()` before deployment. It does not access Gmail or make HTTP calls. After deploying the updated script, create one time-driven trigger for `runLinkedInAcceptanceIntake_`; every 10–15 minutes is appropriate. This provider-owned trigger creation is the only manual deployment step.
