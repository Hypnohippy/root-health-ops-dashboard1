# Phase 2C — source creation and relationship research

Base/main `c457496a0c6fac46b1b19c05861ad6cad6435ba3` contains merged PR #99. Audit below was captured before behaviour changes.

## Source-creation map

| Workflow | Existing source update / new source | Canonical attachment / workspace | Apparent identity risk and treatment |
|---|---|---|---|
| Manual Acquisition (`api/growth/acquisition/manual`) | idempotent manual_ops tuple upsert | no workspace or explicit link | separate submissions can repeat a person; add canonical preflight and create guard |
| Automated Acquisition (`api/growth/ingest`, `growthIngestion.server`) | credential-scoped engine/source tuple upsert | no workspace | keep source provenance; accepted aliases group read-only; weak associations require review, never drop source evidence |
| LinkedIn manual capture (`linkedinCapture.server`) | org/profile upsert, acceptance dedupe | existing canonical profile grouping; no workspace | provenance/acceptance must not be discarded or converted to send proof; writer unchanged |
| LinkedIn acceptance ingestion (`api/growth/linkedin-connections/ingest`) | provider/Gmail lineage + org/profile upsert; recommendations have engine tuple | no new workspace | accepted profiles group using existing identity policy; no fuzzy automatic joins |
| Growth promotion (`acquisitionPromotion.server`, start-outreach) | existing guarded promotion RPC, acquisition FK/source tuple | structural lineage already recognized | preserve promotion and send governors; no replacement writer |
| CSV Growth import (`targetImport.server`) | existing canonical import planner + revision-guarded RPC | no relationship workspace | retain existing policy; general atomic intake/attach extension deferred |
| Email Responses (`responses/email/ingest`, conversation ingest) | provider message/thread source provenance; existing lifecycle gates | no workspace | a message is evidence, not necessarily a new person; canonical alias rules govern presentation |
| Social Responses (`responses/pull`, sync-meta) | provider/source IDs + dismissal suppression | no workspace | preserve external source/dedupe; identical text is not identity |
| Legacy manual Responses (`responses/create`) | unconditional inbox comment insert | no canonical preflight/workspace | missing membership boundary; narrowly authorize before any write and surface canonical preflight |
| Founder research (`founder-intelligence/research`) | read-only preview | none | reuse external research, no persistence on refresh |
| Founder save (`founderMemory.server`, records) | explicit identity_key/recordId/idempotency-key reuse; versioned snapshot | no workspace | reused person target stays the existing record; new capture preflight needed before source creation |
| Founder promotion (`founder-intelligence/promote`) | idempotent founder/source tuple + explicit linked acquisition | durable structural provenance; no workspace | preserve reviewed workflow; do not reinterpret company promotion as person identity |
| Founder activity (`founderMemory.server`) | record_founder_activity RPC | source-owned history | manual email/call/note has a separate historic source model; do not copy/rewrite it |
| Command Centre manual email/call/meeting/note/task | apply_relationship_workspace_action RPC | existing canonical refs, optimistic revision, idempotent key, canonical reread | primary new relationship facts should route here; no second writer |
| Ask Root proposals | original user request re-derived, explicit confirmation then same command writer | no autonomous action | preserve PR #98 allowlist/confirmation; research requests do not create proposals |
| Diary/Waiting/Home | links only from shared canonical projection | no source/workspace creation | PR #99 unchanged |

## Contracts that must not be invented

A transaction spanning source creation, canonical identity validation, source attachment and workspace revision is not currently exposed. `apply_relationship_workspace_action` receives the selected canonical refs, not arbitrary new sources. General source-attach/race-proof concurrent intake therefore remains deferred; no schema or link-writing workaround. Existing engine/provider ingestion must retain genuine evidence, including unresolved exact sources.

A pending non-persisted candidate cannot be recorded as keep_separate in the existing pair ledger (both endpoints require stored source refs). New ambiguous capture must stop and offer existing review/context or cancel, rather than inventing a durable separation token. A future candidate-intake review contract is needed for an explicit separate-identity creation override.

External research cannot be written into verified internal identity fields. New research previews do not save/link automatically. Existing explicit Founder review/save/version contracts remain the persistence path; no generic AI-to-fact save added.


## Implemented boundaries

The pure intake resolver adds a proposed source in memory to the unchanged Truth partition. Only existing policy-accepted profile/verified email aliases can establish a new match; names/company/unverified email identify review candidates only. The resolver never writes. A trusted existing source tuple can reuse its current source, preserving submission retry semantics. Manual Acquisition and legacy manual Responses recheck before creation; established/possible relationships return a review destination instead of another apparent person. Founder explicit capture reuses one established research record; unsupported arbitrary attachment stops without saving. Automated provider evidence and CSV/promotion writers remain unchanged.

Manual relationship facts use the existing Command Centre: Founder now offers an exact-source relationship shortcut for note, manual email, call and task entry. This reauthorizes/rereads through the canonical reader and uses the existing PR #98 guarded writer. Historical Founder activity is retained, not copied into a new storage model. Existing Diary/Responses/Acquisition operational actions are not substituted with manual workspace evidence.

Search remains the same approved partition/operational projection. Its bounded presentation now distinguishes established canonical relationships from exact sources requiring review, and shows actual source channels alongside coverage/count/provenance. No source is hidden or merged.

## Research architecture and privacy

Explicit research requests from Strategy or Ask Root resolve the exact authorised relationship through `readOperationalIntelligence` before any search. The orchestration reuses `researchManualOpportunity` (existing provider/model/search-source validation), existing Founder permission-filtered context and the existing Ask Root reasoning callback. No new provider or generator. Public queries contain recorded professional name/company/profile/website only; no internal notes, email addresses, correspondence or raw user question is sent to web search. Internal history and attributed public claims meet only in the existing reasoning step.

Eight labelled sections distinguish recorded facts, public findings, history, changes, opportunity hypotheses, mismatches, next move and uncertainty. Public sources expose URL/title/publication/retrieval time. Old Founder `updated_at` is labelled saved time, never current research time. Explicitly named permission-visible company research is separate company context, never employee identity or personal research. No shared process cache; opening/rerendering a relationship does not research. Refresh is explicit and read-only. Provider/reasoning failures retain internal evidence and visibly state unavailable current findings.

Founder discovery/deepen/contact/draft generation previously autosaved; these paths now remain previews. Existing explicit Save research / Save person / Save edited draft and promotion controls remain, using their current guarded domain contracts. Public research cannot mutate identity, lifecycle, cadence, receipts or permission to send.

## React review

Changed components retain existing ownership of state and event-driven asynchronous operations. Added intake banners use accessible status text and ordinary source links; blocked capture has review/cancel rather than a hidden override. Research runs only on a button/question event. No set-state-in-effect, new global listener, interval or render-time fetch added. Source links are bounded, protocol-validated and use noopener/noreferrer. Existing action confirmation, optimistic version/idempotency and canonical reread remain intact.

## Verification scope / deferred contracts

New pure intake, route and research tests cover the requested decision, provenance, tenant/Founder visibility, unsaved preview, missing/failing search, refresh, mismatches and external-source limits. Existing canonical discovery, Command Centre, Diary and send/Responses governor suites are rerun. Server route tests isolate external adapters; existing PGlite domain suites still exercise real SQL. No mock is claimed as live evidence.

No schema or migrations. General atomic source-attach and pending-candidate keep-separate remain explicitly deferred above. A reusable reviewed research snapshot-to-any-canonical-source save/link contract is likewise not present; this PR offers a read-only preview plus existing Founder review/save entry point, not a hidden cross-source save. Concurrency-safe global duplicate prevention across independent source writers requires that future transaction contract; the preflight is not a uniqueness constraint.


## Authenticated Preview finding — public namesake attribution

The first Simon read-only research preview returned a Toyota namesake with a different LinkedIn profile ID. It warned about the mismatch and did not mutate internal identity, but still listed unrelated Toyota findings in the selected person's result. The bounded correction quarantines findings when a supplied person profile is not present among the researched source URLs. Existing canonical URL normalization is reused solely for public attribution, not identity linkage. Unverified candidate sources remain visible with an explicit warning; their claims and source titles are excluded from person-specific opportunity reasoning. Recorded company/website alone cannot bypass this boundary. Exact-profile results such as Jenni retain their attributed findings. No query/provider/identity/writer behaviour changed.
