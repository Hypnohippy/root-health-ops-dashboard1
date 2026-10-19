# Phase 1: Solution Brief foundation

Scope: existing HR request → reviewed internal Solution Brief → one source-linked presentation. Design source: `outputs/resources-campaigns-creative-audit.md` supplied in the task. No Promo Pack, PPTX, publishing handoff, remote audience session or general Ask Root execution is introduced.

## Ownership and privacy

- Requests previously loaded/updated through browser REST with the anon key. The dashboard now uses server routes checking authenticated membership, role and verified organisation scope.
- Resource CRUD previously trusted caller organisation IDs. It now uses the existing tenant wrapper; related sequence ownership is checked. Both existing upload paths verify membership and resource ownership before uploading.
- Proposed request ownership is nullable for legacy records. There is **no inferred ownership or backfill**. Public intake uses only `PROPOSAL_REQUEST_ORGANISATION_ID`, configured server-side; the request body's organisation is evidence, never authority. Without the setting intake fails closed with 503.
- Audience and presenter windows previously consumed full resources through browser caches/storage events. Both now fetch an authorized resource by ID. Audience responses use an explicit allowlist; full-resource browser-cache shortcuts are removed. Local slide navigation synchronization remains; no remote mode is added.
- Presentation client/PDF slide projections omit private goals, scripts and notes. New layouts share one audience-only renderer. Presenter console separately renders private script/facilitation/transition/timing text. No external audience link or client-send action is added.

## Request → brief contract

`solution_briefs` stores `organisation_id`, `source_request_id`, immutable `source_snapshot`, separate `recommendation`, `status`, `version`, reviewer/time and presentation link. Snapshot identity and contents cannot be changed by an update trigger. The create RPC locks/reads the owned source and is idempotent for `(organisation_id, source_request_id)`.

New intake also preserves the original JSON submission in `proposal_requests.submission_payload`. Its fields are used as recorded facts rather than the existing intake's default titles. Legacy requests without raw submissions are labelled accordingly; their recorded fields may include historical defaults. No existing submitted fields are rewritten by the migration or brief flow.

Recorded fields, where supplied: client organisation, requester/email, intervention/initiative, audience, submitted need/notes, desired outcomes, delivery format/preference, duration, timing, location, budget clues, measurement and constraints. Missing or explicitly uncertain fields remain listed separately.

Recommendations are deterministic draft suggestions, editable and visibly labelled interpretation: understood need, intervention, audience, outcomes, format, session count, duration, supporting resources, measurement, constraints and commercial guidance. They are not additional recorded facts. Approval requires audience, outcomes, duration and format. There is no configured rate-card integration; pricing stays internal, human-reviewed and unsent.

Actions: create reviewed draft; save reviewed draft; approve; generate presentation. Editing an approved brief requires fresh approval. Version comparisons prevent lost updates. Once a presentation is linked, that brief's approved recommendation is frozen in this flow; subsequent presentation edits use Resources.

## Brief → presentation contract

Generation reuses `/api/ai/presentation-outline` in-process, including its existing tenant profile, safety policy, provider and allowance checks. The brief supplies intervention/topic, audience, outcomes, duration and delivery context. Raw request payload/contact data and commercial working notes are not passed wholesale into generation.

An atomic claim prevents concurrent generation. An interrupted attempt can be deliberately retried after ten minutes. Completion inserts the resource and updates the brief in one transaction. A unique source-brief link and completion idempotency prevent two primary presentations. Failed generation releases its claim; there is no automatic send or publishing retry.

`resource_library.source_solution_brief_id` is a composite tenant foreign key. The reverse `solution_briefs.presentation_resource_id` opens Resources by exact ID. Origin widgets link back to the approved brief and source request; client labels are display values only, never record matching. Linked source records cannot be silently deleted out from under the brief. Deliberate resource duplication creates an ordinary independent copy, not another primary linked presentation.

New presentations use eight slides with seven layout kinds: hero, divider, framework, evidence, exercise, reflection and summary. Because this intake provides no verified statistical dataset, the evidence slide shows an explicitly proposed measurement plan, not invented statistics. Existing standalone creation handlers and editorial controls remain intact.

## Proposed migration and rollout prerequisites

`supabase/migrations/20261019120000_solution_brief_foundation.sql`:

- Adds nullable request ownership and raw-submission evidence; adds the brief table and resource linkage.
- Enables RLS and removes browser-role table access; server routes use the service role only after membership/role checks.
- Adds immutable source enforcement and service-role-only creation/claim/completion functions, all security invoker with a fixed search path.
- Does not assign legacy ownership, generate content, send messages or update existing submitted fields.

**Not applied to Production.** Tested using disposable PGlite/PostgreSQL fixtures. Before any deployment: review against the target schema, apply to an isolated non-Production environment, explicitly configure the public intake owner, verify ownership of intended pilot requests, and run an authenticated Next.js/Preview smoke test there. Supabase CLI advisors and a live PostgREST round trip were not available in this local fixture run. Creation RPC returns scalar JSONB to avoid composite-row/array response ambiguity.

The current public intake can belong to one explicitly configured organisation; this does not introduce a multi-tenant public-form routing system. Leave unverified historical requests unassigned. Any future ownership assignment is a separate reviewed operation.

## Verification

- 16 Phase 1 tests: migration leaves source fields unchanged; role grants; tenant/role isolation; immutable provenance; source versus interpretation; approval/version gating; existing generator inputs; concurrent/idempotent creation; failure/retry; interrupted recovery; audience API/render privacy; standalone CRUD; intake binding; React review/error/recovery behavior.
- 11 Resources/Campaign/Publishing workspace tests.
- 42 tenant security/profile/social cleanup regressions.
- Combined focused run: **69/69 passed**.
- TypeScript checked; new files lint clean; existing changed legacy files add no lint errors against main.
- A broader pre-existing `tenant-generation.test.mjs` run remains blocked by its VM loader resolving `./linkedinConnectionDiscovery` in unchanged LinkedIn code. No LinkedIn production or test files are changed for this feature.

Reproduce focused verification:

```sh
node --test tests/solution-brief.test.mjs tests/resources-visual-system.test.mjs tests/campaigns-visual-system.test.mjs tests/publishing-visual-system.test.mjs tests/tenant-security.test.mjs tests/profile.test.mjs tests/social-response-cleanup.test.mjs
npx tsc --noEmit
```

Controlled browser pilot:

```sh
node scripts/solution-brief-pilot.mjs
```

The pilot compiles the actual React screens and invokes the actual API handlers with disposable PostgreSQL and a controlled provider response. It does not load live credentials, call OpenAI, publish externally or use Production data. It substitutes the outer dashboard/auth shell and current-user fixture; it is not a deployed Preview or live-AI quality certification. Desktop and 390px mobile checks verify review/approval, generation, reload, Resources opening, source links, layouts and presenter/audience separation. A real authenticated Preview with the reviewed migration remains a rollout gate.

Recommendation: **READY FOR SOLUTION BRIEF PILOT**, limited to controlled non-Production use after the above migration/configuration review. Not authorization to merge or roll out to Production.
