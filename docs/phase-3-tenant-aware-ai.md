# Tenant-aware AI and growth

Phase 3 connects the existing generators to each organisation's saved business
context. It does not introduce discovery, analytics ingestion, platforms,
autonomous posting, scheduler changes or a dashboard redesign.

## Request boundary

Every handler under `/api/ai` and `/api/growth`, plus the older `/api/coach`
endpoint, uses `withTenantRoute`. It resolves the authenticated user through
Phase 1 `requireOrganisation` before the handler can read history, mutate data
or call a model. Generation and mutations require owner/admin/manager; GET
metadata and ordinary history reads permit members. The POST outcomes-list
endpoint retains the stricter write-role requirement.

Select an organisation using `organisationId` (or `organisation_id`) in the
query or request body; multipart CSV imports accept the same form fields.
Conflicting selections are rejected. Users with multiple memberships must
select explicitly. Browser callers forward an explicit page
`?organisationId=<uuid>` selection; there is no environment, localStorage,
first-membership, newest-organisation or record-derived ownership fallback.
This change adds no new organisation-switcher UI.

Growth experiments, events, outcomes, patterns, scheduled-post history and
outreach targets are filtered by the verified organisation. Linked experiment
and source-post IDs are checked before inserts. Direct growth dashboard reads
and server actions recheck membership and scope their queries too. Usage/plan
lookups use the same verified organisation rather than a global first row.

## Model context and safety

`getOrganisationGenerationProfile()` supplies the existing typed profile.
`tenantGeneration.ts` passes the business, customers, offer, voice, excluded
topics and growth mode as JSON in a **user/data message**, never interpolated
into system instructions. Logo data and private branding contacts are omitted.
Image generation has only a text prompt, so the same policy and clearly marked
data block are included in that prompt. Uploaded images use organisation-prefixed
storage paths; the existing public image-delivery behaviour is retained.

The shared system policy treats profile text, request text and history as
untrusted data. It requires excluded topics to be respected and prohibits
invented facts, statistics, testimonials, customer results, certifications,
prices and features. Hypothetical stories must be labelled. Health-specific
claim restrictions are conditional on the business context or requested subject;
ordinary business content does not receive a medical-only baseline prompt.

Platform formatting and API output shapes remain. Saved CTA/destination are
preferred where useful; posts need not all be sales pitches. Root Health,
Root Cause Power, Glass Human, founder biography, HR/EAP targeting, therapy
positioning and default stress/burnout scenarios were removed from generic
generation prompts. Root Health-specific context now comes from its own saved
profile. Existing explicitly requested health-topic detection remains useful.

The model sees only history retrieved within this tenant, or content deliberately
submitted in the current request. Client-submitted text is untrusted source
material, not proof of customer facts. These prompt safeguards cannot guarantee
perfect model compliance; existing human review before publishing remains
necessary. Tests inspect model requests without making live model calls.

## Required deployment migration

Apply `supabase/migrations/20260923120000_growth_tenant_ownership.sql` **before
deploying**. It adds nullable organisation ownership to the existing
`growth_targets`, `growth_plans` and `hook_patterns` tables, indexes the ownership
columns, and revokes direct browser-role access to those server-managed stores.
The migration assumes those existing feature tables and UUID organisation IDs.
No columns are added to `organisations`. No new environment variables are needed.

Older rows without ownership remain unassigned and invisible. An operator must
verify the owner of each legacy row before assigning an organisation_id. Do not
bulk-assign by newest organisation or an environment variable. Hook templates
that are intentionally shared should be explicitly copied into the appropriate
organisations after review. No automatic data reassignment is performed here.

The existing Brand + Growth Profile migration is still a prerequisite. Missing
profiles use its safe empty defaults/name fallback; missing tables or failed
membership checks fail closed before AI calls. The new migration is tested in
local PostgreSQL via PGlite, not applied to a live Supabase project by this PR.

## Verification

Security regressions exercise every AI/growth handler with anonymous,
cross-tenant and ambiguous-membership requests before any business-data access
or model call. They also verify bakery and saved Root Health context, excluded
topics, lower-trust profile text, ignored request-supplied profiles, conditional
health safeguards, viewer restrictions, foreign targets and experiment links,
scoped pattern heuristics, explicit browser selection, unchanged publishing
request URLs, and migration grants/unassigned legacy rows.

Run `npm run test:security`, TypeScript, production build and targeted ESLint.
Existing lint debt in large legacy routes/pages is reported separately; the
changed-file comparison introduces no new diagnostics. No live model output,
Supabase deployment or external-platform end-to-end test is claimed.

## Route audit

### /api/ai (22 routes)

- `/api/ai/brainstorm`
- `/api/ai/campaign`
- `/api/ai/campaign/structured`
- `/api/ai/campaign-path`
- `/api/ai/course`
- `/api/ai/deep-teach-section`
- `/api/ai/elite-deep-teach-section`
- `/api/ai/growth-engine`
- `/api/ai/guide`
- `/api/ai/improve-presentation`
- `/api/ai/improve-slide`
- `/api/ai/presentation-outline`
- `/api/ai/programme`
- `/api/ai/quick-blast`
- `/api/ai/reply`
- `/api/ai/root-coach`
- `/api/ai/slide-art`
- `/api/ai/slide-image`
- `/api/ai/story`
- `/api/ai/story-series`
- `/api/ai/webinar-outline`
- `/api/ai/worksheet`

### /api/growth (23 routes)

- `/api/growth/experiments/coach-feedback`
- `/api/growth/experiments/create`
- `/api/growth/experiments/delete`
- `/api/growth/experiments/list`
- `/api/growth/experiments/log-event`
- `/api/growth/experiments/outcomes/add`
- `/api/growth/experiments/outcomes/list`
- `/api/growth/experiments/set-status`
- `/api/growth/experiments/status`
- `/api/growth/followups-due`
- `/api/growth/generate-call-prep`
- `/api/growth/generate-daily-queue`
- `/api/growth/generate-message`
- `/api/growth/import-targets`
- `/api/growth/mark-sent`
- `/api/growth/patterns/list`
- `/api/growth/patterns/save`
- `/api/growth/patterns/suggest`
- `/api/growth/pipeline`
- `/api/growth/update-call-outcome`
- `/api/growth/update-deal`
- `/api/growth/update-lead-quality`
- `/api/growth/update-reply`

Additional boundaries: `/api/coach`, `/api/usage`, and `/dashboard/growth/update-call-outcome` (delegates to the protected API). Growth tracker, waiting and follow-up server pages/actions are also scoped.

Creative form: the profile supplies context, not a script. Explicit creative form and tone take precedence over brand defaults within saved exclusions and safety constraints. Shared prompts support narratives, reflections, explainers, opinions and other forms without mandatory offers, CTAs or hashtags. Story endings no longer require comment invitations; Quick Blast and Brainstorm preserve their JSON contracts without fixed prose templates. Regression coverage checks actual outgoing model requests; prose quality still requires human review.
