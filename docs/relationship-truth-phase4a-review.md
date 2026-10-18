# Phase 4A — Human identity review, dry run only

Follow-up field policy: [canonical display, conflict and Finder indexing rules](relationship-identity-field-policy.md). The initial replay below is retained for audit; the follow-up results explicitly distinguish the later supplemental search observation from the original atomic capture.

Base: `e6efbaf7f7180c4caab7be6e255cf928dad3804e` / Phase 3. Stacked branch only. No existing consumer is migrated. No schema, migration or persistent decision is created. All choices in this screen are hypothetical and are discarded on reload.

## Storage audit and recommendation

Existing `relationship_source_links` is a materialised workspace attachment, not a reconciliation ledger: primary key `(organisation_id, source_table, source_id)`, required workspace FK, actor/link timestamp only. It cannot represent negative decisions, deferral, reviewed evidence snapshots, revisions or reversals without reassigning links or creating a workspace. `relationship_activity_events` likewise requires a workspace and its activity-type CHECK excludes identity decisions. Reusing either would violate the no-workspace/no-history-movement boundary.

Recommend one additive **`relationship_identity_decisions`** table in a later separately reviewed migration. This PR creates no SQL migration file and calls no decision write/RPC.

Proposed minimal append-only design:

- UUID decision ID, organisation UUID, ordered source table/UUID A and B; fixed four-table allowlist, distinct refs and canonical pair ordering;
- choice enum `same_relationship | keep_separate | review_later`;
- actor UUID, trusted server decision/recording timestamps, optional bounded note;
- schema version, positive pair revision, source/evidence revision snapshot;
- evidence IDs actually presented, bounded server-built summary, exact verified alias bindings at decision time;
- derived Founder-protection flag whenever either source/evidence is protected;
- idempotency key; unique `(organisation_id, pair, revision)` and `(organisation_id, idempotency_key)`;
- tenant/source-existence guard for polymorphic refs; no source update or workspace FK;
- RLS enabled; no anon/authenticated table grants; service role SELECT only plus one narrowly scoped future RPC for append, with authenticated owner/admin, tenant and Founder checks, optimistic pair revision and idempotency validation;
- no UPDATE/DELETE; reversal is a new explicit revision retaining the previous evidence. Deferral never silently revokes a prior same/separate decision.

This is a **design recommendation**, not an applied schema. Before persistence, the RPC, transaction/concurrency tests, private-evidence scope and source-deletion/remediation policy need a separate review.

## Bounded contract

`RelationshipIdentityDecision` contains organisation, source A/B, decision, evidence IDs shown, evidence summary, actor, trusted decision time, optional note, schema/pair revision, candidate revision, exact endpoint alias bindings, and **`simulation: true`**. Evidence IDs are recorded authority for the association decision, not a claim that the user verified message content or delivery. Every affected shadow conclusion cites the hypothetical decision ID and labels association provenance.

The server reconstructs source refs, tenant, actor, time, summary and alias bindings from the authenticated review context. Browser-supplied equivalents are ignored. Candidate revision and evidence IDs must match current authorised data. A POST can only compute `mode: dry_run`; no persistence mode or operational endpoint exists. Same-relationship requires explicit checkbox confirmation. Candidate/alias/workspace conflicts reject the preview.

## Review surface

New standalone admin page: `/dashboard/growth/identity-review?organisationId=…`.

- Existing tenant authentication plus owner/admin role gate before source reads.
- Founder permission resolved independently; protected rows are filtered before identity, search, candidate revision or payload generation.
- One ambiguity at a time: left/right summaries, channel/source, recorded state, verified aliases, source/evidence references, missing bridge and review reason.
- Confirm same relationship / Keep separate / Review later; optional temporary note.
- Native modal with checkbox, keyboard focus and Escape cancellation for same-relationship.
- Prominent hypothetical/read-only boundary; no localStorage, sessionStorage, history move or workspace creation.
- Source payloads are allowlisted summaries, not raw source records or conversation bodies.
- `example=synthetic` selects a code-owned fictional Avery Morgan rehearsal. It still requires owner/admin membership; it is not an authentication bypass or arbitrary client-supplied identity input.
- Existing Root shell/navigation and page-specific helpers are untouched. No existing Relationships/Founder/Responses UI is changed.

## Structural decision policy

The fast graph uses the same canonical LinkedIn, structurally verified email, typed entity-kind and explicit source references as Phase 3. Full replay asserts its baseline partition equals all 2,480 Phase 3 groups exactly before applying any hypothetical choice.

`same_relationship` adds explicit human authority only. It cannot collapse person/company, override conflicting canonical profiles, or combine separate durable workspace histories. Transitive constraints are checked after association as well as at endpoints.

`keep_separate` is a hard cannot-link, including through third records. Endpoint-specific verified aliases bind future exact-alias records. A shared alias asserted by both separated endpoints is quarantined from automatic joining rather than used to rejoin them. No fuzzy/name/company/domain/role/AI key exists. Contradictory same/separate paths reject the entire preview. No existing source row or workspace link is rewritten.

`review_later` changes no grouping, state or prior authoritative choice. It never revokes an earlier negative/positive decision. Every counterfactual is clearly labelled; no simulated actor decision is treated as an actual Production verdict.

Shadow truth is assembled from existing authorised evidence only. No missing message body/date is invented. Every affected conclusion cites decision IDs. Affected dry-run action/due projections are held for review and cannot grant outreach/send readiness. Existing operational lifecycle and suppression remain authoritative and unchanged.

## Replay and interpretation

The Phase 2 atomic metadata snapshot at **2026-10-16 11:27:40.25936 UTC** is reused, so before/after comparisons do not confuse data drift with decisions. No new mailbox scan or bulk import. All 52 groups / 71 pairs are projected; all 71 are structurally eligible for an explicit human choice, subject to actual human evidence review.

Three counterfactuals are measured: defer every pair, keep every pair separate, and confirm every eligible pair the same. The last is a mathematical upper bound only: **it is not evidence that the 52 groups really describe the same people**. Similarly, all-separate is not a real human verdict. No real group is resolved until a real reviewed persistent workflow is separately authorised.

Final numeric results are recorded in `relationship-truth-phase4a-results.json` after the parity run. Detailed comparison rows and hypothetical decision payloads remain local; committed output has IDs/metrics only, no message bodies.

## Future Ask Root Finder

Finder must request canonical, permission-filtered RelationshipTruth candidates. It cannot independently match or join by free-text name/company/domain, title similarity or AI judgement. Exact reconciliations and hard separation constraints are part of identity resolution, including transitive and future-alias handling. If more than one canonical match remains, ask the user to choose; do not silently pick one.

Return code-owned internal destinations constructed from server-resolved locators and tenant scope. No arbitrary URLs, external destinations, automatic navigation, writes or workspace creation. Founder/private decision evidence is filtered before resolution and must not influence unauthorised search results. Guide/Advisor are untouched.

## Verification boundary

## Final replay result and stopping decision

**NEEDS MORE IDENTITY POLICY WORK.** All 52 groups / 71 pairs can be presented for explicit human review; none has actually been resolved. The all-same counterfactual reduces 65 splits / 84 withheld pairs to 13 / 13 and increases discoverable source records from 1,231 to 1,296 (+65; canonical groups +16). This is an upper bound, not an identity verdict. All-separate and review-later retain 65 / 84. There are zero unsupported joins, overlapping memberships or separation violations in every scenario.

The all-same scenario increases current-correct/shadow-wrong from 64 to 65: the Nutritionist Resource UK Acquisition source `0806a3b0-7dd1-4972-9ff9-4535d016cf2c` loses an established display name in the hypothetical combined review projection. This is a presentation/identity-policy blocker, not permission to choose a name or repair live records. Keep-separate and review-later introduce no such increase. Action/due projections affected by rehearsal are explicitly blocked/qualified, never operationally advanced.

The all-same discovery result excludes 11 probes containing 13 terms absent from the original atomic search capture. These are unassessed, never assumed hits/misses. Search coverage is therefore incomplete. All 52 real groups remain ambiguous pending actual evidence review; 13 additional groups were already intentionally separate in Phase 3.

Checks: 187/187 identity/shadow/parity/Day 0 contracts; 83/83 visual/foundation regressions; 93/95 selected operational regressions, with the two unchanged `lifecycle-control` and `lifecycle-reconciliation` loader failures for `@/lib/linkedinSendEvidence`. TypeScript and targeted lint pass. Authenticated Preview rehearsal uses only the fictional Avery Morgan fixture: explicit checkbox, Escape, same/separate/defer output, reload reset and mobile wrapping verified. A scoped pale canvas corrects inherited dark-background contrast on this new page only.

No Production decisions, source identities, source links, workspaces or histories are saved. POST is read-only computation despite its HTTP verb. No RPC, sends, mailbox calls, labels, ingestion, lifecycle/cadence updates, migration, consumer wiring or PR #58 changes.

Screenshots use the explicitly labelled fictional rehearsal and will be captured from the new page. Existing visual shell, Day 0, lifecycle and regression checks remain part of the final verification.
