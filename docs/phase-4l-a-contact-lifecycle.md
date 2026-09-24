# Phase 4L-a: unified contact lifecycle

`GET /api/growth/lifecycle?organisationId=<uuid>` returns `{ success, data }`.
Uses existing read membership checks and tenant-filtered, ID-ordered pages from
`acquisition_items`, `inbox_items`, and `growth_targets`. Errors fail the whole
request; results are private and not cached. No UI or database migration.

Each contact includes `contactId`, `identity`, `organisationId`, `name`, `company`,
`currentStage`, `lastAction` (`action`, `at`, `table`, `id`, or null), `nextAction`,
`nextDueDate`, `channel`, `source`, and contributing `records` with mapped stages.
Unknown dates/actions are null. Source and channel describe the record selected
for the current stage; last action is independently selected across all records.

## Identity

1. Canonical LinkedIn person profile: normalise host, case, percent encoding,
   `/comm/in/` versus `/in/`, trailing slash, query and fragment. Reject non-LinkedIn
   hosts, company pages, posts, messaging URLs and malformed profile URLs.
2. Trimmed, lowercase email (no provider-specific alias rewriting).
3. Person + company, both required, with Unicode, case and whitespace normalisation.
   Company is the contact's organisation, not the tenant's organisation.
4. Without these fields, use table + record ID; never merge nameless records.

Email-only records join a LinkedIn identity only when their email maps to exactly
one LinkedIn identity. Name/company-only records join a stronger identity only
when that pair maps to exactly one identity. Conflicting strong identities remain
separate. Ambiguous weaker records retain their own weaker key. There is no fuzzy
matching or merging based on name alone. Inbox metadata is read from `raw` and
`raw.metadata`; acquisition metadata from `metadata`. A generic inbox permalink
is not treated as the author's identity; the existing connection-acceptance
profile permalink is supported.

`contactId` encodes tenant + selected identity. It is deterministic for the same
input, not a durable database ID: adding stronger identity evidence can change it.

## State mapping

| Source | Stored state | Lifecycle stage / next action |
| --- | --- | --- |
| Acquisition | new / reviewing | new / reviewing; review |
| Acquisition | accepted | outreach_ready; prepare_outreach |
| Acquisition | actioned | actioned; none inferred |
| Acquisition | engaged / nurture | engaged / nurture; review_engagement / review_nurture |
| Acquisition | converted / lost / dismissed | corresponding stage; no next action |
| Inbox | needs_reply (or legacy unread) | needs_reply; reply |
| Inbox | connection_accepted needing reply | outreach_ready; first_message |
| Inbox | waiting_for_human | waiting; no next action |
| Inbox | follow_up | follow_up; follow_up, stored follow_up_at |
| Inbox | engaged (or legacy replied) / nurture | engaged / nurture; review_engagement / review_nurture |
| Inbox | no_reply_needed (or legacy archived) | no_reply_needed; no next action |
| Inbox | converted / closed_or_lost | converted / lost; no next action |
| Growth | deal won/converted or call outcome won | converted; no next action |
| Growth | deal/call/status lost or reply not_interested | lost; no next action |
| Growth | deal meeting or reply call_booked | meeting; review_meeting, stored call_date |
| Growth | deal engaged/opportunity or reply positive/interested/engaged | engaged; review_engagement |
| Growth | stage/status parked | nurture; review_nurture |
| Growth | active connection | outreach_ready; connection |
| Growth | active day3_dm / day10_insight / day17_followup | follow_up; existing stage action |
| Any | unrecognised state | unknown; no action or date inferred |

Inbox `response_state` takes precedence over legacy `status`. Growth conditions
are evaluated in the table's order. A stored growth `next_step` overrides the
suggested action and uses `next_step_date`, except for converted/lost/unknown.
Otherwise growth follow-up dates use existing cadence: last_action_at + 3 days
for day3_dm, + 7 days for day10_insight/day17_followup. Missing or invalid dates
remain null. These are display calculations, not scheduling or due-state writes.

When records disagree, the presentation precedence is:
converted > lost > meeting > needs_reply > engaged > nurture > follow_up > waiting
> no_reply_needed > actioned > outreach_ready > reviewing > dismissed > new > unknown.
Ties use newest known observation timestamp, then growth > inbox > acquisition,
then table + ID. Last action uses the latest recorded action timestamp separately;
an inbox state observation is labelled `response_state:<state>` and is not evidence
of sending. Growth last_action_at is labelled `outreach_marked_sent`, matching the
existing manual workflow. No timestamp is invented for untimestamped deal changes.

Conflicting states remain visible in `records`; this projection does not reconcile
or repair them. Reads across tables are not a transactional snapshot and can show
concurrent changes. No scheduling, reconciliation jobs, Home redesign, B2B sync,
automatic repair, sending changes or draft generation are included.

## Validation

`node --test tests/contact-lifecycle.test.mjs` exercises identity and ambiguity,
tenant boundaries, mappings, precedence, deterministic ties, due dates, immutable
inputs, endpoint pagination and failure handling. It also runs in
`npm run test:security`. Route tests mock persistence and the tenant wrapper;
the existing tenant-security suite covers the shared authentication implementation.
