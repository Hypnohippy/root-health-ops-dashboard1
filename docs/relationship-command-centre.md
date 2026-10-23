# Relationship Command Centre — Phase 2A

Base: `d209a1fd85001ffe2892cbd4b017d0302aecee4c` (merged PR #97).

## Authority and implementation

The existing page and design remain. Contextual Record email / Record LinkedIn contact / Add call / Add meeting / Add observation / Add commitment / Add task controls open the existing Notes or Tasks forms. Existing activity types, tenant membership, Founder permissions, workspace revisions and `apply_relationship_workspace_action` remain authoritative. No lifecycle stage editor exists.

The card's Researched milestone currently requires at least one permission-visible linked `founder_research_records` row (`data.founder.length > 0`). Founder-only source projections have the existing `researched` stage. Operational contacts acquire Founder evidence through existing exact acquisition linkage of the same entity kind or canonical LinkedIn identity; the canonical reader additionally scopes identity membership before loading evidence. A generic note or user assertion does not qualify as research. Company research is not automatically employee research. The UI now explains that authority and opens Founder to review/start research; it does not manufacture an association or execute research automatically.

All six Strategy prompts use the existing `ops-relationship-root` exact-record event and canonical read-only reasoning path. Unavailable evidence stays unknown. No strategy is saved. A user's own Strategic thought still uses an explicit typed note.

## Reviewed Ask Root proposals

The exact-record Ask Root drawer has a separate “Propose an update from my request” control. `POST /api/growth/relationships/[relationshipId]/proposal` authorizes membership and reads `readOperationalIntelligence`; it never calls a writer or provider. A conservative deterministic intent adapter recognizes a bounded subset of the request, returning typed details, canonical target/source refs, actor, original workspace revision, consequence, evidence basis and `confirmationRequired: true`. This is deliberately not a general natural-language executor. Unsupported phrasing explains the available controls.

Enabled proposals: typed Observation / Commitment note; manual emailed / LinkedIn contacted / call / meeting activity; open task assigned to the actor with no invented deadline; stale preference; restore active. Manual actual date remains unknown (use the existing form for a known date). Question/negation is not a contact assertion. Compound research/email/connection claims produce separate explanations and at most one manual email proposal. Ambiguous identities cannot receive a confirmable proposal.

Not enabled: archive via AI, task status via AI (both retain existing direct controls), conversion/lost overrides, identity merge, permanent delete, sends, provider/calendar writes or arbitrary lifecycle edits. Existing `blockedRelationshipAction` remains intact for guidance. No model-supplied SQL/table/endpoint is accepted.

Explicit confirmation calls the existing relationship POST route. The server regenerates the allowlisted proposal from its original request and checks target, actor, organisation, canonical refs, details, consequence and confirmation. The original revision reaches the existing atomic/idempotent domain governor. The writer's optional server-supplied canonical refs prevent legacy projection from widening the selected identity. Existing non-command callers remain unchanged.

Both direct saves and proposal confirmation now use the shared persist/reread helper. Success is shown only after the canonical workspace contains the saved action's idempotency key. If a write was accepted but reread fails, the receipt is retained and retry performs GET only. An uncertain POST reuses its original key. No action is automatically retried.

## Read-only Jenni / KBR audit — 23 October 2026

Authenticated Ops evidence, no external search or writes:

- Search “Jenni Myles” returned four separate sources. Acquisition `acc24f86-4763-4511-98e8-c14d0ea7eb5d` names Jenni/KBR; Growth `fe160700-1a9c-4de6-9cd7-ab24d16d8880` is company-only KBR and records a Jenni mailbox. Their entity-kind association remains unresolved.
- LinkedIn sources `72b47563-9215-42b6-be1d-21a3168bd212` (“Jenni”) and `fccecc86-1157-447b-aa0e-073bf78eeb25` (“Jenni Myles”) share a recorded LinkedIn alias but have a names-disagree review requirement. They remain separate.
- Exact source `fccecc86…` projects `engaged`, active workspace `c6b5721f-1581-46dd-9bfa-5ec4d4e03c7c`, revision 2. Its Founder evidence is empty. It contains a manually recorded LinkedIn activity at `2026-10-17T10:39:22.675191+00:00` and an undated manually reconciled conversation snapshot. The text says an email was sent previously, but that is not independent Gmail proof or acceptance evidence.
- Founder search does find company KBR research `1aa5031f-d6cb-4de4-bc99-b94e11b6bbd5`. It has a research snapshot, no person name, no contacts, no LinkedIn identity and no linked acquisition ID. It cannot safely be silently attached to the person.
- That company record has manual `emailed` activity `1bda9459-48e8-4f7d-8714-e8e764957254`, actual `2026-10-07T07:22:00+00:00`, addressed to the recorded Jenni mailbox. It has no Gmail message ID or linked provider evidence. This explains where the user's recorded email/research resides without promoting it into verified person delivery.

The full canonical History also contains `acceptance:fccecc86-1157-447b-aa0e-073bf78eeb25`, a stored accepted-connection source at `2026-10-17T10:02:53.683+00:00`. The card and proposal explanation acknowledge that recorded source. This is distinct from inferring acceptance from outgoing text; the payload does not establish an external provider verification method.

No Jenni records, reconciliation decisions or identity links were changed. Connection acceptance was not inferred from the outgoing text.

## Source-owned fields and bounded gaps

Role/company/email/phone/LinkedIn URL/website remain read-only on this card. A minimal allowlisted source-detail projection shows the exact scoped source table/ID and recorded field values, with links to the existing operational workflow and separate source review. No name/domain/company joins are introduced. Source editing remains wherever that source workflow already permits it; this PR does not imply that every source field is editable there.

A relationship-level override would need a reviewed tenant/workspace-owned field-value contract with actor, recorded time, source provenance and revision; identity fields must remain non-authoritative until the identity governor reviews them. No override schema or migration is added.

Existing `recordManualLinkedInAcceptance` and `/linkedin-capture` are not suitable for unknown historical acceptance: capture writes `created_at_platform = capturedAt`, defaults to now in the current UI, and rejects an existing non-acceptance conversation. It preserves actor/confirmation/profile provenance for its existing intake use, but lacks the requested separate source-relationship and unknown-versus-supplied actual acceptance-time contract. This PR does not alter intake, repurpose notes as acceptance, or manufacture an acceptance date. A follow-on design could explicitly validate a provenance envelope in existing source metadata (schema change may not be necessary) plus update the acceptance projection/governor to respect null actual time; a dedicated evidence table is an alternative requiring approval. That subsection remains blocked pending review, with no migration proposed/applied here.

## Diary compatibility

No new activity types: emailed, linkedin_contacted, called, meeting, note and existing relationship tasks are reused. Unknown actual times stay null; recorded time stays separate. A manually recorded meeting is not a structured future booked meeting. Existing Diary can continue consuming its current sources; consuming all manual activity through canonical intelligence is a later migration. Meeting/follow-up/task/waiting facts must not collapse by relationship. No external calendar work is included.

## Verification

Focused command, workspace, PGlite domain, canonical intelligence, coach, reasoning, Diary and send/Responses regressions run locally with synthetic fixtures. TypeScript and targeted lint cover changed code. React review: event-driven mutations, bounded refs/in-flight guard, no synchronous state-setting effects, scoped event listener cleanup, labelled controls, no raw HTML and wrapping action groups. Live verification is read-only; proposal confirmation is tested on synthetic fixtures only.

No schema/migration changes, sends, autonomous AI writes, identity merges, deletes, lifecycle overrides, provider/calendar writes, hidden business mutations or send-governor bypasses.
