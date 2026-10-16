# Phase 4C — shadow entity-shape policy

Base: `f412a215d1a19d1ec8ea4b4efe3901cd0cadd951`. No existing consumer is migrated; source records, stored entity kinds, reconciliation decisions and lifecycle states are never written.

## Contract

`RelationshipEntityShape` contains `entity_kind`, `person_anchor`, `company_anchor`, `associated_company_refs`, separate `person_source_refs` / `company_source_refs`, `classification_basis` with evidence IDs, `ambiguity_reason`, original individually provenanced aliases, and `identity_equivalence_authorised: false`.

Anchors are stable, sorted existing source locators, not new records and not field-precedence winners. Missing anchors remain null. Source references identify field provenance; a company field on a person row does not create a company identity.

## Rules

| Shape | Required recorded evidence | Meaning |
|---|---|---|
| Person | A dedicated stored person/person_name field or verified canonical `/in/` profile; no distinct company-only member or conflicting type/profile evidence | Person-specific evidence supports type, but a name never authorises a join. Generic author_name/target_name labels and legacy default person types are not person proof. Email/domain alone does not establish person type. |
| Company | Explicit stored company fact with no person-specific evidence | Company-only Acquisition plus unnamed correspondence may be presented as company, even when the legacy default says person. This changes only the shadow shape/display, never source rows. |
| Person associated with company | Person-specific evidence and company context on the same person-bearing source(s) | `person_with_company`; company fields are association provenance, not identity equivalence. There is no invented company record or inferred employment date. |
| Ambiguous | Neither positive type evidence; conflicting personal profiles; company-typed evidence containing a person; or separate person-specific and company-only members | Preserve both sets of source refs and aliases. Require explicit association/type review. A hypothetical same-relationship choice cannot turn company into person. |

A name equal to an explicit company label can veto a person classification; this equality never joins anything. Company-typed sources do not become people merely because author/target labels are present. Explicit person evidence in a company-typed context instead creates ambiguity. A separate company source and a person source are not rendered as one canonical person/company identity. Existing replay evidence containers remain unchanged for parity; their mixed membership is labelled ambiguous and grants no identity-equivalence authority.

The company display uses company consensus. Person display uses person-name consensus. Conflicting values remain disputed alternatives according to the Phase 4 field policy. A company-only record is never given a fabricated person name. Alias values, verification basis and original channel/source IDs remain separate; type classification never upgrades or moves them.

## Verification

Replay all 2,411 current inventory anchors, all 52 human-review groups / 71 hypothetical pairs, all three counterfactual choices and the 11 previously uncovered search probes. Use the same historical source snapshot and explicitly later supplemental ID/token-only search observation; do not describe these as an atomic live recapture. Reports contain no message bodies. Unresolved entity shapes are counted separately for review groups and evaluated inventory anchors. No unrelated mailbox completeness is claimed.

The report assembler fails if it sees a resolved mixed person/company-only identity collapse, missing group coverage or unassessed probe. New current-correct/shadow-wrong differences are compared against the approved Phase 4 field-policy replay, not hidden by reclassification.

## Final result

**NEEDS MORE IDENTITY POLICY WORK.** All 52 review groups / 71 hypothetical pairs and all 2,411 inventory anchors were evaluated (34,888 field comparisons per scenario). The Nutritionist Resource UK displayed-name regression disappears: explicit company name, company shape, null person anchor. New current-correct/shadow-wrong cases: zero; total in the all-same scenario drops from 65 to 54. Unsupported joins, overlapping memberships, separation violations and person/company identity collapses: zero.

All 11 search probes remain assessed: current 0/11, hypothetical shadow 11/11. Search results use the same historical membership plus later supplemental observation documented above; no fresh Production read/write or mailbox query was performed in Phase 4C.

Entity shapes across evaluated inventory anchors: 102 person, 602 company, 1,668 person-with-company context, **39 ambiguous**. Within the 52 review groups, **one remains ambiguous**: `growth_targets:1059d1f8-a8b0-49a7-855e-9b420100d759` and `growth_targets:bce9122f-4839-4b23-aa84-1c25ebb40eb8`. One has person-specific profile evidence; the other has company context and a generic target label. Equal target/company labels are not authority. They require an explicit association-or-separation decision, not identity equivalence. The other 38 ambiguous inventory anchors are outside this review group count.

The original hypothetical grouping containers and their 13 splits / 13 withheld pairs remain unchanged; these are not proof that the ambiguous mixed container is a valid identity join. Persisted reconciliation must remain disabled until the association policy for that case is reviewed. All 52 groups still await real human review; no real identities have been reconciled.

All-same agreement is 32,785/34,888 (93.9721%). More conservative unknown/mixed type reporting adds insufficient-evidence comparisons; this is not concealed by a source-order winner or category rewrite. Body-free per-group classification bases and probe outcomes are in `relationship-entity-shape-results.json`.

Checks: 206/206 contracts (11 entity-shape contracts), TypeScript and targeted lint pass. No UI, API, schema, source record, permission, lifecycle, cadence, send, consumer or PR #58 changes.
