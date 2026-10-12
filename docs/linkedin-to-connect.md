# LinkedIn To connect

Separate from PR #58. Built from current main, with no changes to first-message or follow-up prompts, acceptance workers, cadence, timers or discovery caps. No migrations.

## Qualification and identity

The pre-acceptance view requires one unambiguous direct HTTPS LinkedIn profile, a named person, and explicit professional-source qualification: existing LinkedIn recommendations/network suggestions, manually authorised connection outreach, or public professional research with a recorded professional recipient category. ISMA is not hard-coded. Explicit tests, health-targeted/consumer outreach and Personal audience signals are excluded. Closed/dismissed/lost/converted/engaged states and existing inbox/growth relationships prevent a fresh invitation. Sender identity is excluded using the existing tenant-scoped self-contact check.

Canonical profiles group duplicate Acquisition records before presentation; every underlying ID and source remains unchanged. No name/email/subject guessing establishes LinkedIn identity.

## Invitation-only receipts

Append-only receipts live in the existing acquisition_items.metadata.linkedin_invitation.history JSON. Receipt fields: action, actor, key, confirmed_at, invitation_sent_at for a confirmed invitation, and evidence. They never contain outbound message text, sent_at, completed_at, contacted_at, first_outbound_at, acceptance flags or cadence state. The existing provenance and other metadata remain intact. Production confirmation uses tenant/status/version/metadata compare-and-swap; retries cannot create another invitation receipt. No new relationship records, growth targets or inbox rows are created. Save is a bookmark in that same history. Dismiss changes only the existing Acquisition status plus this audit history.

## Acceptance transition

Existing Gmail/digest/manual acceptance remains authoritative. Projection removes the identity from To connect / Pending and references the existing Responses ID. The isolated LinkedIn Acquisition view retains the original source/category and suppresses a redundant accepted-reference card. The standard accepted-connection/message queue and its safeguards are unchanged; invitation metadata is deliberately nested so it cannot contradict a later acceptance.

## Preview safety

Preview shares live data, so the new invitation/save/dismiss endpoint forcibly rehearses those actions without database writes. The UI states this prominently, and reload restores the live data. A pending rehearsal is not an actual sent invitation. Note generation is read-only and uses the tenant Growth Profile. All real sends and invitations remain manual; neither Copy nor Open profile records an action.

## Required verification

Read-only Preview: at least three existing public ISMA opportunities, person/company/category/context, correct profile links, short category-aware generated notes, no first-message action, known accepted exclusion and acceptance linking. Mutation semantics are exercised in focused API/pure tests and a clearly labelled read-only Preview rehearsal, not a Production write. Actual persisted invitation confirmation remains untested until a separate approved non-Production data target or Production verification authorisation is provided.
