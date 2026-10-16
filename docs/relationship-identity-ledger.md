# Phase 5 — gated append-only human identity decisions

Base: PR #76 `4076fd4b526dbc6a20a34c5f02e00f4c249bf5aa`. Existing local work was preserved first in checkpoint `93f11e5` on `codex/relationship-truth-phase5-ledger`; subsequent changes finish validation. No existing consumer is migrated.

## Unapplied migration

`20261016154246_relationship_identity_decisions.sql` was created with the official Supabase CLI. It is additive, transaction-wrapped, and has no seeds/backfill/source updates. It has **not** been applied to Production or Preview.

One table: `relationship_identity_decisions`. Fields include tenant/id, ordered typed source refs, generated pair key, enum-bounded decision, reviewed evidence IDs, evidence summary, actor, database-created/decided timestamps, positive revision, optional note, same-tenant/same-pair supersedes FK, candidate revision, endpoint-local verified alias snapshot, Founder protection, unique receipt key and append sequence. Pair/revision and tenant/receipt are unique. Later reversals append; history is never updated or deleted. A defer revision records review state but does not revoke earlier positive/negative identity authority.

RLS enabled; no browser grants/policies. `anon`, `authenticated` and PUBLIC receive no table or function access. `service_role` has table SELECT only—no direct INSERT/UPDATE/DELETE/TRUNCATE or identity-sequence access. UPDATE/DELETE and TRUNCATE also have immutable-history triggers. Existing table grants and policies are untouched.

## Narrow append and source validation

`append_relationship_identity_decision(...)` is SECURITY DEFINER with an empty search_path and service-role-only EXECUTE. It checks owner/admin tenant membership, allowlisted source tables, both source tenants, ordered pair constraints, reviewed source IDs, receipt identity, expected tenant history head and prior pair revision. A protected append additionally requires owner membership and the application's existing Founder permission check. No arbitrary SQL/table/function dispatch is exposed.

The read-only `identity_decision_source_versions(...)` helper returns only hashes for the two exact authorised source rows. The server obtains these before reading/revalidating the candidate. Append locks those rows FOR SHARE, recomputes the hashes and rejects changed evidence. No message body is returned or placed into the append request. Tenant-wide advisory locking plus an expected append-head ID prevents two requests validated against the same graph from both committing contradictory reversals, including across different pairs. Receipt retries return the existing row; changed receipt payloads reject.

Database checks enforce actor/tenant/source existence, immutable history, canonical pair/revision/FK/receipt constraints. Application checks additionally enforce current candidate/evidence revision, exact allowed request shape, explicit confirmation, current whole-group identity constraints and Phase 4C entity shape. Full Founder authorisation remains server-side; database role checks do not replace it. The service credential remains a trusted server credential, never a browser tenant credential.

## Gate and admin workflow

`IDENTITY_RECONCILIATION_ENABLED` must equal literal `true` on the server; absent configuration means **off**. No environment variable or deployment configuration has been changed. With the gate off, no ledger table read/write occurs and the existing rehearsal remains available. A save request fails before evidence/ledger reads. Missing/unavailable storage when enabled fails closed.

The standalone owner/admin review page shows prior history, actor, timestamp, revision, supersession and current non-deferred identity authority. Every recorded choice requires explicit confirmation. One append endpoint accepts one request; no bulk decision route exists. Stable client receipts survive a failed response/retry. Synthetic examples cannot persist and any sample history is explicitly labelled illustrative/not saved.

The mixed person/company pair cannot choose same_relationship. Keep separate and Review later remain available. Association is deliberately **not** added to the three-value authority model; a distinct person/company association capability is a later reviewed phase.

## Shadow authority only

`relationshipTruthWithLedger()` consumes authorised ledger rows as structural evidence, cites `identity_decision:<id>`, and includes dated decision evidence in the shadow timeline. Existing verified structural groups plus the exact authorised positive edges delimit association; no fuzzy/name/company/domain keys are added. Hard negatives constrain exact/transitive rejoining until a later authorised non-deferred revision supersedes them. Private decisions are filtered before evaluation.

No Relationships, Responses, Outreach, Finder, Ask Root, lifecycle, cadence, Gmail, send or search consumer reads this ledger. No original row, workspace/source link, conversation, acceptance, send receipt or lifecycle state is rewritten. Persisted decisions are not operational send authority.

## Replay scope

All 52 review groups / 71 pairs use simulated stored-row fixtures only: 70 eligible same decisions and one keep-separate choice for the mixed case. This is a coverage counterfactual, **not human approval of any real association**. Real decisions saved: zero; all 52 real groups still await review. The original historical metadata capture and later supplemental ID/token search observation are reused and labelled non-atomic. No message bodies or real fixture ledger rows are committed.

Body-free metrics and the 11 probe outcomes are in `relationship-identity-ledger-results.json`. The local PostgreSQL tests apply the migration only to disposable PGlite databases; simulated source changes and decision rows there are test fixtures, not Production writes.

## Future controlled activation sequence (not performed)

Review the stacked PR and exact migration, perform a fresh live schema compatibility check, separately authorise applying the schema, verify empty table/RLS/grants/RPC restrictions, and separately authorise the server gate. Begin with one explicitly approved pair and verify its append receipt/history/shadow projection. Do not import the replay fixtures or auto-decide the 52 cases. Consumer migration remains a different future approval.

## Final local verification

Recommendation: **READY FOR CONTROLLED PRODUCTION RECONCILIATION**, subject to the separate schema/gate approvals above. This is not authorisation to apply or enable anything.

- 232/232 contracts, including 11 disposable PostgreSQL migration/security tests and 13 ledger/server contracts; TypeScript and targeted lint pass.
- 83/83 existing visual/foundation regressions pass.
- 136/138 selected operational regressions pass. The two unchanged baseline failures are `lifecycle-control.test.mjs` and `lifecycle-reconciliation.test.mjs` rejecting the existing `@/lib/linkedinSendEvidence` loader dependency. No unrelated loader fix was made.
- Database tests prove default-empty schema, browser role denial, service privilege restrictions, tenant/source rejection, actor restrictions, stale source/head/prior rejection, receipt idempotency, immutable rows, appended reversal history, and exactly one accepted competing reversal against the same head.
- Replay: all 52 groups / 71 pairs, simulated 70 same decisions and one keep-separate. Identity splits 65→14; withheld pairs 84→14. Fixture unresolved entity-shape groups 0; unsupported joins, separation violations, overlaps and entity-shape regressions 0. All 11 discovery probes pass in shadow (current 0/11). Real decisions saved 0; all 52 real groups await human review.
- Existing operational consumers do not import/read the new ledger. No Production/Preview migration, decision write, gate/config change, send, mailbox action or consumer migration occurred.
