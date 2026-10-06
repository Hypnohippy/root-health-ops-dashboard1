# Acquisition to outreach repair

## Scope and behaviour

The old queue action marked a handoff actioned without creating a Growth target.
The separate promoter was LinkedIn-only and returned a generic pipeline URL.
The pipeline could read `targetId`, but rendered meeting controls for every target.

Accepted B2B and partner opportunities now use one promotion implementation via
either the existing action endpoint or start-outreach endpoint. Promotion finds or
creates a tenant-owned `growth_targets` row, records the existing acquisition audit,
and returns `organisationId`, `targetId` and `acquisitionItemId` in the destination.
The transaction rolls back both target and queue changes on failure.

The queue shows one Start outreach action. An audited, tenant-verified target gives
an Open outreach link, including for later engaged/converted records. Old actioned
handoffs without targets remain repairable through Start outreach.

The target-specific page shows identity, recorded business email, source email
verification evidence, acquisition history, prepared context, current lifecycle,
last action and next due date. It reuses message generation and verified manual
completion. Only meeting/conversion targets show call/outcome controls. The generic
pipeline remains unchanged. Nothing sends automatically or claims delivery.

## Identity and safety

- Only `b2b_lead` and `partner_opportunity` can be promoted.
- A valid LinkedIn profile or a recorded syntactically valid email plus business
  name is required. Company name alone is insufficient.
- The confirmed `buyer_role` is optional; `headline` remains a fallback.
- `email_verification` is displayed as source evidence, not reinterpreted as a
  universal verification guarantee. No additional metadata format is invented.
- Metadata, prepared drafts and engine state remain on the original acquisition
  row, reachable from the target. They are not replaced by a reduced copy.
- Identity conflicts or multiple matches stop promotion. Existing target lifecycle
  fields are never reset. Only missing identity/context fields can be filled.
- Stronger engine/reply evidence still controls lifecycle. Existing Personal
  source-owned manual-completion restrictions and partner autopilot are unchanged.
- The brief database transaction locks target writes to cover legacy writers that
  do not participate in advisory locking. No network calls occur under that lock.

## Migration and rollout

`20261007100000_acquisition_target_promotion.sql` adds only the service-role-only
`promote_acquisition_target(uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)` function.
No table, index, stored lifecycle enum or existing RPC is replaced. No backfill is
required. Apply through the normal reviewed migration process before deploying
the new application code. This work has not applied the migration to any live DB.

The migration was exercised in disposable PGlite databases. Production/Preview
must still verify one accepted business record and one already-actioned legacy
handoff. Do not send while verifying promotion. Confirm the target ID, single audit
receipt, source evidence, and no `last_action_at` or delivery claim on creation.

## Verification and remaining limits

Focused tests cover promotion, supported types, Personal/Social rejection,
LinkedIn, legacy URL reuse, retries, identity ambiguity, tenant isolation, atomic
rollback, queue links, API routing, actual UI handlers and meeting presentation.
The standard security command includes the new suite.

Focused acquisition/promotion/ingestion/tenant verification: 40 tests passed.
LinkedIn identity, Phase 4G isolation and legacy mark-sent checks: 3 passed.
The end-to-end test drives Accept and the actual Start outreach UI handler through
the real routes and migration in PGlite, then reads and renders the real target ID.
Latest full security run: 242 passed, 11 failed (253 total).

Typecheck and production build passed. Build used process-local fake credentials
and an unreachable loopback Supabase URL because this checkout has no live config;
this is a build check, not a provider integration test. No environment file changed.

The baseline security suite was already red before implementation (229/240,
11 failures): older cadence expectations, two email tests, and an incomplete
generation-test dependency fixture. The broader suite still reports those failing
test names. Repository-wide lint also has pre-existing errors; all changed
production TypeScript/TSX files pass targeted lint. Do not call this live-verified
or merge-ready solely from the focused tests.

The 11 remaining baseline test names are:

1. growth mapping derives only existing cadence and honours explicit next steps
2. email intake uses stable message dedupe and preserves thread/outreach references
3. approve-send rejects wrong tenants, deduplicates approvals and leaves failed dispatch retryable
4. existing cadence is shared and due timing is preserved
5. fallback drafts use real contact and Growth Profile context without the retired generic phrase
6. contact lifecycle deduplicates current work and separates recent receipts from future manual cadence
7. source engine schedules are recorded intent; due manual growth work requires a human
8. Mark Contacted advances once and uses the existing three-day follow-up date
9. sequence completion repairs parked status but elapsed time never implies a send
10. LinkedIn acceptance reflects contacted, due, engaged, parked and commercial lifecycle
11. every AI/growth handler denies anonymous, foreign tenants and ambiguous memberships before business access

The last test's shared fixture currently lacks `@/lib/brandGrowthProfile`; the
dedicated promotion and tenant-security suites pass. No unrelated cadence or mail
implementation was changed to make these tests green.

## Changed files

- `app/api/growth/acquisition/route.ts`
- `app/api/growth/acquisition/[id]/action/route.ts`
- `app/api/growth/acquisition/[id]/start-outreach/route.ts`
- `app/api/growth/pipeline/route.ts`
- `app/dashboard/components/AcquisitionHandoff.tsx`
- `app/dashboard/growth/acquisition/page.tsx`
- `app/dashboard/growth/pipeline/page.tsx`
- `app/dashboard/growth/pipeline/OutreachWorkspace.tsx`
- `lib/acquisitionPromotion.server.ts`
- `lib/acquisitionWorkflow.ts`
- `lib/contactLifecycle.ts`
- `supabase/migrations/20261007100000_acquisition_target_promotion.sql`
- `tests/acquisition-promotion.test.mjs`
- `tests/acquisition-actions.test.mjs`
- `tests/growth-consolidation.test.mjs`
- `tests/home-control.test.mjs`
- `tests/tenant-generation.test.mjs`
- `package.json`
- `docs/acquisition-outreach-bridge.md`
