# Lifecycle-aware Responses

Events describe what happened; the Phase 4L projection determines what happens
next. No new persisted state, migration, job or provider integration is introduced.

The Responses list and contact briefing both read the existing paginated tenant
snapshot and use `buildContactLifecycle`. The list attaches presentation metadata
to each inbox item; AI context finds its Growth and Acquisition evidence through
the projection's record references rather than separate URL/name matching.
`responseLifecycle.ts` only translates that projection into labels and action
eligibility. It performs no writes or lifecycle transitions.

| Unified lifecycle / evidence | Responses label | Drafting and human action |
| --- | --- | --- |
| Untouched outreach-ready contact | First message opportunity | First-message draft; LinkedIn acceptance can be marked contacted |
| Recorded LinkedIn contact, known future cadence date | Contacted / follow-up scheduled | No action due; preparing the scheduled follow-up requires explicit request |
| Recorded contact without trustworthy timing | Contacted / waiting | No invented due date or first-message draft |
| Follow-up date reached | Follow-up due | Next-stage draft; human action required |
| Email sent or automatic acknowledgement | Waiting | No active reply/outreach draft without a scheduled next step |
| Current email bounce | Delivery issue / blocked | Review delivery/contact details; drafting blocked |
| Current email redirect/referral | Referral / redirect needs review | Review recipient/destination before drafting; advanced lifecycle takes precedence |
| Current human reply/comment | Needs reply | Reply to the current actionable event, never follow up as if unanswered |
| Replied social event / recorded engagement | Engaged | Established-conversation draft on explicit request only |
| Meeting | Meeting | Preserve stage; respond to a pending reply if one exists, otherwise continue the relationship on explicit request |
| Parked / nurture | Nurture | Optional re-engagement on explicit request; never a first-contact opener |
| Converted / lost / dismissed | Converted / Closed | No outreach draft or active sending controls |
| Archived / no reply needed | No action due | No active drafting |
| Unknown state or unsupported future channel | State unavailable / projected state | No invented message workflow |

Cards show current state and next action/date; the detail panel also shows last
action, channel and whether a human action is required. Filters/counts use these
current action categories rather than historical inbox status. The original event
text, time, classification and history remain available as evidence.

## Projection refinements

- A contacted LinkedIn acceptance uses its existing `contacted_at` or reply time
  and the shared Growth cadence. No reconciliation run is required to read it
  correctly. A `connection` target with an existing action time likewise cannot
  become a first-message prompt.
- A sent email reads as waiting; an automatic acknowledgement cannot become a
  human reply merely because its original status says needs reply.
- A later waiting email supersedes an older pending cadence in the view. Actual
  event/sent times are used; editing a draft is not evidence of a new interaction.
- Pending human replies win over outreach cadence. Terminal outcomes retain the
  Phase 4L precedence. A meeting with a pending reply keeps its meeting stage and
  exposes that reply as its next action through `actionRecord` provenance.
- Original acceptance records cannot be used to draft when the current action
  belongs to a newer reply or a different channel. The UI directs the user to the
  current reply instead.
- Reconciliation's existing Mark Contacted normalization also accepts the refined
  `follow_up` projection; repair behavior and idempotency remain unchanged.

The existing identity hierarchy and ambiguity handling are unchanged. Cross-channel
records join only where existing LinkedIn/email/person-and-organisation evidence
permits it. Missing identifiers are not filled by guessing from display names.
Partner evidence already present in Acquisition participates through the same
projection. Future call/Vapi records require a supported data adapter before they
can drive drafting; this change does not implement calls or invent call states.

## AI and action safety

Responses sends an inbox ID, not a client-selected relationship stage. The server
loads current lifecycle context, rejects unavailable/closed/obsolete actions before
calling AI, and requires an explicit request for scheduled or discretionary drafts.
It checks lifecycle again after generation and discards the draft if state changed.
The system prompt prioritizes current stage and permitted interaction; event text
is untrusted history. Without lifecycle context, interaction selection returns no
action. The event-based local draft fallback and local status overrides are removed.
Copying text does not mark a contact as contacted or replied.

Mark Contacted, social reply and email actions refresh server lifecycle data.
Selection changes cannot attach a completed AI draft to another contact. The
existing Phase 4D approval/send routes and provider calls are unchanged; the UI
disables obsolete actions. There is no automatic sending, cron or state repair
on list/context reads. API reads are private and uncached.

## Validation

`npm run test:security` includes lifecycle-to-Responses tests for LinkedIn, email,
social and partner evidence, rendered card labels, shared list/context output,
reply versus follow-up selection, waiting acknowledgements, terminal outcomes,
explicit draft requests, stale draft rejection and tenant isolation. Existing
reconciliation and Phase 4D tests run unchanged apart from assertions that formerly
required the obsolete event-specific AI context string.
