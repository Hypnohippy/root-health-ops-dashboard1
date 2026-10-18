# Phase 3 — Identity evidence and shadow resolution

Decision: **NEEDS IDENTITY REPAIR FIRST**. Relationships inventory/discovery is not yet safe to migrate, including a shadow UI that presents these associations as canonical.

Base: Phase 2 `977ba517ca67ba033b04fcb06ef30fe9395083b8`. All application consumers, the Phase 1 engine/contract, and Production identities remain unchanged. This is a pure shadow projection, contract/design and exhaustive reconciliation ledger. No schema/migration, data writes, mailbox lookup, sending, lifecycle mutation or merge.

## Evidence contract

`RelationshipIdentityEvidence` in `lib/relationshipIdentityEvidence.ts` contains:

- `sourceRefs`: typed, tenant-visible existing source records;
- `alias`: type/value (`linkedin`, `email`, `source_ref`, `gmail_thread`, `founder_contact`) or null;
- `verificationBasis` and exact `evidenceIds`;
- `confidenceClass`: `deterministic`, `human_reconciliation`, or `separate`;
- `ambiguityReason` and `humanReviewRequired`.

These are categorical evidence classes, not guessed probabilities. A candidate email in a human-review entry is **not a verified alias**: its `candidate_only_not_join_authority` basis explicitly prohibits treating it as identity authority. Founder nested contact values are omitted from the committed ledger; protected source/index references remain available to an authorised reviewer. No message bodies are committed.

Pair reviews additionally record primary and overlapping missing-bridge categories plus whether the pair actually resolves in the shadow. Caller-supplied resolution cannot upgrade an unproven pair to deterministic. All 85 original withheld source pairs and all 66 original split groups are listed in `relationship-truth-phase3-results.json`, with no sampling or first-page cap.

## Deterministic bridge actually used

The existing Barnardo's Acquisition record `c800346b-ac3b-40f8-b187-ec45af95b97e` is explicitly referenced by Growth target `b2cafdb7-87ce-4636-86a1-2c6c53dcd902` through `growth_targets.acquisition_item_id`. Source namespace `root_health_b2b` and exact source-record ID also match. Phase 1 does not read that FK. Its default person classification for a Growth target further prevented joining the company-origin promotion.

The disposable adapter represents that already-recorded FK in the reverse-handoff shape understood by Phase 1. It derives company kind only for the unchanged company-label promotion shape, with no independent person profile, no existing person component, and exact origin tuple. The identity authority is the FK, **not the company label**. Removing the FK prevents this join even when names/company/domain/email match. No field is persisted, no verified email is invented, and projection provenance explicitly identifies the derived structural view.

Same-tenant existence, one-to-one target reference, matching source tuple, no conflicting reverse link, no disjoint verified emails, no canonical-profile conflict across either existing component, and no existing workspace/identity ambiguity are required. Multiple targets, protected/foreign sources and conflicts fail closed. Company/person evidence otherwise remains separate.

A second recorded FK (`acquisition_items:acc24f86-4763-4511-98e8-c14d0ea7eb5d` → `growth_targets:fe160700-1a9c-4de6-9cd7-ab24d16d8880`) corroborates an association Phase 1 already has; it creates no new join. Canonical LinkedIn fields in legacy nested shapes can also be normalised only when one exact canonical profile is established; corroborating source references accompany the proof. No such new legacy-profile join was needed in this replay.

## Exhaustive missing-bridge review

Primary classification assigns each original source pair once. Overlapping flags are also retained per pair and in JSON; zero primary counts do not mean the information was present.

| Primary missing bridge | Pairs |
|---|---:|
| Canonical LinkedIn identity absent | 0 |
| Verified email absent | 62 |
| Explicit source reference absent | 0 |
| Founder nested-contact-only | 0 |
| Gmail thread linkage absent | 9 |
| Conflicting verified aliases | 0 |
| Historical record shape | 1 |
| Other — person/company boundary | 13 |
| **Total** | **85** |

Overlapping flags: canonical LinkedIn absent on at least one endpoint **85**; verified email absent **78**; valid explicit source bridge absent **84**; Gmail linkage absent **9**; historical shape **80**; person/company boundary **13**. No conflicting *verified* alias pairs were established in these 85; unverified shared addresses and different named people are not upgraded to conflicting verified identities. No original withheld pair involves Founder research, hence zero in that denominator. Four verified nested Founder contacts are separately reviewed and safely retained as nested evidence without manufacturing person records.

Resolution decisions:

| Decision | Original groups | Source pairs |
|---|---:|---:|
| Deterministic shadow repair | 1 | 1 |
| Explicit human reconciliation required | 52 | 71 |
| Safely remain separate | 13 | 13 |

The 13 separate decisions preserve person/company boundaries, including shared organisational inboxes. They remain withheld in raw parity metrics; an adjudication is not a merge. The 52 human groups include missing verified identity, historical name/company fallback, shared addresses used by different people, and absent email-to-Acquisition source linkage. Exact IDs, source references, reasons and pair memberships are in JSON. No name/company/domain match authorises any join.

## Before / after replay

The same atomic **16 October 2026 11:27:40.25936 UTC** Phase 2 snapshot, original current consumer code, original search-token capture and original as-of are used for an apples-to-apples comparison. This is not a new live mailbox or fresh Production read. The current side always uses the original snapshot, not repaired clones. The optional `--identity-shadow` switch changes only the audit-side projection; ordinary Phase 2 replay remains unchanged.

| Metric | Before | After |
|---|---:|---:|
| Current Relationships evaluated | 2,411 | 2,411 |
| Strict shadow groups | 2,481 | 2,480 |
| Identity splits / full current associations withheld | 66 | 65 |
| Withheld source-pair joins | 85 | 84 |
| Current correct / shadow wrong | 64 | 64 |
| Shadow correct / current wrong | 1,170 | 1,170 |
| Insufficient evidence differences | 325 | 328 |
| Historical evidence gaps | 199 | 199 |
| Identity ambiguity differences | 66 | 65 |
| Potentially newly discoverable source records | 1,231 | 1,231 |
| Potentially newly discoverable shadow groups | 1,175 | 1,175 |
| Current action/due rows shadow would qualify | 135 | 135 |
| Agreements / comparisons | 33,064 / 34,888 | 33,062 / 34,888 |
| Agreement rate | 94.7718% | 94.7661% |
| New evidence-backed source-pair joins | — | 1 |
| New unsupported/unsafe joins | — | 0 |
| New alias conflicts / overlapping membership | — | 0 / 0 |

The slight aggregate agreement reduction is reported, not hidden. Resolving the Barnardo's membership exposes a company-vs-person display difference and stage/action uncertainty: current inventory says `actioned`; the merged shadow derives `outreach_ready` / `connection`. **This is not authority to start outreach**. The unchanged comparison classifies these differences as insufficient evidence. No current lifecycle, queue or UI is changed. These derived-state differences require review before integration.

The replay enumerates every newly combined source pair, checks reachability through old groups plus deterministic proof edges, and stops if any new association lacks proof, introduces canonical/workspace ambiguity, or overlaps shadow membership. It reports zero unsafe new joins; this is bounded evidence-backed validation, not a claim of omniscient real-world identity certainty.

## Required case outcomes and remaining gates

- Tracy: unchanged suppression/lifecycle; manual email/undated history remains incomplete. No speculative Gmail bridge.
- Kate: genuine cadence/confirmed-send dispute unchanged.
- Mathew: historical outbound chronology still incomplete.
- Carole: Acquisition-to-email source association still requires explicit reconciliation; seven source-pair joins to that Acquisition record remain withheld. Thread-local closure ambiguity remains separate from identity resolution.
- Simon: verified nested contact attribution remains supported; company/person are not collapsed. Four other unanchored Founder contacts remain nested evidence.

No historical send reconstruction, display heuristics, Founder researched-stage correction, cadence-anchor correction or timestamp correction is bundled into identity repair. The 64 current-correct/shadow-wrong differences remain open. The 52 human-reconciliation groups/71 pairs must receive exact verified person identity or explicit source/thread evidence before any later persistent reconciliation. Company/person associations may be represented as explicit related entities later, never silently collapsed.

## Future Ask Root Finder — design only

Finder must ask the canonical RelationshipTruth identity layer for tenant/permission-filtered discovery candidates and server-resolved relationship IDs. Free-text name/company/domain may rank candidates for **discovery only**; Finder must never independently join, verify or resolve them. Ambiguous results must remain explicit choices, with evidence and limitations. Exact verified aliases/source references govern resolution. Founder intelligence remains permission filtered before search or identity reasoning.

Destinations must be constructed by a code-owned allowlist using server-resolved locators, such as the existing `/dashboard/growth/relationships/[relationshipId]` route and required tenant scope. No arbitrary URL or user-provided destination. Finder cannot create a workspace, contact, bridge, send, draft receipt or lifecycle transition merely by finding someone. The existing Guide and Advisor are untouched.

## Checks and reproduction

- Identity safety contracts: 40/40.
- Unchanged Phase 2 parity: 30/30; Phase 1 shadow: 34/34; Day 0: 21/21. Combined: **125/125**.
- Selected existing lifecycle/notification/workspace regressions: **93/95**, with the same two unchanged loader failures in `lifecycle-control.test.mjs` / `lifecycle-reconciliation.test.mjs` rejecting `@/lib/linkedinSendEvidence`.
- TypeScript and targeted lint pass. No consumer imports the identity module.

```text
node scripts/relationship-truth-identity-audit.mjs snapshot.json phase2-comparison.json search-hits.json manifest.json phase3-comparison.json phase3-report.json
```

The CLI reads local captured metadata only and delegates to the existing paginated parity harness. It has no Production database or network client. Keep source exports and detailed comparison output outside Git. Only the body-free reconciliation ledger is committed. There are no SQL/migration changes in this phase.

**Recommendation:** keep Relationships as the eventual first consumer, but do not integrate yet. Review the remaining human identity bridges, preserve the separately typed entities, resolve the shadow-only defects and newly exposed state ambiguity, then rerun parity. No consumer migration is authorised by this result.
