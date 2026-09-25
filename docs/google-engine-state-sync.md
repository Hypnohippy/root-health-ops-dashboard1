# Google engine operational state

This adds a visibility-only receiver for Root Health Lead Engine (`root_health_b2b`)
and Root Health Personal Lead Engine - BUILD (`root_health_personal`). It does not
change their workflows, write back to Sheets, send messages, approve drafts, run
reconciliation or register triggers. Home is unchanged.

## Deployment boundary

The user verified both spreadsheet IDs, the B2B `Leads` headers, all seven Personal
tab names and the `Partner Outreach` headers. Concrete configurations now use that
schema: [B2B](google-engine-state-b2b.config.json) and
[Personal](google-engine-state-personal.config.json). These are field mappings,
not a claim of live deployment. Remaining identity/safety fields and tab-specific
gaps are listed below; the whole schema is no longer marked unverified.

1. Apply `supabase/migrations/20260925100000_acquisition_engine_state.sql` and deploy Ops.
2. Reuse the existing server-only `GROWTH_INGESTION_KEYS` configuration with the
   correct organisation and source engine scope. No default tenant is selected.
3. Resolve only each mapping's `pending` entries before enabling that mapping.
   Preserve existing acquisition source IDs exactly;
   never use mutable row numbers, generated IDs per run, or names as source IDs.
4. The engine can POST the contract below. Alternatively add
   `docs/google-engine-state-export.gs` as a separate Apps Script file, configure
   Script Properties, and run `opsExportEngineState` manually. Do not replace any
   engine handler or add a trigger. No existing send/approval handler is modified.

## Receiver contract

`POST /api/growth/engine-state`, `Authorization: Bearer <dedicated ingestion secret>`.
Uses the same payload limits and tenant/source authorization as opportunity intake.
The existing `/api/growth/ingest` remains first-import-wins, unchanged.

```json
{
  "organisation_id": "78fa2ac8-e7b6-4b9b-9604-035723ece6b1",
  "records": [{
    "source_engine": "root_health_b2b",
    "source_record_id": "existing-stable-source-id",
    "record_type": "b2b_lead",
    "person": "Example Contact",
    "company": "Example Organisation",
    "observed_at": "2026-09-25T12:00:00Z",
    "state": {
      "Status": "sent",
      "email": "contact@example.com",
      "channel": "email",
      "followUpStage": "followup_1",
      "lastFollowUpAt": null,
      "nextFollowUpAt": "2026-09-28T12:00:00Z",
      "followUpStatus": "scheduled",
      "lastInboundAt": null,
      "lastOutboundAt": "2026-09-25T10:00:00Z"
    }
  }]
}
```

`observed_at` is the time this complete snapshot was verified from the source,
not an invented interaction time. Retries must retain it. Interaction timestamps
must include timezone and cannot be later than the observation. A snapshot is
complete, not a patch: preserve known identity and interaction timestamps in later
exports. Null/missing fields mean unavailable, never a fabricated event or date.

State supports the illustrated sheet headers or canonical snake_case names;
supplying both aliases is rejected. Additional allowlisted fields:
`reply_state`, `approval_state`, `funnel_state`, `outcome`, `opportunity_type`,
`next_action`, `channel`, `email`, `linkedin_identity` (or `linkedin_url`),
`person`, `company`. Unknown state fields are rejected. Unknown enum strings are
retained as source evidence without guessing a lifecycle transition. Source
classification must be explicitly mapped; free-text email content is not used.

Verified live additions: `followUpCount` → `follow_up_count`, `discoverySource` →
`discovery_source`, `discoveredAt` → `discovered_at`, and Personal `Conversions` →
`conversions`. Counts remain source strings and do not infer a conversion or change
cadence. Discovery dates are timezone-qualified source timestamps. These values
travel in each state snapshot, so updates are not lost in import-only metadata.

Top-level opportunity/evidence fields match the existing intake contract. New
items always enter the human-owned acquisition queue as `new`; source approval
is evidence only and never an Ops approval or Phase 4D send authorization.

Response: `{success, received, inserted, updated, duplicates, stale, conflicts}`.
Every record applies atomically. A database failure returns a sanitized 503;
earlier records may have applied, so retry the same snapshots. Equal timestamp
with different evidence, concurrent compare-and-swap failures, identity changes,
missing/regressed known event timestamps and weaker protected stages are conflicts.
Conflicts require source correction or human review; they never repair state.

## Source → Ops mapping

| Source evidence | Existing Ops representation |
| --- | --- |
| Engine + stable source ID + tenant | Existing acquisition unique key; no duplicate contact/target created |
| Email / LinkedIn identity / person + company | Existing Phase 4L identity rules; source fields do not replace manual acquisition fields |
| Sent/contacted, last outbound | Waiting, engine outbound action/time |
| Scheduled stage/date | Follow-up with source cadence/date; due calculated at read time |
| Explicit due without date | Due flag retained; no invented date |
| Human reply required/question | Needs reply, source-engine reply action; pending cadence suppressed |
| Human reply answered by a later recorded outbound | Engaged; no first-contact prompt |
| Replied/engaged | Engaged |
| Automatic acknowledgement / out of office | Waiting; never a human reply |
| Bounce | Waiting relationship, delivery issue operational state, review delivery failure |
| Bad route / redirect / referral | Waiting relationship, review referral or route |
| Completed sequence / parked / nurture | Nurture |
| Meeting / converted / won / closed/lost | Existing commercial stages protected from weaker snapshots |
| Personal search demand/content/action | `personal_opportunity`, original `opportunity_type`, source/next action preserved |
| Personal partner/referrer | `partner_opportunity`; contacted/reply/follow-up evidence uses the same projection |
| Personal social/community | `social_opportunity`; replied → engaged, completed → no action due |
| Approval | Source approval evidence only; pending → reviewing where no stronger state exists |
| Capacity Check completed / signup started | Action evidence, never inferred conversion |
| Explicit signup complete / converted | Converted |

Snapshots live in `acquisition_items.engine_state` and `engine_observed_at`, not a
parallel CRM or lifecycle table. The existing lifecycle GET includes engine
provenance, source fields, operational state and human-action interpretation in
`engineEvidence`. The existing acquisition API also returns the snapshot. Existing
manual status/action/history/metadata are not overwritten. The projection uses
existing stage precedence, preserving advanced Ops evidence. Raw engine evidence
remains visible alongside a stronger manual state so discrepancies can be reviewed.
Sync does not manufacture inbox replies or Growth cadence targets. A Response
whose next action belongs to an engine snapshot cannot draft from an old event.

## Personal safety

Every Personal record must provide a source URL and:

```json
{"safety":{"public_context":true,"consumer_outreach":false,"health_targeting":false}}
```

Partners additionally require `verified_public_business:true`; social requires
`verified_direct_discussion:true` plus a recognized direct public post/discussion
URL. Profile, community homepage and search URLs do not qualify for social replies.
These flags must come from verified source evidence, never hardcoded defaults.
They are provenance assertions from the authenticated engine, not independent web
verification by Ops. Unsupported/unverified contexts are rejected for human review.
No consumer cold email/call/DM, health-based unsolicited targeting, direct-message
automation or new send permission is introduced.

## Manual exporter configuration

Set `OPS_STATE_SYNC_SECRET` to the scoped ingestion secret. Use the corresponding
checked-in configuration JSON as `OPS_STATE_SYNC_CONFIG` after resolving its
specific pending fields. A mapping with nonempty `pending` is skipped and returned
by tab name with its exact reasons; it cannot block other fully configured tabs.

### B2B: live `Leads`

Spreadsheet: `1HXba9e-_WBh8oyJ-hOykpfR993T7-RCSmxWpkX5I1Po`.

| Verified column | Exported field |
| --- | --- |
| Organisation | company and entity |
| Person | person |
| Email | state.email |
| Status | state.Status |
| followUpStage / lastFollowUpAt / nextFollowUpAt | Corresponding existing cadence fields |
| followUpCount / followUpStatus | Source count and follow-up status |
| lastInboundAt | Last inbound timestamp |
| lastOutboundAt, otherwise Sent at | Last outbound timestamp; fallback only when the first column is empty |
| discoverySource / discoveredAt | Source discovery provenance in the snapshot |

**Only pending B2B field:** the existing ingestion `source_record_id` rule and any
prefix. No stable-ID column was supplied. Email is contact identity, not an assumed
replacement source ID. `id_header` deliberately remains null until the existing
rule is verified. No row number or synthetic source ID is introduced.

### Personal: live `Partner Outreach`

Spreadsheet: `1ZfyIebRh6G8HkuJrM6cizPocd8oBh3Cu1u_Lh9M2UAM`.

| Verified column | Exported field |
| --- | --- |
| Outreach ID | id_header; exact cell value preserved, subject to confirming any existing prefix |
| Contact name / Partner / Organisation | person / company and entity |
| Email | state.email |
| Send status / Sent at | state.status / last_outbound_at |
| Reply status / Reply at | reply_state / last_inbound_at |
| Approval status | approval_state; never an Ops approval |
| Conversions | Source count only; not proof that the particular contact converted |
| Email source URL, otherwise Contact page, otherwise Website | source_url |
| Business context | evidence |
| Action ID / Queue row | Metadata action link / row locator, never identity |
| Role / Team, Website, Contact page, Email source URL, Verification, Referral link | Import provenance metadata |

Draft subject/body and Notes are not exported: they are not required for state
visibility. Import provenance metadata retains the existing first-import-wins
semantics; changing operational fields are in `state`.

**Pending Partner fields:** confirmation of the existing Outreach ID prefix (if
any), and the actual `Verification` value semantics/evidence for all required
Personal safety flags. No boolean safety columns were supplied. A populated
business context, email address, approved draft, or sent status is not substituted
for those checks. The mapping is staged but not enabled until that evidence is
available; safety enforcement is unchanged.

### Personal tabs with names verified but headers pending

| Tab | Missing mapping evidence |
| --- | --- |
| Acquisition Queue | Headers, stable ID, type/source fields, Personal safety evidence |
| Social Queue | Headers, stable ID, direct public discussion URL, Personal safety evidence |
| Search Demand | Headers, stable ID, public source/context, Personal safety evidence |
| Funnel Events | Headers, stable event/contact linkage and outcome semantics, Personal eligibility |
| Action Outputs | Headers, stable action/source linkage and state, Personal safety evidence |
| Leads | Headers, existing stable ID and public-context eligibility; no assumption of consumer outreach permission |

These are individual pending entries, not guessed schemas. Current status enum
values were not supplied for either mapped tab: strings are passed through the
existing normalizer, and unfamiliar values remain raw evidence instead of invented
transitions. Optional `id_prefix` must match any prefix already used by existing
ingestion. Dates returned by Sheets as Date objects become ISO timestamps; ambiguous
text dates are not guessed and the receiver rejects them. The adapter reads Sheets only, sends
batches of at most 25, refuses redirects, returns counts, stops on HTTP errors and
never logs secrets or record payloads. It does not access Gmail or install triggers.

## Validation

`tests/engine-state.test.mjs` exercises mapping, safety rejection, source-only
draft blocking, real migration/RPC idempotency and compare-and-swap, preservation
of manual decisions, authentication/tenant scope and the manual adapter. Existing
security, acquisition, lifecycle/reconciliation and Phase 4D suites remain in the
test command. Tests use fixtures/PGlite; no live Google or production database
verification has been performed.
