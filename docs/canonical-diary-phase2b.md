# Canonical Diary, Waiting and Home — Phase 2B

Base: `34da4037d52a6a8741e39b688a23a91279d37de0` (PR #98).

## Read architecture

`readOperationalCollection` prepares the same identity inventory, tenant/Founder visibility, proactive-retention overlay, LinkedIn queue and Responses authorities used by the exact-record reader. Request-local in-flight history reads and membership are shared; there is no process-wide tenant cache. Ambiguous identities remain exact sources. `buildOperationalWork` projects that evidence into stable events; Diary, Waiting, the bounded Home subset and Ask Root consume this projection. It neither invents lifecycle permission nor writes state.

## Event contract

- Meeting: a structured `growth_targets.call_date`; not a booking URL, inferred appointment, or proof a meeting happened.
- Follow-up: recorded Growth cadence and explicit Responses follow-up evidence, with permission from the unchanged LinkedIn/Responses governors. Unknown due dates remain undated, non-actionable history.
- Task: open dated relationship tasks and explicit dated next steps; ownership retained, completed/cancelled tasks excluded.
- Waiting: an explicit canonical waiting state, and summary counts of non-actionable cadence dependencies. Not every contacted person.
- Manual activity: recorded emailed/LinkedIn-contacted/called/meeting history; actual date and recording date are separate. Ordinary notes are not calendar events. Future timestamps cannot prove completed activity.

Dedupe is stable underlying event ID only. Same relationship/date never collapses meeting, cadence, task or waiting. Date-only evidence remains date-only, and zoned timestamps use Europe/London. Today is a UK date; weeks are Monday–Sunday; overdue means actionable on an earlier UK date. Historical meetings are never silently marked completed.

## Booking satisfaction gap — subsection stopped

No authoritative purpose-to-booking satisfaction link exists in the inspected current schema/contracts. Therefore this PR does **not** automatically clear a booking-chase follow-up from meeting text or merely because a structured meeting exists. Existing governor exclusions remain authoritative; unrelated explicit tasks survive. A future reviewed purpose/satisfaction contract is required before adding narrower booking-chase completion. No schema is proposed or applied here.

## Home and Waiting scope

Waiting no longer directly calculates due cadence from Growth `last_action_at`. It labels raw stage distribution as recorded items, shows current actionability separately, retains suppression/stale history, and exposes provenance and safe navigation.

Home follow-up, waiting and reply counts use the shared work/Responses authority. Two bounded cards expose meetings this UK week and overdue tasks. Relationship cadence cards are remapped to canonical eligibility and source destinations. Unrelated publishing, connection health, marketing/acquisition metrics and commercial pipeline counts remain existing models. `meetingsOrConversions` is still the existing commercial pipeline metric, not Diary's structured calendar meeting count.

Unmigrated consumers include existing Growth pipeline/commercial statistics, source-engine schedules and publishing intent. LinkedIn and Responses retain their domain authorities rather than being replaced. No general Home redesign or new mutation surface.

## Ask Root

Common date questions read the shared snapshot directly. Novel Diary questions reach the existing read-only reasoning boundary with bounded canonical evidence. Recorded facts appear first and interpretation is labelled separately. No action tools, writes, sends, priority scores or calendar providers are introduced. Generic workspace help outside Diary keeps its existing dispatcher.

## Navigation, privacy and calendar boundary

Established identity resolves to the existing Relationship Command Centre, preferably its safe workspace locator. Unresolved identity retains an exact source destination and explanation; company names never authorize attachment. Private/Founder evidence is filtered by the existing reader before presentation. Existing PR #98 record/repair/Strategy mutation boundaries are unchanged.

The provider-neutral calendar contract retains tenant organisation/account/user ownership, provider, external event ID, start/end/timezone and verified relationship linkage. Google/Microsoft are types only: no OAuth, credentials, ingestion or provider writes.

## Verification

Synthetic local tests exercise independent events, UK date boundaries/BST, exact queue parity, stale retention, genuine Responses attention, safe navigation, tenant/private filtering, shared table reads and Home count semantics. Authenticated Preview evidence and exact final test totals are recorded in the PR once available.

Safety: zero sends, provider/calendar writes, schema/migrations, identity merges, deletes, AI writes, lifecycle stage overrides or business-data mutations.
