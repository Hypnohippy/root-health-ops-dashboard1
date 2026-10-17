# Phase 7 — primary Relationships discovery

Stacked on Phase 6 (#79), approved base `7cd60577580189ed21f45d94350d1fa466053b19`. One result list now presents Truth identity and current-system operations. The standalone comparison panel is retired; comparisons remain in the read-only response, not persisted telemetry.

## Two explicit authorities

Truth owns discovery labels, identity grouping, verified aliases, coverage, uncertainty and persisted reconciliation/separation. Search matches, including existing full-text matches, never grant identity authority. Ranking prefers exact verified email, canonical profile, exact recorded label/name, then other recorded associations. No fuzzy joining is introduced.

Existing Relationships output remains the only source for lifecycle label, next action, due date, retention, potential/value and operational URL. Its inventory map, detail resolver and all write handlers are unchanged from Phase 6. Truth's operational conclusions are never copied into primary cards.

`findRelationships(query, context)` in `relationshipDiscoveryOperations.ts` is the stable, read-only Finder-facing contract. Context is constructed server-side from tenant/Founder-filtered evidence, the decision ledger and existing operational projections. The response includes identity, aliases, source coverage, reconciliation/separation and explicit `operational.state` / `current` / `choices`. Ask Root is not connected to it.

## Routing and ambiguity

- Exactly one fully contained existing operational relationship: attach its existing fields and Open relationship URL. This may already have a durable workspace, or be the existing source-backed read-only relationship route. The latter is labelled explicitly; opening never creates a workspace.
- Multiple destinations, conflicting workspaces, or a legacy operational group spanning different Truth identities: choose no status/action/due/value winner. Show **Multiple operational records** and exact existing source choices. Workspace grouping is checked globally before per-identity filtering, preventing a neighbour's action from being inherited through a shared URL.
- Founder-only company research without an operational relationship: **Discovery context only**, with a read-only recorded-context destination. No placeholder operational record is created.
- An uncertain multi-source Truth bundle is unpacked into individual source cards. This is conservative presentation, not a graph rewrite. Parent uncertainty/separation remains visible. A confirmed same-relationship group remains one card with full coverage.
- Existing current-only search hits are mapped by exact source reference to Truth results. They are not lost and do not turn body/name/company matches into joins. Raw current-vs-Truth comparison remains available internally.
- Destination templates and tenant scope are validated; query text cannot supply links. No action/mutation endpoint, external destination, automatic navigation or automatic workspace creation is offered.

## Replay

The committed report uses the same local body-free Phase 6 identity snapshot. It contains aggregate counts only, no private contact content or Production source/Gmail/decision IDs. Existing full-text/body search is not represented by that snapshot; preservation is separately covered by synthetic contracts and authenticated Preview verification.

| Measure | Result |
|---|---:|
| Existing inventory | 2,411 |
| Phase 6 Truth groups | 2,479 |
| Primary cards | 2,532 |
| Additional uncertain source cards unpacked | 53 |
| Source records covered | 2,658 / 2,658 |
| Duplicate source memberships | 0 |
| Unsupported joins / separation violations | 0 / 0 |
| Current results lost in recorded probes | 0 |
| Single operational mappings | 2,317 |
| Multiple/review mappings | 204 |
| Context-only mappings | 11 |

The higher card count represents existing identities/sources exposed conservatively, not new contacts or workspaces. No real negative decision exists yet; `keep_separate` is covered by fixtures.

Tracy: one name/profile result, current destination retained; no invented Gmail bridge. Simon: Founder company association and independent alias-bearing record remain distinct; company research is context-only. Frank: the confirmed pair is one two-source card; same-name neighbours remain separate. Courtney: two uncertain cards, neither inherits the broader legacy group's action.

## Verification boundary

Tests cover canonical rendering, exact reconciliation, negative edges, uncertain bundle expansion, safe/multiple/absent operational mapping, shared-workspace contamination, ranking, current-only discovery preservation, full-history search, tenant/Founder boundaries, no action-consumer imports and unchanged existing operational handlers. No schema, migration, source write, reconciliation decision, feature-gate activation, lifecycle/cadence/send change or merge is part of this phase. Desktop/mobile Preview evidence is reported separately after authentication.
