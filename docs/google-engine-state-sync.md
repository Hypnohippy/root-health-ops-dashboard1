# Google engine operational state

This adds a visibility-only receiver for Root Health Lead Engine (`root_health_b2b`)
and Root Health Personal Lead Engine - BUILD (`root_health_personal`). It does not
change their workflows, write back to Sheets, send messages, approve drafts, run
reconciliation or register triggers. Home is unchanged.

## Deployment boundary

The current engine source and live sheet schemas are not in this repository and
were not available for verification. The receiver and optional manual exporter
are implemented and tested with fixtures. Neither engine has been connected live
by this change. Do not treat the example mappings below as verified live headers
(except the B2B headers explicitly supplied for this task).

1. Apply `supabase/migrations/20260925100000_acquisition_engine_state.sql` and deploy Ops.
2. Reuse the existing server-only `GROWTH_INGESTION_KEYS` configuration with the
   correct organisation and source engine scope. No default tenant is selected.
3. Verify the existing source IDs, actual sheet headers, classifications and safety
   evidence in each engine. Preserve existing acquisition source IDs exactly;
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

Set `OPS_STATE_SYNC_SECRET` to the scoped ingestion secret. Example
`OPS_STATE_SYNC_CONFIG` (replace sheet/header placeholders after source inspection):

```json
{
  "organisation_id":"78fa2ac8-e7b6-4b9b-9604-035723ece6b1",
  "source_engine":"root_health_b2b",
  "spreadsheet_id":"VERIFIED_SPREADSHEET_ID",
  "sheets":[{
    "name":"VERIFIED_TAB_NAME",
    "id_header":"VERIFIED_STABLE_ID_HEADER",
    "record_type":"b2b_lead",
    "fields":{"person":"VERIFIED_PERSON_HEADER","company":"VERIFIED_COMPANY_HEADER"},
    "state":{"Status":"Status","followUpStage":"followUpStage","lastFollowUpAt":"lastFollowUpAt","nextFollowUpAt":"nextFollowUpAt","followUpStatus":"followUpStatus","lastInboundAt":"lastInboundAt","lastOutboundAt":"lastOutboundAt","email":"VERIFIED_EMAIL_HEADER"}
  }]
}
```

Personal mappings use their matching record type and explicit `safety` header
mapping, e.g. `"safety":{"public_context":"VERIFIED_PUBLIC_CONTEXT_HEADER",...}`.
Map source URLs in `fields.source_url`. Mappings are deliberately explicit because
Personal's live schema has not been verified. Optional `id_prefix` must match any
prefix already used by existing ingestion. The adapter reads Sheets only, sends
batches of at most 25, refuses redirects, returns counts, stops on HTTP errors and
never logs secrets or record payloads. It does not access Gmail or install triggers.

## Validation

`tests/engine-state.test.mjs` exercises mapping, safety rejection, source-only
draft blocking, real migration/RPC idempotency and compare-and-swap, preservation
of manual decisions, authentication/tenant scope and the manual adapter. Existing
security, acquisition, lifecycle/reconciliation and Phase 4D suites remain in the
test command. Tests use fixtures/PGlite; no live Google or production database
verification has been performed.
