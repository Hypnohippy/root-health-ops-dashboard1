# PR #102 Phase 4 — LinkedIn conversation Quick Capture

## Entry and review flow

The shared Ops shell exposes **Capture LinkedIn conversation** above page content, retaining the active organisation. `/dashboard/responses/linkedin/capture` loads only server-authorized existing LinkedIn contacts and the tenant's existing sender-name evidence. A loading boundary provides immediate feedback. The form keeps the paste in component memory; it does not upload it while typing or parsing.

An exact canonical profile URL can select exactly one existing contact. A missing/ambiguous URL requires explicit existing-contact selection. A single pasted foreign/namesake profile cannot silently attach to the selected different profile. Names/headlines/company/domain are never used to authorize attachment or create contacts. Sender names classify **reviewable directions only**, never relationship identity; unknown speakers require correction.

Supported message boundaries include LinkedIn's `sent the following message(s) at` header and compact name/dash/time or repeated name/time headers. Duplicate rendered sender lines, View-profile chrome, degree/pronoun/status chrome, Seen lines and reaction-only blocks are excluded. The exact extracted message body retains paragraph breaks. Unknown copy formats stay in the original paste and can use the existing snapshot log; nothing automatically uploads an undated snapshot.

Weekday/Today/Yesterday headings require explicit confirmation that they belong to the seven days ending on the visible reference date. This is a user-verified temporal anchor, not an inference from the machine's current date. Backward dates, missing anchors, unknown speakers and DST gaps/ambiguous times remain unresolved. Explicit dates also work without a relative-date assumption. Unresolved rows stay visible and excluded; the user may correct direction/date/time and inclusion. One final verification checkbox and one save submit the reviewed set. Preview is a tenant-scoped GET; save is an explicit POST. No automatic write retry.

## Canonical persistence and proposed migration

Existing endpoint: `/api/growth/linkedin-conversation`; new discriminator: `kind: capture_batch`. Existing single-message and snapshot paths are retained.

New **UNAPPLIED** migration: `20261025135729_linkedin_conversation_quick_capture.sql`. It adds only `append_linkedin_conversation_batch`, a service-role-only **security-invoker** wrapper around the existing `append_linkedin_conversation_message` RPC. No new table, second message store or provider integration.

The existing RPC commits one message at a time and does not expose a transaction across HTTP calls. A thin database wrapper is needed for all-or-nothing save and a single revision lock. It checks actor write-role membership, locks the existing organisation lifecycle revision, rejects stale new work, and calls the established writer for every message inside one transaction (maximum 100 messages). Any later-row failure rolls back the whole batch and its source-state/revision changes. Existing inbound-reply suppression is preserved by that writer; capture does not authorize an outbound send.

Receipt UUIDs deterministically hash tenant, exact canonical profile, direction, normalized UTC timestamp and message text. Full committed retries remain idempotent after the revision advances; receipt payload/identity mismatches fail. Legacy-message dedupe requires the same tenant/profile, direction, exact timestamp/time precision and body after excluding recognized copied UI wrappers. Equal text at a different time/direction/profile is retained. Existing stored bodies are never rewritten. A lost-response error says **save not confirmed**, retains the review, and can be retried safely. New stale work requires refreshed review.

The wrapper is not deployed by Vercel. It was applied only to the isolated local PGlite PostgreSQL harness over the canonical baseline. No hosted migration, environment change, paid branch or Production DML occurred. The separate Phase 2 Diary migration remains unapplied. Hosted batch persistence remains a release gate requiring explicit authorization.

## Auriel rehearsal (synthetic full copy versus live stored evidence)

Reference date: Sunday 25 October 2026; relative-date window explicitly confirmed. Exact profile: `linkedin.com/in/auriel-wetherall-77a2192a9`.

| UK date | UK time | Direction / sender | Body begins | Rehearsal against live rows |
|---|---|---|---|---|
| 21 October | 11:25 | Outbound / David | Hi Auriel, thanks for connecting… | New |
| 21 October | 11:28 | Inbound / Auriel | Hi David. That's great to hear… | New |
| 21 October | 11:30 | Outbound / David | Thanks for coming back to me… | New |
| 22 October | 15:12 | Inbound / Auriel | What is your schedule looking like for next week? | New |
| 22 October | 15:44 | Outbound / David | No problem Auriel, I am around on Tuesday… | Dedupe existing dated message |
| 23 October | 15:54 | Inbound / Auriel | Tuesday is good for me, how does 1pm sound? | New |
| 23 October | 15:57 | Outbound / David | I do have zoom, but prefer whatsapp…1pm is perfect | New |
| 23 October | 16:21 | Inbound / Auriel | That all Good I will call you on WhatsApp | New |
| 23 October | 16:22 | Outbound / David | Fantastic, I am looking forward to meeting you Auriel | New |

All nine individual timestamps are BST (UTC+1). The inferred appointment is after the DST change: **Tuesday 27 October 2026 at 13:00 Europe/London (13:00 UTC)**, WhatsApp, CONFIRMED, caller Auriel, source LinkedIn conversation; no manual Diary entry or duration. The capture code contains no appointment parser or Auriel-specific rule. The unchanged Phase 3 engine derives it from fresh local canonical database reads; Diary/Home/Ask Root continue sharing that evidence layer.

Authorized read-only live re-read still finds inbox identity `53a4df61-57cc-4238-ac68-b2bab176b76b`, one verified outbound (`64f4477c-4a0a-4fb6-b1ea-09f999359418`, 22 October at 14:44 UTC) and two undated snapshots. The full supplied conversation is a **synthetic rehearsal**, not a claim that Friday messages already exist in Ops. Rehearsal: **9 parsed, 8 would append, 1 would dedupe**. The two snapshots remain unchanged. **Live Auriel written: NO.**

## Verification and safety

Focused parser, real local PostgreSQL wrapper/server path, route authorization and React interaction suites verify review, role/tenant isolation, atomic rollback, retry dedupe, stale revision, existing-message preservation, namesake exclusion, direction/date corrections and automatic Phase 3 projection. Retained LinkedIn conversation/action/cadence, Truth/identity, Diary Phase 2/3, Home and Ask Root suites are run separately. Counts and exact Preview/viewport results are recorded in the PR description and final report.

React review: event-driven state updates; no state-setting effects; duplicate-submit ref guard; parallel authorized server reads; no raw Auth details/client secrets; derived review state; scoped CSS; labelled controls and visible errors. Relative-date parse and final save are separate explicit actions. No LinkedIn automation, scraping, credentials, new provider access, sends or invitations. Google remains `calendar.events.readonly` with zero event writes. Keep PR #102 Draft and unmerged.
