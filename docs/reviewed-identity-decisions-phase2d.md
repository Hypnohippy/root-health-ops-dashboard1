# Phase 2D — reviewed identity decisions and explicit research persistence

Base: `fed70fcedc2a47692c1fd86236cc94e63c951b1b` (merged PR #100).
This branch is a new Draft. No Production migration, configuration, business-data
write, send or merge is authorised/performed by this implementation.

## Schema audit and the bounded extension

Existing `relationship_workspaces` and `relationship_source_links` remain the
canonical workspace/attachment model. Existing `relationship_identity_decisions`
already stores symmetric reviewed endpoints, reviewer, timestamp, aliases,
revisions and append-only history. Existing `founder_research_records` stores
research snapshots and source provenance. Existing PR #98 remains the activity
writer; this phase adds no note/call/email/task writer or new person table.

The missing contracts are an atomic source-plus-workspace operation, a retry
receipt independent of activity, and a durable research-evidence destination
which does **not** make research an identity source. The proposed migration is:

`supabase/migrations/20261023193032_reviewed_identity_decisions.sql`

It adds:

- one append-only server-only `relationship_review_receipts` table containing
  tenant, actor, request UUID, SHA-256 request digest, result IDs and recorded time;
  it does not duplicate source content or become an identity store;
- nullable `founder_research_records.linked_relationship_workspace_id`, a composite
  tenant/workspace foreign key and partial lookup index;
- service-only `relationship_review_snapshot` and
  `commit_reviewed_relationship_decision` functions, with empty search paths,
  database membership checks and explicit browser-role revocations.

There is no seed, backfill, historical rewrite or source-row update in the migration.
Existing grants/RLS remain intact; RLS is enabled on the new receipt table with
no browser policies. The existing general identity reconciliation gate is not
enabled, and the new endpoint cannot execute `same_relationship` or merge.

Apply this migration only after implementation/migration review and explicit
execution authorisation. It has been exercised only in local PGlite databases
built from the canonical schema-only Ops baseline plus the existing PR #84 migration. No hosted branch was created.

For an unused installation, reversal is removal of the two functions, receipt
triggers/table, partial index, FK and nullable column. After use, retain receipts
and evidence linkage; rollback needs a reviewed retention/export decision and
must not drop recorded user decisions or approved evidence automatically.

## Common review and confirmation contract

PREVIEW → REVIEW → explicit checkbox/button → guarded transaction → canonical re-read.

Server-issued HMAC-SHA256 review tokens bind the exact server-built proposal to
tenant, actor, receipt UUID, canonical-input digest and a 15-minute expiry.
The existing server-only service secret signs tokens; no new credential or
browser secret is introduced. Browser fields cannot replace reviewed claims,
source refs or destinations. Tokens contain the current user's reviewed inputs;
they must not be logged, shared or sent to external research providers.

The UI never retries automatically. After an uncertain response it retains the
same token/selected URLs and exposes an explicit safe retry. A receipt is checked
before stale-input rejection, so an already committed action can be reread
without creating another source/workspace/evidence record. Changed receipt
payloads or actors fail closed. Expired tokens require a new review; source
uniqueness and existing intake checks still prevent creating the same source ID.

## Create and attach

Manual Acquisition, manual Responses and new explicit Founder capture now return
a reviewed proposal (HTTP 202), not a source insert. Existing owned Founder
record edits keep the existing save contract with an expected-version check; they cannot replace recorded identity fields or overwrite approved linked public evidence. Explicitly unsaved evidence is excluded from reasoning. Manual Acquisition retains its
existing domain parser, type/public-context confirmation and stable submission
UUID. The same operation is reachable from Relationships review; it delegates to
these existing source routes, rather than introducing per-screen create APIs.

An unknown/unnamed subject stays a draft: a recorded person/company name and a source kind compatible with existing identity policy are required; note text is never promoted into an invented identity.

An established match blocks creation and returns the existing destination.
A possible match blocks normal creation and returns review candidates. A user
may explicitly review a candidate as a distinct identity: all exact candidate
refs are shown, and source/workspace creation plus KEEP_SEPARATE ledger entries
commit together. A newly established match is never overridden by this action.
Pending candidates are not fabricated as already stored ledger endpoints.

Before commit, the server rereads canonical intake using current tenant-visible
sources and the existing partition/ledger. The transaction compares the reviewed
input digest and creates the source, workspace, source link and receipt together.
Any failure (including attachment or separation validation) rolls everything back.
The workspace is the existing canonical person/company representation; no second
person store is created. Retries return that same canonical destination.

## Concurrency and lock boundary

The digest covers tenant rows in Acquisition, Inbox, Growth, Founder, workspaces,
source links and identity ledger, including workspace revisions. It is captured
before canonical preview and checked again at confirmation and under transaction
locks. Any intervening change conservatively requires re-review, even if harmless. Stale create confirmations return the current permission-visible intake decision/destination; the UI offers that safe review link and never applies the old decision.

The transaction uses the existing workspace lock (742), then identity-ledger lock
(5805), followed by SHARE ROW EXCLUSIVE locks in one fixed source-table order.
Table locks close insertion phantoms from legacy source writers that do not take
the workspace advisory lock. They are brief but affect concurrent source writes
across tenants; a two-second lock timeout fails closed instead of waiting forever.
This is a deliberate tradeoff requiring hosted operational review; it is not a
new background lock service. No sending/cadence rules or provider APIs change.
PGlite tests prove transaction rollback and queued concurrent submissions, not
multi-connection hosted lock performance; that remains a hosted smoke requirement.

## Keep separate and material-new-evidence rule

Only owner/admin reviewers can record separation. Exact endpoint refs are sorted;
A/B and B/A use the same existing ledger pair. Endpoint source records, source
ownership, workspaces and lifecycle remain unchanged. Existing cannot-link
constraints prevent implicit consolidation. Search preserves both results and
shows explicit separation instead of repeating an unchanged unresolved association.

A new canonical LinkedIn alias or newly verified **personal**, non-shared email
on an endpoint may reopen the review prompt. The evidence is compared with the
aliases actually reviewed in the ledger. A new matching basis does not revoke
the cannot-link; only another explicit reviewed decision could supersede it.
Names, company/domain wording, cosmetic edits, repeated searches and AI confidence
alone never reopen or override separation. Existing deterministic matching rules
are otherwise unchanged. General merge/reversal authority remains out of scope.

## Research save/link

The selected canonical relationship is read before invoking the existing public
research service. Only recorded professional selectors and canonical aliases go
to that service; private correspondence, review tokens and the user question do not.
The existing exact-profile/mixed-namesake quarantine is retained.

The user selects source URLs from the signed preview and confirms separately.
Only matched attributed facts whose **entire** source list was selected are saved.
Unverified candidates may be displayed, but their selection controls are disabled
and the server rejects persistence. A browser-supplied URL/claim cannot expand the
signed preview. Company context cannot establish person identity.

Approved evidence uses the existing protected Founder snapshot, with a small
`phase2d` provenance envelope: verification status, approving actor, database
approval time, exact reviewed source refs, facts and source URL/title/publication/
retrieval dates. Publication, retrieval, approval and saved times remain distinct.
No role, company, email, profile, lifecycle or recipient-intent field is inferred.

Evidence has a tenant-FK link to the canonical workspace. It is deliberately NOT
inserted into `relationship_source_links` as another identity source. Identity
input excludes evidence-only Founder rows. Permission-checked canonical reads
include approved evidence only while its original refs still belong to the
selected canonical scope. Destination/revision drift blocks an old save.
Refresh/render/Ask Root remain read-only. Ask Root receives separately labelled
approved historical public evidence, never current internal truth or identity
authority. Unverified/rejected associations remain excluded.

## Verification and release boundary

Tests use newly created in-memory PGlite databases, the versioned canonical
baseline and synthetic users/orgs/source rows only. External research is replaced
with controlled provider responses; database inserts, constraints, locks,
privileges, triggers, ledger appends and rollback are real PostgreSQL execution.
UI tests exercise the actual React confirmation hook. No Production data is read
or changed for these tests and there is no hosted test residue to clean up.

Exact-HEAD authenticated desktop/mobile **write** verification is not claimed.
The new migration remains unapplied to Production. Attempt 4 applied it only to
an authorised temporary branch, subsequently deleted. Full hosted verification
remains incomplete and requires a newly authorised isolated database; do not
click confirm against real business records or apply Production DDL to bypass it.
Required hosted proof: synthetic create/attach and retry, symmetric separation and
search, selected matched evidence and namesake rejection, stale review, canonical
reread, 1280×900 / 390×844 controls and no horizontal overflow. Do not create a
paid branch without cost approval.

## Persisted-decision clock boundary

Attempt 4's pending distinct-source KEEP_SEPARATE transaction committed its new
source/workspace/link/receipt and separation ledger row, then the immediate
canonical reread threw `Invalid identity decision.` No write rollback or missing
receipt caused that failure; a later reread succeeded without a repair.

The Phase 2D RPC calls the existing `append_relationship_identity_decision`.
That function omits `decided_at` from its INSERT, so the existing ledger column's
`clock_timestamp()` default supplies a PostgreSQL `timestamptz`. This is the
database wall clock, not `now()`, transaction/statement time or a supplied fixture.
PostgREST returns it as an ISO timestamp. `ledgerDecisions` maps it unchanged to
`decidedAt`. After commit, `readOperationalIntelligence` prepares its read policy
with application `new Date().toISOString()`. The partition previously rejected
`Date.parse(decidedAt) > Date.parse(policy.asOf)` with no allowance.

Observed 24 October 2026 UTC: persisted `decided_at` was
`10:15:10.144084Z`, while the already-written failure report had local timestamp
`10:15:09.476Z` (at least 667 ms ahead). A bounded read-only SQL clock probe
independently put database time 808 ms ahead of the local after-response clock.
The stored decision remained valid and a later canonical read succeeded. The
failure is demonstrated for a hosted database with actual server modules running
in the local verification harness; no Vercel reproduction is claimed.

There is no existing authoritative database-clock read API for this projection.
Adding one would require schema/API work; using the greatest stored decision time
as a clock would hide arbitrarily future-dated rows. Instead the partition has a
private, fixed **2,000 ms** maximum solely for the future-time check on existing
`simulation === false && authority === 'persisted'` decisions. This covers the
observed sub-second skew with a small bounded margin. Exactly 2,000 ms is accepted;
2,001 ms and materially future timestamps fail. Hypothetical decisions retain
zero allowance. Malformed decision/read timestamps fail closed. No timestamps are
clamped, rewritten, saved or retried automatically.

The allowance cannot relax tenant, actor, source, evidence, revision, provenance,
permission, matching or separation checks. Review signatures, snapshot equality,
replay receipts and the 15-minute token lifetime are unchanged. The constant is
not exported as a general clock or freshness bypass. No SQL, migration, grant,
RLS, source catalog, provider, UI or Ask Root behavior is changed.

Deterministic fixtures cover equal/past/observed-skew/inside/exact/outside-bound
and materially future decisions, strict hypothetical/untrusted input and invalid
timestamps. The server/database test fixes the application read at exactly 808 ms
behind the newly committed database timestamp, then asserts canonical success,
receipt replay, one source/link and unchanged ledger evidence. It uses no sleep
and no timestamp rewrite. Full hosted separation/research/concurrency verification
still needs renewed explicit approval; no additional branch is part of this fix.

## Deferred

No automatic same-person decisions, bulk dedupe/merge/cleanup, global identity
graph, lifecycle redesign, autonomous enrichment/persistence, sends, provider or
calendar writes, cross-tenant association or send-governor bypass. No Phase 2E.
