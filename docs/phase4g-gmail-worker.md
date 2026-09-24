# Phase 4G Gmail acceptance worker

The existing B2B Apps Script now contains `runLinkedInAcceptanceIntake_`. It is deliberately separate from `doPost(e)`, Phase 4D sending and inbound reply classification.

The worker searches only recent LinkedIn invitation mail whose subject contains `accepted your invitation`, validates the sender again, and posts the original HTML plus Gmail message identity to `/api/growth/linkedin-connections/ingest`. Ops performs parsing, Growth Profile qualification and tenant-scoped deduplication. Successfully processed Gmail threads receive the `RootOps/LinkedIn-Acceptance-Imported` label. A failed thread remains unlabelled and is retryable.

It reuses `OPS_ORGANISATION_ID` and `OPS_INGESTION_SECRET`; no new secret is introduced. `root_health_b2b` must remain in that organisation's `GROWTH_INGESTION_KEYS.source_engines` list in Ops.

Run `testLinkedInAcceptanceIntakeSafe_()` before deployment. It does not access Gmail or make HTTP calls. After deploying the updated script, create one time-driven trigger for `runLinkedInAcceptanceIntake_`; every 10–15 minutes is appropriate. This provider-owned trigger creation is the only manual deployment step.
