# Founder memory and historical search — local implementation

## Scope and rollout boundary

This is local-only. `20261013170000_founder_memory.sql` is an unapplied additive migration. No Production data backfill, worker change, send or deployment is included. Existing Founder identity/owner/plan checks gate every memory/history/reconciliation API. PR #58 is untouched.

## Storage

- `founder_research_records`: stable UUID, tenant and creator, separate company/person identity, verified website/domain/email/LinkedIn evidence, lane/geography/discovery context, research snapshot and retained versions, sources, discovered contacts, scores/rationale, edited draft, saved flag and optional Acquisition reference.
- `founder_activity_events`: append-only actor-stamped manual history, actual activity time separately from database recording time, route, optional subject/exact message/note, authoritative Gmail evidence IDs and idempotent receipt details.

RLS is enabled with no browser-role table access. Service-role privileges are SELECT/INSERT/UPDATE on research, SELECT/INSERT on history; no DELETE. Composite tenant/record FK and a tenant Acquisition-link trigger independently prevent cross-tenant references. The activity RPC is service-role-only. Unknown historical times remain NULL; Just happened now uses the database clock. Changed receipt payloads cannot reuse a key. Gmail links require the existing tenant message/thread pair and do not insert or modify conversation rows.

## Existing Founder UX

Research / Recent / Saved / Companies / People / Partners / Sent to Acquisition share stored-history search. Discovery and deep research are saved without creating operational placeholders; current text is retained with a clear error if storage is unavailable. Reopening restores the snapshot, sources, contacts, saved draft and activity trail. Save person uses a verified contact from the research. Shared mailboxes do not collapse different named people into one record.

Manual emailed / LinkedIn contacted / called / note added actions require confirmation. Generated/copied drafts never create send history. Edited drafts can be saved separately. The timeline shows research, contact history, promotion and existing operational current states; it is not another lifecycle engine.

Promotion links the actual Acquisition item back to Founder research and preserves earlier history. Both directions have navigation links. Prior contact is presented for review and initial outreach is guarded against restarting a contacted relationship, including activity recorded after promotion. No Growth target or Acquisition item is created solely to store memory.

## Reconciliation

The preview reads only existing `email_conversation_messages`. Strong candidates use exact verified contact email and person/company context. Company-domain-only candidates are explicitly review candidates, never inferred person matches. Gmail IDs remain authoritative. Every attachment requires human confirmation; Ignore records a note rather than attaching evidence. Linking appends a reference to the existing message and retrieves source text on read, without copying conversation storage. Ambiguous/shared-domain contacts and foreign tenants are never auto-merged. Existing LinkedIn canonical identities are used for operational state projection; an email without authoritative Gmail IDs is not invented from a LinkedIn profile.

Historical recovery covers evidence already stored in Ops. It does not scan Gmail Sent or change live Gmail intake/coverage. Earlier unsaved Founder research needs manual recovery or separately authorised import; this implementation performs no backfill.

## Shared historical search

`opsSearch.ts` provides bounded literal Unicode-normalised matching over approved identity/description fields; user text is never interpolated into PostgREST filter syntax. `opsSearch.server.ts` reads every tenant-scoped page and fails rather than returning partial results.

- Acquisition searches full history before pagination. Personal search retains existing conservative grouping, Reddit/test exclusions and action policy.
- Responses searches full inbox history plus existing exact-thread conversation text before pagination, reusing existing lifecycle and attention projection. Search/filter changes use debounced explicit requests, not polling.
- LinkedIn Outreach has a separate all-known-relationships search with authoritative state and links to the existing Responses/pipeline/Acquisition action owner. Work next 10 eligibility, cadence, generation and send/retry logic remain unchanged.

The foundation favours predictable literal matching over an additional search subsystem. Large histories require scanning server pages; indexed full-text search may be evaluated separately if measured load warrants it.
