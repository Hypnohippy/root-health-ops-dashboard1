# Phase 5E — stored identity evidence enrichment

Decision: **INSUFFICIENT EVIDENCE — KEEP HUMAN REVIEW MANUAL**.

This is an isolated, read-only audit helper, not a new identity authority or consumer. It does not call a database, mailbox, provider, writer, gate or operational endpoint. No union, reconciliation or source-row change is performed. The existing projection, ledger semantics, lifecycle and consumers are unchanged.

## Capture and coverage

One tenant-scoped, body-free, atomic Production SELECT captured at `2026-10-17T04:50:20.175197+00:00` in `bechmxbywqhsauhctewo`. The raw snapshot stays local and is not committed. Only aggregate results are committed. Detailed pair/source/evidence identifiers and classifications remain in the local audit report, alongside the local snapshot. No Production record, Gmail message/thread, decision or candidate identifiers are published.

Captured: 2,267 Acquisition records, 199 Growth targets, 179 inbox records, 13 Founder records, 68 stored Gmail messages, 8 LinkedIn entries, 4 workspaces/4 source links, 9 workspace events, 2 tasks, 2 Founder events, 37 Acquisition events and 12 response events. These are live snapshot counts, not the older Phase 4 capture. Normal concurrent application activity can change counts between captures; this audit performed no writes.

The existing 52-group/71-pair review set still projects. The already-confirmed Frank Rourke pair is excluded, leaving **51 unresolved groups / 70 pairs**. The one existing decision remains sequence 1/revision 1. No new decision is requested or produced.

| Classification | Groups | Pairs |
|---|---:|---:|
| Now safe for human review | 0 | 0 |
| Still ambiguous | 29 | 35 |
| Must remain separate | 5 | 8 |
| Defer due to recorded workflow dependency | 17 | 27 |

**New authoritative evidence: 0 groups / 0 pairs.** No upgrade source exists. Group counts conservatively take the most restrictive pair result: separation, dependency deferral, ambiguity, then safe. A group marked separate can still contain other individually ambiguous pairs; this is not a new persisted separation decision.

## Evidence contract

`IdentityEnrichment` records `sourceRef`, optional `relatedSourceRef`, evidence type/value, verification basis, provider, evidence IDs, exact thread/message references, known timestamp or null, scope (`person`, `company_shared`, `unknown`), `canAuthoriseIdentity`, and the reason an observation is non-authoritative.

`EnrichedIdentityReview` retains pair/group refs, evidence, reasons, strongest evidence, read-only marker and disposition. `canAuthoriseIdentity` means a potential pair-level evidence basis for **explicit future human review**, not permission to join automatically. No downstream consumer reads it.

Rules:

- Exact verified address alone/deliverability `PASSED` is not a verified binding to a named person. A person-email bridge requires explicit person scope and person-verification on both endpoints; unknown scope remains unknown. Generic/shared mailboxes are vetoed even if a source labels them personal.
- Canonical LinkedIn aliases can corroborate the exact pair. Historical LinkedIn evidence without a canonical profile is flagged, never inferred by name. Stored conversation identifiers preserve their own profile provenance.
- Gmail observations require an existing source thread ID, exact stored Gmail thread/message IDs and an exact verified sender or recipient. No name/domain matching, body processing or cross-thread borrowing. The participant's mailbox evidence does not establish the other source's person binding.
- Recorded Acquisition/Growth foreign keys, explicit handoff refs and Founder promotion refs are preserved as exact typed edges. Cross-person/company shape or conflicting aliases still blocks review approval. Founder nested contacts remain distinct from their parent company; membership is not identity equivalence.
- Provider IDs without explicit person semantics, repeated research URLs, activities and workspace co-membership are observations, not person-identity authority.
- Founder and tenant filtering runs before evidence collection. No Founder content reaches an unauthorised candidate payload. Activity FKs remain table-specific.
- Existing exact `keep_separate` wins. A confirmed exact pair is not offered again. Name differences can flag incompatible shared-mailbox claims; names never establish a positive edge.
- Recorded send, reply, follow-up or due dependencies conservatively defer a case. Historical timestamps do not prove that a workflow is currently overdue or unresolved; operational review must establish whether it has cleared.
- Future-dated evidence cannot authorise an audit-cutoff conclusion. Missing timestamps remain unknown.

## Revisited Phase 5D cases

| Case | Result | Reason |
|---|---|---|
| Airbus: Kata / Oriel–Katie / John | Separate | Distinct recorded people share the political-affairs mailbox; no person bridge. |
| Unipart: Darren pair | Defer | Recorded reply/human-response dependency; shared contact mailbox does not bind a person. |
| Unipart: Darren / Vicki | Separate or defer by exact pair | Different people on shared mailbox; the pair containing the active reply record is additionally deferred. |
| RJ McLeod | Defer | Recorded send/follow-up dependency plus conflicting named people on the Glasgow mailbox. |
| Miller Homes | Defer | Recorded send/follow-up dependency; corporate enquiries is not person identity. |
| Courtney McCormick | Ambiguous | Matching name and deliverable Graham info mailbox lack an explicit personal bridge. |
| Andy McNeill | Ambiguous | Conference mailbox plus appointment citation is insufficient. No new external lookup performed. |
| Eddie / Cormac / Paul / Kris hotel alternatives | Ambiguous | Generic/conference addresses and repeated research citations do not establish person identity. |

The 68 stored Gmail and 8 LinkedIn rows yield no new exact pair-level person bridge for the unresolved set. This does **not** establish that additional evidence is absent from the mailbox; this phase inspected stored Ops evidence only.

## Finder and next step

There is no defensible canonical Finder/discoverability gain from this enrichment alone, and no identity grouping changes. Future Finder must resolve through canonical RelationshipTruth only, honour confirmed decisions and explicit separations, return code-owned destinations, and ask the user to choose when multiple canonical identities remain. It must not independently join by free-text name/company/domain.

Keep the review queue manual. Obtain explicit person-specific evidence or separately authorised exact-thread reconciliation for a chosen case before considering another controlled batch. No automatic 52-case replay decisions, live mailbox lookup, source edits, gate activation, migration, consumer migration or merge occurred.

## Reproduction and checks

Run `node scripts/relationship-identity-enrichment-audit.mjs <local-body-free-snapshot.json> <local-report.json>`. It accepts local files only and writes a local report. Its output is evidence review, not reconciliation instructions.

Focused enrichment contracts: 23/23. Full shadow/identity/ledger/Day 0 contracts: 255/255 (includes 21 Day 0 contracts and 11 local PostgreSQL ledger-security tests). Visual/foundation: 83/83. Selected lifecycle/notification/Outreach/Responses regressions: 152/154, with the same two existing `@/lib/linkedinSendEvidence` loader failures in lifecycle-control/reconciliation. TypeScript and targeted lint pass. No existing implementation file or operational consumer was modified.
