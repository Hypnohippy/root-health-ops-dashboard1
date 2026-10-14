# Relationship workspace — Phase 1 (local implementation)

## Rollout boundary

Migration `supabase/migrations/20261014063937_relationship_workspaces.sql` is **unapplied**. No Production writes, backfill, worker changes, new sends or lifecycle transitions are part of this work. No push or deployment is required for the local handoff.

Existing lifecycle, cadence, Responses thread-local actionability, notification intake and send guards remain authoritative. Existing screen changes are Open Relationship anchors plus one Growth navigation entry. PR #58 is untouched.

## URLs and lazy persistence

`/dashboard/growth/relationships` projects existing tenant-owned lifecycle records and authorised Founder research before search/pagination. No placeholder leads or workspaces are created by GET.

Source locators are `inbox_<id>`, `target_<id>`, `acquisition_<id>` and `founder_<id>`. They address existing records, not mutable email/LinkedIn identity strings. A source URL resolves that exact tenant-owned record through current `buildContactLifecycle()` evidence. Email -> LinkedIn strengthening therefore retains the original URL. Person/company evidence is not merged by domain alone.

The first explicit persistent action calls one atomic RPC: resolve/validate source references, detect existing workspace, lazily create if necessary, save action + history and increment revision. The resulting URL is `workspace_<id>`. Original source URLs remain valid. Workspace resolution follows immutable references into the current projection. Multiple workspaces that now map to one relationship, or one workspace whose references now map ambiguously, fail closed for explicit review. No automatic history merge.

Legacy unresolvable canonical IDs produce a recovery link to search; they are never guessed. Company/person association is explicit and does not combine identity/history.

## Six additive tables

- `relationship_workspaces`: stable handle, person/company kind, retention preference, Founder protection, owner, optional separate company reference and revision.
- `relationship_source_links`: immutable existing-record references, unique per tenant/source-table/source-ID; guard verifies source belongs to tenant.
- `relationship_activity_events`: append-only typed notes, manual activities, retention/value saves, task creation/state changes and company association; actor, actual event time (nullable) and database recording time remain separate; tenant-wide idempotency key.
- `relationship_tasks`: small relationship task with due time, tenant-member owner, state and provenance.
- `relationship_pricing_models`: versioned tenant standard-pricing basis, one current default; no scope/relationship quantities inherited.
- `relationship_value_assessments`: immutable saved calculation input/result and provenance, tied to its activity event and optional tenant pricing version.

All six have RLS enabled. PUBLIC/anon/authenticated/service_role privileges are reset; service_role receives SELECT only. All mutations use service-role-only `apply_relationship_workspace_action(...)`. This SECURITY DEFINER RPC is necessary for atomic multi-table saves while keeping ordinary service-role table UPDATE/DELETE/INSERT unavailable. It locks per tenant, independently validates actor membership/write role, tenant-owned sources, Founder protection, workspace revision, idempotency and same-tenant task/company/pricing references. No SQL path updates an operational source table. Browser roles have no table/RPC access. Composite tenant FKs protect task/event/value/workspace relationships. Source-link triggers prevent source reassignment. Pricing defaults require owner/admin; ordinary workspace actions use existing owner/admin/manager policy.

Founder permission is checked through unchanged `requireFounderIntelligence()`. Ordinary tenant readers never load Founder records. Workspaces referencing Founder records are protected as a whole; their metadata/history is not exposed to non-Founder readers, even after promotion. This intentionally favours privacy rather than copying private research into public relationship data.

## Evidence and UI

Full-width detail includes Overview, Conversation, History, Notes, Strategy shell and Tasks. Exact stored communications remain plain text. Dated events sort chronologically; undated/snapshot evidence is separate and retains recording time without inventing external dates. LinkedIn notifications have no fabricated body. Email messages are selected by exact linked Gmail thread IDs, never subject guessing. Existing receipt keys and Gmail IDs dedupe known references. Manual activity is labelled manual evidence, not verified delivery; it never changes lifecycle or cadence. Scheduled meeting time is labelled scheduled, not proof a meeting occurred.

Typed strategic notes remain interpretation, not facts. Strategy AI is not wired; no fake responses or auto-drafts. Reply preparation links to the existing guarded operational workflow. Archive/stale preferences affect Relationships only. Archived unresolved Needs reply records still surface in the Relationships active view, and existing attention/operational queues are unchanged. Closed states are projected from source systems; merge/delete are unavailable pending a separate safe design.

## Commercial value

Root-compatible default method is per employee, without a guessed subscription price. Other tenants can choose per seat, retainer, annual contract, one-off project, revenue share, manual or custom scoped estimate. Custom uses an explicit documented estimate, not arbitrary executable formulas.

Potential annual subscription value = full established eligible employees × standard monthly per-employee price × 12. Expected uses explicit covered scope and negotiated rate OR discount (not both). Discount defaults to 0%. Missing inputs/sources produce Not established. Total employees do not imply eligible scope. Unknown additional services are not assumed zero; explicit zero means none. Additional services can be itemised with amounts and source. Subscription and one-off figures stay distinct; combined recurring figures are labelled first-year totals. Saved assessments are estimates, not confirmed revenue.

Every displayed Potential/Expected figure includes its basis alongside it. Server preview is read-only; saving recomputes server-side and records overrides/version/provenance. Changing organisation defaults never mutates earlier assessments. Explicitly using the current basis and saving creates a new assessment. Existing pipeline deal_value is shown separately and never overwritten by this feature.

## Implementation choices / limits

- A single scoped detail POST dispatches approved workspace actions instead of three separate activity/task/value mutation routes; the atomic database RPC is shared.
- Strategy save/AI remains a future shell as approved; manual Strategic thought notes are available now.
- Founder private workspaces are founder-only until explicit future sharing design; company association does not relax this.
- No global archive filtering, duplicate merges, permanent delete or operational status editing was added.
- Search scans tenant-scoped server pages using existing helpers. Conversation loading currently reads tenant history then filters exact known identities/threads server-side; correctness is favoured over new query/index architecture. Large-history optimisation remains future work.
- No Production data or tenant pricing was populated. Local SQL tests use an isolated in-memory Postgres fixture; visual inspection uses labelled synthetic data.

## Local verification

49 relationship-focused tests cover projection/identity strengthening, lazy creation/rollback, duplicate-workspace conflict, Founder authorisation, tenant isolation, exact conversation evidence, value methods/unknowns/itemised services, UI tabs and safe retries. 224 selected existing Founder/Acquisition/Responses/LinkedIn regression tests passed. The separate outreach-console suite remains 18/19: its existing 409-versus-200 fixture failure at line 110 was independently reproduced on untouched main before this work; generation/lifecycle logic was not changed to accommodate it. TypeScript and targeted lint are required at final local handoff.

The fixture screenshot is a synthetic render of the actual components, not a Production/Preview schema test. No remote save behaviour is claimed before migration and deployment are separately authorised.

## Exact scoped files

- `app/api/growth/relationships/[relationshipId]/route.ts`
- `app/api/growth/relationships/route.ts`
- `app/api/growth/relationships/value-preview/route.ts`
- `app/dashboard/ClientDashboardLayout.tsx`
- `app/dashboard/founder-intelligence/FounderMemoryPanel.tsx`
- `app/dashboard/growth/acquisition/page.tsx`
- `app/dashboard/growth/pipeline/OutreachWorkspace.tsx`
- `app/dashboard/growth/relationships/[relationshipId]/page.tsx`
- `app/dashboard/growth/relationships/components/RelationshipDetail.tsx`
- `app/dashboard/growth/relationships/components/RelationshipTrail.tsx`
- `app/dashboard/growth/relationships/components/RelationshipValueEditor.tsx`
- `app/dashboard/growth/relationships/components/RelationshipsList.tsx`
- `app/dashboard/growth/relationships/components/ValueSummary.tsx`
- `app/dashboard/growth/relationships/page.tsx`
- `app/dashboard/responses/linkedin/LinkedInWorkbench.tsx`
- `app/dashboard/responses/page.tsx`
- `docs/relationship-workspace-phase1.md`
- `lib/relationshipHistory.server.ts`
- `lib/relationshipValue.ts`
- `lib/relationshipWorkspace.server.ts`
- `lib/relationshipWorkspace.ts`
- `supabase/migrations/20261014063937_relationship_workspaces.sql`
- `tests/relationship-foundation.test.mjs`
- `tests/relationship-service.test.mjs`
- `tests/relationship-workspace-ui.test.mjs`
