# RelationshipTruth shadow — Phase 1

Local branch: `codex/relationship-truth-shadow`. Internal read-only projection; no consumer, route, queue, search or UI imports it. No migration, operational write, mailbox lookup or provider configuration.

## Files

- `lib/relationshipTruth.ts`: pure contract, structural identity resolution, evidence projection, permissions filter, uncertainty/conflict rules.
- `lib/relationshipTruth.server.ts`: internal tenant-scoped readers only; raw lifecycle input, not cadence repair/projection writes; existing server-side Founder permission check.
- `lib/relationshipTruthComparison.ts`: explicit field comparisons and reviewed disagreement categories; unclassified differences default to insufficient evidence, never shadow correctness.
- `scripts/relationship-truth-shadow-audit.mjs`: local body-free metadata replay through existing lifecycle, snapshot/cadence, Outreach, Responses, Relationships, due-target and list-search functions.
- `tests/relationship-truth.test.mjs`, `tests/relationship-truth-loader.mjs`: isolated contracts and deny-by-default dependency loader.
- This document.

## Contract

`RelationshipTruth` includes schema version/as-of, stable source anchor/accepted source and workspace locators, person/company kind, attributed verified aliases, source refs, evidence timeline, recorded facts, latest confirmed inbound/outbound, lifecycle stage, actionable state, next legitimate action, supportable due date, explicit task commitments, suppressions, contradictions, evidence gaps, interpretations, reply state and permission-filtered related Founder contacts.

Every conclusion contains `{ value, kind, evidenceIds, rule }`. Kinds are recorded fact, derived operational state, interpretation or uncertainty. Interpretation output starts empty: no AI conclusions, sentiment or inferred commitments. Timeline retains source ID, channel/direction, actual date, recording date, body availability and exact thread reference. Message bodies are not included. Notification is a signal, never a fabricated inbound message. Empty-body messages remain real dated evidence with an explicit missing-body warning.

Stable identity is the caller's existing source locator, not a changing email/name hash. A stronger identity can add refs/aliases without changing that locator. Existing workspace locators remain aliases; opening creates nothing. Duplicate workspaces or shared-email/multiple-profile conflicts block certainty. Name/company/domain matching is not an identity edge. Explicit typed source refs and verified structural aliases are used; person and company remain distinct.

The server loader is internal, not an exposed endpoint. It assumes the existing authenticated tenant boundary; it resolves Founder access server-side. Denied Founder content is removed before identity resolution, matching, history and derived fields. Pure functions accept a trusted policy supplied by that boundary, never a browser's permission assertion.

## Production comparison scope

Read-only SELECT snapshot from `bechmxbywqhsauhctewo`, tenant `78fa2ac8-e7b6-4b9b-9604-035723ece6b1`, evaluated as of **16 October 2026 08:54:59 BST** (07:54:59 UTC).

Five bounded cases: Tracy, Kate, historical Mathew, Carole's multi-thread email and Simon's verified nested Founder contact. Body fields and receipt message text were replaced with presence markers before local export. The snapshot preserves identity, dates, stored states, receipt fields, exact evidence IDs, thread refs and professional contact metadata. It is not a full-tenant or mailbox-completeness claim. Counts classify field-level differences, not numbers of people or a platform-wide defect rate.

Existing functions were executed locally against that snapshot: `readLifecycleInput` (SELECT-only stub, including existing hydration and projected cadence for current baselines), `buildContactLifecycle`, `linkedInOutreachQueue`, `responseLifecycleMap`, `projectRelationships`, `lifecycleDueTargets`, and the real `listRelationships` search. Shadow uses raw source rows and its stricter association rules. No Production application code was deployed or invoked for comparison; no workbench auto-generation was mounted in this phase.

### Results

**33 field comparisons: 24 agreements, 9 reviewed differences.**

| Classification | Count | Example |
|---|---:|---|
| Current output correct / shadow wrong | 0 | None found in the final bounded Production replay. A synthetic contract covers a deliberately incorrect shadow reactivation after explicit handling; it is not a live finding. |
| Shadow correct / current output wrong | 5 | Kate's actionable/due presentation lacks the actual queue's timestamp blocker (2); Simon's exact email, nested person name and permitted contact provenance are absent from Relationship discovery/presentation (3). |
| Insufficient evidence | 1 | Carole's old-thread closure plus a different engaged thread: shadow flags scope conflict without reopening anything. |
| Historical evidence gap | 2 | Mathew's unverified historical send date; Tracy's manually recorded email history without linked authoritative Gmail evidence. |
| Identity ambiguity | 1 | Existing Carole group includes Acquisition `2beb3f21-51fa-4a5d-bf95-faa4652c6799` through `engine_state.email`. The snapshot has no verified-email flag or explicit source association sufficient for the strict shadow policy. It withholds that join. This does not prove the existing association is wrong. |

All five compatibility lifecycle summary stages agree. Existing Outreach exclusions remain respected; differences concern certainty, provenance, missing evidence and discoverability, not permission to send.

### Case detail

**Tracy** — inbox `5243a6ec-485e-43fd-86a7-3627aa07cf23`: no_reply_needed retained, Outreach stronger-stage exclusion retained. Receipt `aa314113-5541-4b90-b655-af8218bf7ad3` remains outbound evidence. Undated snapshots remain undated. Manual email activity `5606828d-01ad-4255-90ee-9967afddecef` is retained as attributed activity/route, not a verified alias or Gmail receipt. No confirmed dated inbound message is invented from notifications/snapshots. Email search currently fails; the shadow exposes the recorded route and missing Gmail association without linking it.

**Kate** — inbox `d501ad1f-6679-434d-9909-5ff7592dc8c1`, target `f260588e-db63-46eb-bcad-5a61d818ccf1`: current due date 15 October 18:00 UTC; actual queue rejects cadence/send chronology mismatch. Shadow retains follow_up summary, returns blocked + review evidence, and withholds an undisputed due date. Receipt `353110b0-6b57-4adc-84f6-9d096cf6e390` establishes the actual stored send time.

**Mathew** — inbox `e5d9b0bf-559e-4f91-b862-4eb3926d94d9`, target `ea8ee38c-57b7-43bd-b930-adb71b47b402`: legacy completion lacks verified actual send date. Current Relationship Follow-up / Responses scheduled wording is not sufficient evidence for a schedule. Shadow blocks action and marks historical outbound incomplete; it does not invent a date.

**Carole** — old-thread inbox `1721cfdd-2eee-48c4-a3e1-70058a12f1d6`, closed companion `bc43605d-2663-4a2a-af97-df4af4bcc552`; old Gmail thread `1a1100e2cb77c6ed`. Other thread `1a1173e1e820781e` has stored inbound/outbound history and engaged Responses rows, including `b921ee53-c8d5-48b0-b77f-628dbe7f0756`. Both current and shadow summary remain lost. Shadow recommends only review of disposition scope. The separate Acquisition association is explicitly unresolved, not silently merged or detached.

**Simon / Founder nested contact** — inbox `352ce7aa-fc70-429a-88e1-fb7f0a69e1a0`, Gmail thread `1a13f0486f463aea`, stored inbound `102690b1-b99a-4ea7-94c3-c9d172a1d767`. Founder company `4c4435f6-dc89-406e-a18c-b65b8793e381` has the same verified nested contact email. Shadow attributes the name/contact evidence while keeping company separate. Current Relationship header is Identity not established; its name/email search probes fail. No contact record is created.

Full comparison JSON is a local audit artifact outside the repository. No real Production rows or bodies are committed as test fixtures.

## Safety and tests

- New shadow contracts: 34/34 passing.
- Existing Day0 contracts: 21/21 passing, unchanged.
- Broader selected run before the final added missing-body contract: 245/247 passing (32 new plus 215 existing results). Two failures are existing test-loader dependency failures in `lifecycle-control.test.mjs` and `lifecycle-reconciliation.test.mjs`, both rejecting `@/lib/linkedinSendEvidence`. Those tests and their tracked dependencies are unchanged; no unrelated fix applied. Final shadow-only run passes 34/34.
- TypeScript: pass.
- Targeted lint: pass, zero warnings/errors.
- No existing consumer imports the new modules. No migrations, RPCs, route handlers, UI, queues, Day0, Ask Root, search, Founder, Responses, Relationships or send logic changed.

Contracts cover frozen input/no mutation, stable IDs, deterministic supplied as-of, tenant/Founder isolation, pure Founder denial, strict aliases and identity ambiguity, no company/name merge, notification-only/handled replies, stronger closure preservation, undated/future snapshots, exact thread and participants, missing bodies, receipt corrections, disputed cadence, historical gaps, related nested Founder evidence, explicit tasks, duplicate workspaces, partial coverage, conclusion provenance and comparison-review safeguards. Server mocks allow reads only; write methods are absent/denied. The projection has no database/network capability.

## Next step — not implemented

First consumer: **Relationships inventory/discovery**, after broader shadow parity and review of association ambiguities. Start with evidence-backed discovery and blocked-state explanations, retaining existing lifecycle/send authorities. Then separately review Responses/attention and Outreach adoption. Do not migrate a consumer or execute any historical repair as part of Phase 1.

