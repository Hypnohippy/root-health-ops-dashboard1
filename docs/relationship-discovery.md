# Phase 6 — Relationships discovery augmentation

Read-only discovery/search only, stacked on Phase 5E (#78). No action consumer is migrated. The existing Relationships cards, state, next action, due date, value, retention and destinations remain current-system output. A separate identity discovery section augments the same search; it never removes an existing result.

## Boundary

`findRelationships(query, context)` returns canonical source-anchored identity ID, display label, entity shape, verified aliases, uncertainty, reconciliation status, source coverage and validated existing destinations. Internal provenance/source refs stay in the server comparison; the client receives no message bodies, ledger notes, actor IDs or raw evidence IDs. An uncertain result provides individually labelled source destinations instead of pretending its evidence is settled.

Query labels include recorded names/companies, verified aliases, canonical profiles, exact source references and authorised nested Founder contacts. A search match is never an identity edge. Query text does not enter the partition algorithm. Full LinkedIn URLs normalise through the existing canonical identity helper. Destinations come from code-owned route templates and trusted source refs, never query text.

The existing structural partition and persisted ledger establish membership. Confirmed pairs collapse only as authorised; explicit negative edges remain authoritative. Unresolved associations stay visibly uncertain/separate. Founder filtering happens before grouping/indexing. A nested company contact is a labelled association, not a new person record or company/person identity equivalence. Exact verified personal-alias associations can expose authorised Founder contact context without adding the parent company to source membership; shared-mailbox associations cannot do this.

No lifecycle/action conclusions from Truth are returned. There is no send eligibility, due date, next-action calculation, suppression authority, workspace creation or source mutation in the discovery contract. Guide/Ask Root is not wired to Finder.

## Server and existing list

The existing inventory map is extracted mechanically into `relationshipListInventory()` so comparison can use complete history without re-scanning all records once per page. Its filtering/value/action body is unchanged, and `listRelationships()` still applies the same 25-row pagination. Tests compare the original map and all detail/write handlers byte-for-byte with the Phase 5E base.

The new server wrapper performs a tenant-scoped, fully paginated ledger SELECT independent of the decision-writing feature gate. It uses the existing permission-filtered relationship context and reads no additional mailbox bodies. Current retention filters constrain discovery visibility. Current and augmented results paginate on the same existing controls. Missing ledger/schema or a rejected identity projection fails closed for the augmentation while retaining current search/results.

Query comparison is returned in the existing response as current-only, truth-only, matching, ambiguous, separated and reconciled counts. Nothing is logged or persisted. There is no polling or cross-request tenant cache.

## Read-only Production replay

Fresh body-free identity snapshot: 17 October 2026. Detailed source/Gmail/decision identifiers remain local. The committed aggregate report deliberately excludes those identifiers and Founder contact content. Identity-only replay does not represent all existing full-text/body search fields.

- Current inventory: **2,411**; Truth inventory: **2,479**.
- Both inventories have searchable identity labels. The larger Truth count primarily represents safer splits, not new people or new data.
- Truth results with uncertainty: **184**.
- One persisted reconciliation produces **one canonical result covering two exact reviewed sources**. Other same-name records remain independent.
- Two additional query results in the Simon probe; no record or link created.
- Unsupported joins: **0**; separation violations: **0**; source mutation: **0**; operational changes: **0**.
- Production has no negative decision yet; explicit `keep_separate` is verified in synthetic contracts.

| Case | Current → Truth | Meaning |
|---|---|---|
| Tracy, name | 1 → 1 | Existing canonical relationship is findable. |
| Tracy, canonical LinkedIn | 1 → 1 | Exact stored profile resolves. |
| Tracy, known email | 0 → 0 | No verified email bridge exists in captured identity evidence; no Gmail attachment invented. |
| Tracy, company phrase | 0 → 0 | That company label is not established on her canonical evidence. |
| Simon, name | 0 → 2 | Founder company contact association and an independent alias-bearing result remain separate, with uncertainty shown. |
| Frank, name | 3 → 3 | Includes one confirmed two-source result; same-name neighbours are not merged. |
| Courtney, name | 1 → 2 | Two uncertain records exposed rather than silently collapsed. |
| Airbus, company | 6 → 7 | Conflicting identities remain visible, not forcibly reconciled. |

The Tracy email/company gap requires separately authorised evidence reconciliation. Discovery must not manufacture the missing bridge. No mailbox retrieval/import was performed.

## Verification

Discovery contracts cover verified email/profile lookup, labels without joins, exact reconciliation, negative edges, provenance, Founder association/permissions, tenant isolation, full-history search, current fields retained, existing map/write handlers unchanged, safe fallback and no action-consumer imports. Existing Day 0, lifecycle, Outreach, Responses and visual/foundation suites are rerun separately. No migration/configuration, gate enablement, new decision, Production write, outbound action or merge is part of this phase.
