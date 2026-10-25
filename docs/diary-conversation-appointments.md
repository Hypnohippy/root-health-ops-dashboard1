# Diary Phase 3 — conversation appointments (PR #102)

Read-only projection on top of Phase 2. No schema or hosted configuration changes. The Phase 2 migration remains unapplied to Production.

## Authority and contract

`readOperationalCollection` already authorizes each tenant and resolves exact relationship/source boundaries. `canonicalDiaryConversations` consumes only those records, refuses unresolved identity, requires one canonical LinkedIn profile, and groups Gmail messages by the exact stored thread identifier. A thread exposed under conflicting relationships is withheld. No name, company, domain or approximate identity joins are introduced. The existing history reader and RelationshipTruth rules are unchanged.

Only stored individual LinkedIn/Gmail messages participate. Pasted multi-speaker snapshots, notification excerpts, quoted email history and manual receipt projections cannot manufacture individually dated turns. Missing authoritative message timestamps/directions or equal-time ordering ambiguity fail closed. Import/confirmation timestamps are never substituted.

The provider-neutral deterministic grammar tracks intent, availability, proposals, confirmation, cancellation, pending reschedule and uncertainty. Confirmation requires opposite-direction acceptance of an active single date/time proposal. Structured retained email invitation confirmations preserve Phase 2's stronger invitation evidence. This is bounded grammar, not general natural-language understanding: unsupported phrasing stays unconfirmed.

Relative weekdays require a dated explicit **next week** context, valid for at most seven days. Monday-start weeks and unique `Europe/London` instants use the existing Diary helpers; DST gaps/ambiguous times are rejected. A bare proposal hour needs opposite-party AM/PM clarification. Conflicting options, hedging, missing time context, weekday/date disagreement, negative responses and past proposed instants are withheld. No duration is fabricated.

Later cancellation removes the inferred active meeting; a reschedule requires a new agreement. Cadence and unrelated follow-ups/tasks/waiting are not changed. The projection conservatively represents the active agreement per conversation; it does not invent separate occurrences from ambiguous multi-appointment threads.

## Shared output and provenance

Diary, Home and Ask Root pass the same authorized collection into `extendDiary`. Linked email threads are evaluated as sequences, so an older per-message confirmation cannot resurrect a subsequently cancelled appointment. Unlinked Phase 2 email evidence remains available through the existing adapter.

Conversation appointment keys include tenant, provider identity, relationship, conversation and resolved occurrence. Replays dedupe deterministically. Google events merge only with exact structured iCalUID + occurrence evidence; matching titles/person/time never merge sources. Meeting and follow-up remain distinct event types.

Cards identify the confirmed conversation provider, channel/caller when stated, and proposal/acceptance/confirmation message IDs with date-resolution basis. Ordinary cards contain no raw message bodies; the exact linked relationship opens the existing source history. Unknown channel remains unknown. Ask Root supports the upcoming named weekday and person filters without treating a name filter as identity evidence or claiming a Google booking.

## Auriel: synthetic versus live evidence

Synthetic full-sequence replay: **Auriel Wetherall — WhatsApp call**, Tuesday **27 October 2026, 13:00 Europe/London**, confirmed, caller Auriel, no inferred duration. Proposal/acceptance/channel confirmation remain individually traceable.

Authorized read-only Production diagnostic, 25 October 2026:

- Exact profile `linkedin.com/in/auriel-wetherall-77a2192a9` exists on inbox source `53a4df61-57cc-4238-ac68-b2bab176b76b`.
- Three stored LinkedIn rows: one verified outbound availability message (`64f4477c-4a0a-4fb6-b1ea-09f999359418`, 22 October 2026 at 14:44 UTC), and two undated `snapshot` rows.
- Snapshots contain the earlier Wednesday/Thursday discussion; the individually dated Friday 1pm proposal, David's acceptance and Auriel's WhatsApp/caller confirmation are absent.
- Therefore the real stored evidence **does not establish the appointment**. No missing chat was backfilled; no manual/calendar entry was created. The user-supplied complete sequence is used only in synthetic tests.

## Verification and retained gates

Focused suites cover the synthetic acceptance case, prefixes, ambiguity, bare-hour clarification, cancellation/reschedule, source scoping, namesakes, Gmail parity, canonical-reader identity exclusion, stale email resurrection, provenance/dedupe and shared Ask Root selection. Phase 2, existing Diary/UI/navigation/Home/Ask Root and affected identity/Truth suites are retained. Exact final counts are recorded in the PR description.

Synthetic component rendering at **1280×900** and **390×844**, including expanded source evidence, has no horizontal overflow; source action remains reachable. This is component-layout proof, not hosted OAuth/CRUD certification. No TSX or CSS changes were needed in Phase 3.

Google remains `calendar.events.readonly`. Phase 3 adds no sends, invitations, external mutations, ingestion, automatic identity merges, hosted migrations, paid branches or Production writes. Existing Phase 2 hosted migration/authenticated CRUD/real Calendar consent checks remain separate release prerequisites. Keep PR #102 Draft and unmerged.
