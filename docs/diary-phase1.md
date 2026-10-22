# Diary Phase 1: read-only operational dates

Base: `2b2ed7ac26c1c1c43f0c247a354ebb4371c52bf4`.

## Architecture and authority

`readDiary` is shared by the authenticated server page, GET `/api/diary`, and deterministic Ask Root Diary answers. The existing tenant membership helper authorizes the selected organisation before any source query. Every reader is organisation-scoped; the pure projection independently rejects foreign rows. No Diary table, lifecycle transitions, provider calls, or write routes exist. Refresh and return-to-tab re-read source state; no reconciliation or scheduled job is introduced.

The existing `readLifecycleInput` and `buildContactLifecycle` retain all identity, reply suppression, cadence, terminal and handled-email rules. Diary consumes their current dated action, rather than computing cadence again. The canonical contact action prevents duplicate cross-source follow-ups. IDs distinguish source/date purpose; structured call evidence matching the projected action is collapsed into one call. A separately dated preparation task remains distinct.

## Sources and provenance

- Acquisition, Responses and Growth: existing lifecycle `nextDueDate` for follow-up, waiting, nurture, meeting or explicit dated next step. Undated work is not assigned an invented date.
- Growth: `call_date` only on existing lifecycle meeting records, excluding closed outcomes. Plain conversation text never creates an appointment. Past calls are historical, not overdue tasks. A separate next-step date can coexist with the recorded call.
- Relationships: `relationship_tasks.due_at` on open tasks with an owned visible workspace. Done/cancelled/orphaned tasks are excluded. Founder-only tasks and workspaces require existing Founder authorization.
- Every API item retains organisation, source table/id and date provenance. UI shows human labels, not raw database fields.
- Exact destinations: Responses `itemId`; Growth/Acquisition exact relationship source locator; tasks exact workspace locator. No name matching or identity merge creates links.

Canonical metadata was audited in `infra/preview-baseline/source/catalog.json`, alongside relationship workspace migrations. No standalone appointment table exists. Campaign `start_date`/`end_date` belong to the legacy advertising configuration; they do not prove a human delivery commitment. No date is inferred from campaign text or sequence JSON. A future campaign milestone adapter needs a defined actionable source contract.

## Manual entries: persistence deferred, no migration

Existing relationship tasks require a non-null workspace, so cannot safely represent an unlinked diary entry. Relationship activity events require `occurred_at <= recorded_at`; they are historical evidence, not future appointments. Journal entries and post schedules also have unrelated ownership/meaning. No fake workspace or second lifecycle was created.

Proposed minimal future schema (approval required): an organisation-owned standalone event with UUID, title, start timestamp or explicit date-only value, optional end timestamp, optional FK to an organisation-owned relationship workspace, optional note, cancelled/completed state, creator and timestamps; scoped constraints, tenant authorization, RLS/service-role contract and ordinary edit/delete tests. Events must have no effect on lifecycle or send evidence. **This proposal is documentation only.**

## Dates, views and Ask Root

One `lib/diary.ts` module owns Europe/London day keys, UK labels and calendar arithmetic. Server supplies `asOf` and `today`; initial render does not depend on browser timezone/current time. Calendar arithmetic uses UTC noon plus explicit UK formatting, avoiding DST-duration assumptions. Today separates still-actionable previous-day work, today's items, and the next 12 future entries. Waiting and historical calls are not labelled overdue. Week shows seven consecutive selected days; Month shows date/count buttons and selected-day list.

Ask Root handles today, tomorrow, overdue, this week, Diary navigation and structured calls matching a supplied name. Answers show up to 12 records and total, link to Diary, never assert identity from the name, and explicitly say when no structured meeting exists. All other guidance retains its existing routing; action requests remain blocked first. No LLM is used for Diary facts.

## Scope and verification

Focused tests cover lifecycle date ownership, handled work, tenant isolation, actual tenant middleware, task protection, structured vs conversational meeting evidence, deduplication, Today/Week/Month, UK midnight/DST, UI interactions and shared Ask Root reads. Existing Ask Root tests gain only dependency stubs for the new independent Diary branch. No source lifecycle/RelationshipTruth/Resources/Publishing code changes.

One separately run legacy discovery assertion compares `getRelationship` to pre-PR94 commit `10b6aef...` and fails on main's already-merged exact-source parameter. That unrelated stale historical snapshot test is unchanged; the affected operational/Ask Root suites are run independently.
