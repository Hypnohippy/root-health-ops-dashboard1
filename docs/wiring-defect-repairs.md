# Proven P0/P1 wiring repairs

## Implemented
- Legacy metrics and Airtable routes require authenticated tenant membership. Metric writes validate campaign ownership and bind stored metadata to that tenant. Airtable requires an explicit AIRTABLE_ORGANISATION_ID deployment binding; missing or mismatched ownership fails closed.
- Acquisition routing records its destination and audit event atomically before marking actioned. Repeating a verified handoff reopens it without another transition. Destination pages display source evidence/prepared context. Bare Mark Actioned is disabled; no send, publication or conversion is implied.
- Both Growth due selectors use the existing unified lifecycle before preparing outreach. Stronger reply/commercial/nurture evidence suppresses stale target cadence.
- CSV imports reuse canonical LinkedIn, email and person/organisation identity. Ambiguity is skipped. Imports use the existing tenant lifecycle revision to serialize concurrent plans and retry stale snapshots. Quoted fields are preserved.
- Obsolete Facebook social_responses intake and its cron wrapper return 410. The existing authenticated /api/responses/pull reader remains canonical; its tenant-keyed insert-only dedupe preserves handled comments.
- Missing deal values remain null; zero remains zero. Metrics count confirmed reply records from delivery/manual receipts, not attempts. Unavailable evidence or unsupported content-search filtering displays Unavailable.

## Rollout required (not performed by this change)
Apply these migrations before deploying dependent routes:
1. 20260927100000_acquisition_handoff.sql
2. 20260927110000_canonical_target_import.sql

The latter persists the existing canonical email identity on growth_targets and adds a service-only import transaction; neither migration adds a parallel workflow store.
Set AIRTABLE_ORGANISATION_ID only after verifying the configured base belongs to that organisation. Disable any external invocation of the retired /api/cron/sync-social endpoint; use the existing authenticated Responses pull. No new schedule is introduced.

## Intentionally blocked
Personal Partner Outreach, Social Queue and Action Outputs retain their stable IDs but remain safety-disabled without explicit public-context/no-consumer-outreach/no-health-targeting evidence and the applicable business/direct-discussion verification. Acquisition Queue, Search Demand, Funnel Events and Personal Leads remain pending proven operational identities/events. A Capacity Check or signup start is not a conversion. No IDs, events or safety evidence were invented.

Legacy social_responses records are not automatically backfilled without trustworthy public-source provenance. Historical fabricated deal values cannot be distinguished safely from genuine values, so no destructive cleanup runs. Existing actioned acquisition records can be routed again to create a verified handoff; no blanket state repair runs.

## Verification
Focused tests cover authorisation, atomic handoff rollback/retry, canonical import identities/concurrency, Growth lifecycle suppression, Facebook canonical dedupe, metric evidence and Personal fail-closed boundaries. SQL runs only in disposable PGlite fixtures. Production migrations, provider requests and sends were not executed.
The full-suite baseline has eight existing cadence/draft expectation failures; these unrelated cadence rules were not changed.

## Changed files

- `app/api/campaign-metrics/route.ts`
- `app/api/campaign-variant-metrics/route.ts`
- `app/api/cron/sync-social/route.ts`
- `app/api/growth/acquisition/[id]/action/route.ts`
- `app/api/growth/acquisition/route.ts`
- `app/api/growth/followups-due/route.ts`
- `app/api/growth/generate-daily-queue/route.ts`
- `app/api/growth/import-targets/route.ts`
- `app/api/growth/update-deal/route.ts`
- `app/api/metrics/route.ts`
- `app/api/replies/[id]/route.ts`
- `app/api/replies/route.ts`
- `app/api/reply/route.ts`
- `app/api/social/responses/sync-meta/route.ts`
- `app/dashboard/ClientDashboardLayout.tsx`
- `app/dashboard/components/AcquisitionHandoff.tsx`
- `app/dashboard/growth/acquisition/page.tsx`
- `app/dashboard/growth/pipeline/page.tsx`
- `app/dashboard/metrics/page.tsx`
- `app/dashboard/ReplyForm.tsx`
- `docs/wiring-defect-repairs.md`
- `lib/acquisitionWorkflow.ts`
- `lib/campaignOwnership.server.ts`
- `lib/contactLifecycle.ts`
- `lib/growthDue.server.ts`
- `lib/legacyAirtable.server.ts`
- `lib/replyMetrics.server.ts`
- `lib/targetImport.server.ts`
- `lib/targetImport.ts`
- `package.json`
- `supabase/migrations/20260927100000_acquisition_handoff.sql`
- `supabase/migrations/20260927110000_canonical_target_import.sql`
- `tests/tenant-generation.test.mjs`
- `tests/wiring-auth.test.mjs`
- `tests/wiring-p1.test.mjs`
