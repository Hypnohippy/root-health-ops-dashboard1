# Phase 4C: Actionable Acquisition Queue

Phase 4C turns imported acquisition items into a human-controlled routing queue. It records decisions and opens an existing Ops workspace; it never sends email, publishes content, posts a reply, calls an AI model, or writes back to Google Sheets.

## Deployment

Apply `supabase/migrations/20260924100000_actionable_acquisition_queue.sql` after the Phase 4A acquisition migration. No new environment variables are required. The migration:

- expands item status to `new`, `reviewing`, `accepted`, `actioned`, `engaged`, `converted`, `nurture`, `lost`, and `dismissed`;
- adds `current_action`, `actioned_at`, `outcome`, `outcome_at`, `owner_user_id`, and `updated_at` to `acquisition_items`;
- creates append-only `acquisition_item_events` with actor, transition, outcome, note, timestamp, and idempotency key;
- adds an atomic service-role function which locks the tenant-owned item, checks the expected status, updates the summary fields, and appends one event;
- revokes direct anon/authenticated access to the event table and RPC.

The RPC is an internal transaction boundary. Browser requests cannot call it directly. The server route first verifies an authenticated owner/admin/manager membership for the explicit organisation, then selects the item by both item ID and organisation ID. The existing ingestion secret is not an authenticated browser session and cannot mutate actions.

## Routes and workflow

`GET /api/growth/acquisition?organisationId=<uuid>` continues to provide the paginated queue and now includes audit history. Reads still use the existing membership helper and explicit organisation selection.

`POST /api/growth/acquisition/:id/action` accepts `organisationId`, `action`, a UUID `idempotencyKey`, and optional `note`/`outcome`. It enforces the record-type action matrix and state machine before calling the atomic RPC. Stale concurrent actions return 409. Retrying the same item and idempotency key returns the existing result without another event.

Routing destinations preserve `organisationId` and add `acquisitionItemId` for traceability:

| Opportunity | Review actions and destination |
| --- | --- |
| B2B lead | Accept/dismiss; prepare or open outreach at `/dashboard/growth/pipeline`; nurture; mark engaged/converted/lost. |
| Personal | Accept/dismiss; create draft at `/dashboard/brainstorm`; open Campaign Studio at `/dashboard/campaigns/new`; open Publishing at `/dashboard`; mark actioned or outcome. |
| Partner | Accept/dismiss; display and copy prepared outreach from metadata; open the existing outreach pipeline; nurture; mark outcome. |
| Social | Accept/dismiss; display and copy prepared draft; create a draft in Brainstorm; open Publishing or Responses for manual review; mark actioned or outcome. |

The destination pages retain their existing behaviour. Queue routing does not invoke their APIs. Prepared text is shown and can be copied when metadata contains `prepared_outreach`, `outreach_draft`, `prepared_draft`, `content_draft`, `reply_draft`, or `draft`. Responses remains responsible for deciding whether a public reply is supported and for requiring a deliberate send action.

## State rules

New items can enter review, be accepted, or be dismissed. Preparation/routing actions require reviewing, accepted, or nurture state and move the item to actioned. Engagement requires actioned/nurture. Conversion requires actioned/engaged/nurture. Nurture remains resumable; converted, lost, and dismissed are terminal. Every successful change records the actor and previous/new status.

## Validation

Tests execute the real state planner, action handler, and both acquisition migrations in PGlite. They cover every record type, destinations, forbidden type/action combinations, allowed and terminal transitions, write-role enforcement, anonymous/ingestion-secret rejection, tenant-scoped lookup, cross-tenant RPC rejection, stale writes, idempotent retries, append-only events, direct browser-role denial, prepared metadata display, and absence of publish/reply/send API calls from the queue.

The production migration is not applied by this PR. After deployment, verify one item of each type through accept, route, and outcome flows. Existing publishing, Responses, Quick Blast, scheduling, Connect, social accounts, Growth Profile, ingestion, and Google Apps Script engines are unchanged.
