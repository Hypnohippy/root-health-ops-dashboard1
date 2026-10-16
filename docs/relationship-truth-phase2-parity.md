# Phase 2 — Relationship Truth inventory parity and identity review

Decision: **NEEDS IDENTITY REPAIR FIRST**. Do not migrate Relationships yet.

## Scope and invariants

Stacked on approved Phase 1 `1df89477fc11ae399b099d07b0a70ca42043b4d4` (PR #73), not on Advisor/PR #72. Phase 1 contract/implementation and every consumer are unchanged. New code is an isolated, local review harness and pure comparison helpers. No operational writes, schema changes, mailbox access/import, backfill, lifecycle changes or application routes. No PR #58 changes.

One tenant-wide SELECT snapshot was captured on 16 October 2026 at 11:27:40.25936 UTC. The replay has Founder-owner visibility; it is not a new permission implementation. Phase 1 tenant/Founder contract tests remain authoritative. No message bodies or real Production row fixtures are committed. Committed results contain aggregates, source IDs and body-free case descriptions only.

## Method and denominators

`relationship-truth-phase2-results.json` is the exact aggregate result. We replay the actual `readLifecycleInput()`, `projectRelationships()` and every page of `listRelationships()`, alongside unchanged `relationshipTruth()`. No source is truncated to the first page. Current inventory is the comparison denominator; extra shadow groups and missing nested person anchors are reported separately, not counted as successful comparisons.

Each current inventory row is compared once against the shadow group containing its displayed source anchor. Every source-group split is separately counted; no convenient group is silently substituted. Fields: source membership, person/company kind, canonical LinkedIn identity, structurally verified emails, display name/company, lifecycle summary, actionable state, next action, due date, name/company/email/LinkedIn discovery, ambiguity and specific historical gaps. Current actionable state is an explicit review mapping of current stage/due; it is not a new consumer output. Generic mailbox-completeness warnings are excluded from specific gap comparisons.

Current search includes original stored source text. Redacting that text first would produce false misses. A SELECT over the same atomic snapshot returns only whether each already-known identity probe token occurs in the original current search corpus. No original text is exported for search. 6,065 terms were covered; the capture manifest verifies timestamp and probe coverage. Twelve deterministic query result sets match the real paginated `listRelationships()` using a query-preserving search-only surrogate. Search matches are discovery candidates, never join authority. Absent/overlong probes are excluded; 3,688 unavailable facets do not count as successful discovery. Unknown-equals-unknown agreements are separately excluded in the known-only agreement rate.

The shadow discovery side is a pure review index over its attributed facts/aliases, not a migrated search implementation. New discoverability is deduplicated against the whole current inventory sharing those sources. Counts describe potential lookup routes, not new contact records or permission to associate sources.

## Interpretation of differences

Evaluated **2,411 current relationships / 2,658 persisted source records**, against **2,481 strict shadow groups**. All **34,888** available field/facet comparisons completed: **33,064 agreements (94.77%)**, **1,824 differences**. Excluding unknown/unknown fields: **26,156 / 27,980 (93.48%)**. No evaluation errors or unavailable source anchors.

| Difference classification | Field differences |
|---|---:|
| Current correct / shadow wrong | 64 |
| Shadow correct / current wrong | 1,170 |
| Insufficient evidence | 325 |
| Historical evidence gap | 199 |
| Identity ambiguity | 66 |

There are **66 split current groups**, **85 distinct source-pair joins withheld**, and **66 current groups whose full association the shadow refuses**. Candidate discovery improves for **1,231 source records across 1,175 shadow groups**; these are not new relationships. **135 current rows with an action/due date would be qualified or blocked**, including known shadow false positives. Four verified Founder nested contacts remain without operational person anchors. No cross-current shadow joins or overlapping shadow source membership were proposed.

All differences have a classification, rationale and source evidence IDs in the local detailed audit (not committed). Classification is a bounded review rule, not proof that all current output or all shadow output is correct. Multiple recorded names/companies remain uncertain rather than selecting by source order. No association is established from name, company or domain. Only the approved Phase 1 exact identities/explicit references are used.

Identity split means one current group maps to multiple strict shadow groups; it does not mean permission to split or that the current association is false. Withheld join count counts distinct source pairs, not people. Current groups refused means their complete source set cannot be supported by any one shadow group. Proposed cross-current joins and overlapping shadow membership are both zero.

The action qualification count is a review upper bound: it includes rows the unchanged shadow would block/review/require text for. It includes known shadow false positives and is **not** an approved operational blocking list.

## Evidence and examples of every classification

- **Current correct / shadow wrong:** all 13 durable Founder research records already support a researched state; Phase 1 returns not established (39 stage/action/next differences). Ten current recorded display names are not reconstructed by the conservative review adapter. Five timing-dispute groups (15 action/next/due differences) compare different timestamp strings representing the same instant. These must not become new blockers. Example target `11028448-4704-46a5-8e4d-0bcf383057e8`, receipt `2e4b28e7-348b-4058-a671-93fe6d334bac`. Also, Jim and Natalie have validated cadence anchors that Phase 1 overlooks; their combined gap field remains classified historical because undated snapshot history is genuinely incomplete too.
- **Shadow correct / current wrong:** same-membership verified email/LinkedIn discovery routes missing from current Relationships, plus Simon's evidence-backed nested-contact name attribution. Kate has a genuine cadence/confirmed-send chronology dispute omitted by inventory action/due presentation, while the actual outbound queue already suppresses the disputed follow-up.
- **Insufficient evidence:** multiple display values, person/company ambiguity, and Carole's old-thread closure alongside another engaged email thread. A difference does not authorise reopening, closing or sending.
- **Historical evidence gap:** Mathew lacks confirmed historical outbound chronology. Tracy has manual email activity without authoritative linked Gmail evidence and undated conversation history. A valid outbound anchor cannot resolve unrelated missing Gmail or snapshot dates.
- **Identity ambiguity:** Carole's current source group includes Acquisition `2beb3f21-51fa-4a5d-bf95-faa4652c6799` via `engine_state.email`; captured evidence has no verified-email flag/explicit association sufficient for the strict policy. Withhold the association; do not detach or manufacture a contact.

## Required cases

| Case | Exact operational source | Finding |
|---|---|---|
| Tracy | inbox `5243a6ec-485e-43fd-86a7-3627aa07cf23` | Current/shadow lifecycle `no_reply_needed` agrees; outbound suppression retained. Manual email event `5606828d-01ad-4255-90ee-9967afddecef` is activity, not authoritative Gmail conversation evidence. Notification IDs remain preserved. Gmail history completeness remains unresolved. |
| Kate | target `f260588e-db63-46eb-bcad-5a61d818ccf1`, inbox `d501ad1f-6679-434d-9909-5ff7592dc8c1` | Both summary stages follow-up. Inventory shows due 15 October 18:00 UTC; queue rejects actual chronology mismatch. Shadow correctly qualifies action/next/due; no sending authority changes. |
| Mathew | target `ea8ee38c-57b7-43bd-b930-adb71b47b402`, inbox `e5d9b0bf-559e-4f91-b862-4eb3926d94d9` | Legacy completion does not establish an actual send date. Historical reconciliation required before interpreting follow-up timing. |
| Carole | inbox `bc43605d-2663-4a2a-af97-df4af4bcc552`, companion `1721cfdd-2eee-48c4-a3e1-70058a12f1d6` | Summary remains lost; scope of closure across threads `1a1100e2cb77c6ed` / `1a1173e1e820781e` needs review. Separate association ambiguity above. |
| Simon | inbox `352ce7aa-fc70-429a-88e1-fb7f0a69e1a0`, Founder `4c4435f6-dc89-406e-a18c-b65b8793e381` | Exact verified nested email permits attribution while keeping company/person separate. Current header lacks name. **Correction to Phase 1 replay:** current name/email search already matches original source text; earlier body-redacted misses were replay artefacts, not proven UI defects. |

Four verified nested Founder contacts have no existing operational person anchor. They remain nested evidence; no placeholder person, target or Acquisition item is created. Phase 2 does not enumerate or infer aliases from the live mailbox.

## Reproduction and safety

`docs/relationship-truth-phase2-metadata.sql` is a tenant-placeholder SELECT template, not a migration. `searchTokenEvidenceSelect()` builds only fixed-table, tenant-scoped SELECT text; it cannot execute SQL. Capture metadata and token hits in one SQL statement/MVCC snapshot, with capture time and the bounded probe list in a local manifest. Do not commit exports. Local CLI:

```text
node scripts/relationship-truth-parity-audit.mjs snapshot.json comparison.json CAPTURE_TIME search-hits.json probes.json manifest.json
```

The replay's database stub supports SELECT/filter/order/range only; every other capability throws. It cannot connect to Production. Frozen-input tests ensure comparisons cannot mutate evidence. No consumer imports the parity helper. The approved Phase 1 files are byte-for-byte unchanged against the base.

## Checks

- Phase 2 parity contracts: 30/30.
- Unchanged Phase 1 shadow contracts: 34/34.
- Unchanged LinkedIn Day 0 contracts: 21/21.
- Combined dedicated run: 85/85.
- Selected existing lifecycle/notification/workspace regression run: 93/95. Two unchanged loader failures in `lifecycle-control.test.mjs` and `lifecycle-reconciliation.test.mjs` reject existing `@/lib/linkedinSendEvidence`; these are the same known baseline failures, not parity failures. The earlier Phase 1 broader baseline was 213/215; this phase reruns the selected 95, not a claimed 215/215 pass.
- TypeScript passes; targeted lint passes without new findings.

## Recommended gate

Relationships inventory/discovery remains the best eventual first consumer, but **not yet safe**. First review the 66 association boundaries/85 withheld pairs with explicit identity evidence; correct shadow-only researched/display/timestamp/cadence-anchor defects in a separately approved phase; reconcile historical and cross-thread uncertainty without inventing events; rerun parity. Historical reconciliation is also required for action/due certainty. Do not migrate any consumer in this PR.
