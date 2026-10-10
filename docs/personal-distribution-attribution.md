# Personal Distribution + Attribution

Additive to existing Acquisition, scheduled_posts, Publishing and Approvals. No new page, navigation, queue, publisher or publishing table. No Ops migration.

- PUBLIC_RESPONSE: unchanged Personal Signal qualifications/actions. Reddit stays CONTENT_SIGNAL only; no consumer contact/email route is introduced.
- SOCIAL_CONTENT: verified Content Signal shows an editable standalone content draft in the existing Acquisition card. Existing Google Social Queue `Draft` is mapped to content_draft, never used as a prepared individual reply. Choose an actually supported text channel (LinkedIn/Facebook/Threads); create a draft in existing Publishing/Approvals. Instagram requires visual assets and is deliberately not offered by this text-only handoff.
- SEARCH_ASSET: explicitly verified Search Demand remains an educational brief on acquisition metadata, with an optional tagged CTA, editorial review and manual website/article publication. No SEO rank or automatic website publication is claimed. The Google Search Demand tab remains pending its existing stable-ID/safety requirements; these are not weakened here.

## Publishing handoff

Use existing authenticated acquisition actions create_content_draft/route_publishing. Save exactly one stable scheduled_posts record per organisation/acquisition, with deterministic UUID, edited standalone copy and a tagged Capacity Check CTA. Existing scheduled_posts.meta stores acquisition UUID, campaign ID `pa-UUID`, asset/scheduled post UUID, source_engine, exact source_record_id, output action type, theme and asset type. No Sheet row identity. Tags carry only neutral IDs and allowlisted source/medium; theme/source text/identity never enter URLs.

The record uses existing **pending** status and meta.approvals.state=pending. Both current automated dispatchers select only queued/scheduled, so this pending draft requires human review and explicit existing Post now. No dispatcher or provider logic is changed. The deterministic primary key handles simultaneous inserts; retries verify ownership/source and do not replace edited/published records. The normal acquisition action RPC adds handoff/audit evidence. If audit persistence fails after draft creation, the pending record remains safe and retry reuses it; this is not a transactional cross-table insert.

Activation: server-only `PERSONAL_DISTRIBUTION_ENABLED=true`, default disabled. Enable only against an isolated test database for Preview acceptance while Production writes are prohibited. Live Preview without isolation is read-only for this work. No external posting/sending was run.

## Performance

Existing Acquisition card shows verified linked publishing status/approval (Published requires a non-simulated provider posted-ID receipt and posted timestamp) and aggregate Root funnel counts. Query scheduled_posts by tenant and stable asset ID. Root requests contain only the tenant-authorised Personal acquisition UUIDs on the current page (maximum 25). Never request or display individual funnel identities/health data. Strip any additional fields from the remote result. Missing config/schema/network remains **Unavailable**, including reach/clicks because no verified social metrics integration is connected to these assets. Connected, valid aggregate responses can legitimately show zero.

Server environment: ROOT_PERSONAL_ACQUISITION_URL (HTTPS aggregate endpoint) and ROOT_PERSONAL_ACQUISITION_TOKEN matching Root's PERSONAL_ACQUISITION_OPS_TOKEN. No public env/credentials, no new client tracking service. Root cookie secret remains exclusively in Root.

The matching Root PR contains the **unapplied** event migration and recording endpoints. Stop before Production migration/activation or merge. Existing partner auto-dispatch, B2B, LinkedIn cadence, Google engines/Sheet layout, commercial introducer accounting and successful lead-email saves remain unchanged.

Fixture acceptance: tests/personal-distribution.test.mjs traverses the real action route and existing action RPC into a real ephemeral scheduled_posts fixture, checks stable metadata/CTA/pending approval, repeat and concurrent requests, tenant-scoped aggregate-only reads and no external dispatch. No old Vertex redirect was manufactured into a signal.

## Changed files

- `app/api/growth/acquisition/[id]/action/route.ts`
- `app/api/growth/acquisition/route.ts`
- `app/dashboard/growth/acquisition/page.tsx`
- `app/dashboard/growth/acquisition/PersonalDistributionPanel.tsx`
- `lib/personalDistribution.ts`
- `lib/personalDistribution.server.ts`
- `docs/google-engine-state-personal.config.json`
- `docs/personal-distribution-attribution.md`
- `tests/personal-distribution.test.mjs`
- `tests/acquisition-actions.test.mjs`
- `tests/acquisition-promotion.test.mjs`
- `tests/personal-signals.test.mjs`
- `tests/engine-state.test.mjs`
