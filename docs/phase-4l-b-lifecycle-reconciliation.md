# Phase 4L-b: safe lifecycle reconciliation

Built on Phase 4L-a's identity and projection, from main after PR #23. No Home
changes, providers, sending, B2B sync, schedule or cron. Acquisition is read as
evidence; its human workflow and audit events are not fabricated or rewritten.

## Entry point

`POST /api/growth/lifecycle/reconcile?organisationId=<uuid>` uses the existing
tenant wrapper with **write** membership required. The body may instead specify
`organisationId`, following the wrapper's existing selection rules. No ingestion
credential, global tenant inference or client-supplied repair plan is accepted.

Returns `contactsInspected`, `repairsApplied`, `skippedAmbiguousContacts`,
`duplicatesAvoided`, `errors`; HTTP 503 for an unconfirmed run or exhausted
concurrency retries. Errors contain no database diagnostics or credentials.
`repairsApplied` counts row inserts/updates, not changed fields. `duplicatesAvoided`
counts accepted contacts already represented by one target. Skips include weak or
conflicting identity, duplicate targets and missing historical contact timestamps.

The server function `reconcileLifecycle(organisationId)` can be called later by a
trusted scheduler that supplies an authorised tenant. No scheduler is added here.

## Rules and precedence

| Evidence | Deterministic repair |
| --- | --- |
| Unarchived LinkedIn acceptance with a canonical profile and name | Create one active `connection` target if missing, unless a protected state exists. Reuse existing matching target. |
| Acceptance marked `replied`, with `contacted_at` or existing `last_replied_at` | Create a `day3_dm` target or advance an existing `connection` once; copy the action timestamp. Acceptance becomes `waiting_for_human`. |
| Email classified human_positive/human_neutral/human_negative/question, or a timestamped inbound LinkedIn DM with text | Suspend target cadence (`status=parked`, `reply_status=engaged` unless already positive/interested/engaged), preserve latest reply time, clear inbox `follow_up_at`. Unhandled human responses remain `needs_reply`; handled/engaged states remain intact. |
| Email auto_acknowledgement/waiting_for_human/out_of_office, without stronger evidence | Inbox becomes/remains waiting; target gets `status=waiting`, retaining its sequence position but leaving active Growth queues. No human reply or sent timestamp is invented. |
| Due date reached | GET adds `followUpStatus: due` (or `waiting` before the date). No write or simulated send. Existing `currentStage=follow_up` and `nextDueDate` remain intact. |
| Existing `stage=parked`, or recorded nurture | Repair target stage/status to parked. Merely reaching day17's due date does **not** prove the final message was sent. Existing Mark Sent advances day17 to parked. |
| Meeting/converted/lost in the projection | Copy to a less advanced target and suspend cadence. Never replace an existing commercial outcome with another outcome. |

Repair precedence is deliberately **not** the presentation sort order:

1. Existing meeting, converted and lost are absorbing: no automatic regression or
   conversion between conflicting commercial outcomes. Strong commercial evidence
   may promote a non-commercial target.
2. Human reply / recorded engagement suspends outreach; acceptance or automatic
   acknowledgement cannot undo it. A new human reply can re-engage nurture.
3. Nurture/sequence-complete remains parked; no automatic restart.
4. Automatic acknowledgement stays waiting, never becomes engagement by itself.
5. Timestamped Mark Contacted can only advance `connection` to `day3_dm`.
6. Acceptance can only fill a missing outreach-ready target. Archived acceptance,
   no-reply-needed and other protected manual states do not start a sequence.

The only apparent backward label correction is a **connection acceptance** marked
contacted: its legacy `replied` status is evidence of an outbound action, not of a
human reply. Real reply/commercial evidence takes precedence over that correction.

The existing 3-day / 7-day / 7-day cadence is shared through
`growthFollowUpDueAt`, also used by `isGrowthTargetDue` and the projection. No
second engine or persisted due-date clock is added. Manual post-call next steps
are preserved. Due dates never cause stage advancement or communication.

## Conservative identity boundary

The projection still displays its existing LinkedIn → email → person/company
matching. Writes require every contributing record to independently resolve to
the **same strong** LinkedIn or email identity. Person/company-only and mixed
weak/strong associations are left for a human. Multiple targets or contradictory
profile fields are skipped, not merged or deleted. Email-only evidence may repair
an existing target but never creates a LinkedIn target without a canonical profile.

## Migration and concurrency

Apply `20260924210000_lifecycle_reconciliation.sql` before using reconciliation.
It adds `inbox_items.contacted_at`, a tenant revision table, source-write revision
triggers, and a service-role-only `apply_lifecycle_repairs` function. The timestamp
trigger records future LinkedIn acceptance transitions to `replied` once, using
server time. It does not backfill historical rows, alter email send fields, or
change the Mark Contacted UI. Historical contact actions without reliable dates
are skipped rather than starting a cadence from a made-up date.

The service reads a revision, pages all three source tables, then verifies the
revision again. The RPC locks that tenant's revision and checks it before applying
the plan in one transaction. All source writes increment the same revision, so a
manual edit, send acknowledgement, ingest or another reconciliation invalidates
stale plans. Existing tenant/profile uniqueness remains in force. Conflicts,
serialization errors, deadlocks and unique races cause a fresh read/plan, at most
three attempts. Missing/foreign targets or disallowed patch fields abort the whole
transaction. No-op plans cause no source updates. Transport failure can leave an
unknown commit outcome; repeating the request is safe.

This adds a short per-tenant write serialization point. Heavy concurrent activity
can exhaust retries and return 503; it never justifies applying stale state.
Privileges deny browser roles both direct revision access and repair RPC execution.
The RPC accepts only growth state fields/accepted-target creation and inbox
response state/follow-up date fields. It cannot send, write send requests, publish,
change owners, or mutate an arbitrary table.

## Tests

`npm run test:security` includes lifecycle planner/service/API tests plus actual
PGlite migration execution: repeat runs, Mark Contacted, dates, human versus auto
replies, nurture, protected outcomes, ambiguous identities, stale/replayed plans,
rollback, cross-tenant writes and database privilege denial. Shared tenant-route
tests cover anonymous, foreign, ambiguous and viewer denial before business access.
Existing Phase 4D approval/send and Apps Script tests run unchanged.
