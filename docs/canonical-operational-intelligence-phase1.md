# Canonical operational intelligence — Phase 1

Base: `26c590593dac644500cc0ba533c6cf6716dad3a6`.

## Read contract and authority

`readOperationalIntelligence` composes the existing tenant-authorized relationship context, canonical discovery/identity-ledger partition, lifecycle projection, workspace reader, history reader, tasks/notes, and LinkedIn queue governor. It creates no database objects or persisted state.

The identity partition scopes sources before history expands. An established partition can supply its source references. An unresolved identity is limited to the explicitly selected source. A workspace crossing canonical identities fails closed; source records remain available for review. Founder/private filtering happens in the existing context/history services. Names, companies, domains and addresses typed into activity do not create identity links.

The read result retains the existing Relationship detail contract and adds `intelligence`:

- identity, aliases, source/workspace references, ambiguity and review requirement;
- lifecycle stage/last action, retention and owner, separately from relationship memory;
- latest actual event and latest recorded event, confirmed inbound/outbound, manual activity and call/meeting evidence;
- existing notes/tasks and linked stored conversation history;
- raw recorded cadence, projected due date, whether that date has arrived, currently eligible due work, and explicit suppression reasons;
- linked-history coverage limitations and provenance.

Manual calls/emails/observations are relationship memory. They never become send receipts, delivery proof or cadence completion. Scheduled meetings are not evidence that a meeting happened. Undated evidence stays undated. Stored inbox text remains available if a separate conversation row has not been ingested; quoted outbound text does not become a separate send.

## First consumers

Relationship detail and Ask Root call the same reader. Search retains canonical discovery partitioning and existing operational destinations; unresolved cards display source/date/channel/mailbox provenance instead of looking like indistinguishable duplicate people. There is no identity merge or new grouping rule.

The queue and generate endpoint read tenant-owned workspace retention from explicit source links. `stale` suppresses proactive work with **Relationship marked stale**. Cadence/due dates/history remain recorded. Inbound reply attention and Responses behaviour remain unchanged. Restoring active removes only this guard; all existing eligibility checks still apply.

`reconcileLinkedInSend`, receipts, cadence computation and the operational send governor remain unchanged. This read-only slice does not rewrite already-sent evidence recording or historical reconciliation.

Ask Root's explicit selected relationship context and safely resolved source context use canonical grounding. Novel operational questions can reach the existing model without an exact question regex. Ambiguous global subjects require source selection. Generic page help and non-relationship workspace help remain available. Recorded facts, user observations and model interpretation are explicitly distinguished. Model failures retain recorded evidence and an unavailable notice. Write requests remain blocked. Model/provider configuration is unchanged.

RelationshipTruth's established identity/discovery components are reused live. The full shadow Truth operational/action recommendations are **not** promoted into action authority. Existing domain governors continue to decide eligibility.

## Next consumers and future actions

Waiting, Home and Diary remain separate Phase 2 consumer migrations; raw cadence stage counts must not be described as action-eligible work. Diary must preserve meetings, follow-ups, tasks and waiting as distinct event types. Strategy stays disabled. Migrate and validate the remaining operational consumers before enabling Strategy; do not enable a placeholder Strategy Room in this PR.

Future actions must use read → reason → typed proposal → consequence → explicit user confirmation → existing guarded domain action → canonical reread/verification. There is no generic AI mutation endpoint. Stale/archive/dismiss/no-reply-needed remain distinct, and identity resolution remains a dedicated human-reviewed authority.

## Verification boundaries

Synthetic focused tests exercise actual projection/history/discovery/queue modules with tenant-scoped read fixtures. Snapshot protections explicitly preserve reconciliation, receipts, Responses lifecycle and identity-review rules byte-for-byte against the base. Existing guarded write-handler bodies remain unchanged.

Authenticated final-build verification must cover Carole's persisted stale state without changing it, Simon's separate source identities and recent workspace memory, shared Ask Root grounding including a novel question, and exact 1280×900 / 390×844 viewports. No live sends, record edits or retention changes are authorized by this verification.
