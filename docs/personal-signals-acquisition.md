# Personal Signals inside Acquisition

This is an additive card/workflow in /dashboard/growth/acquisition. No new page, navigation, table, importer or lifecycle subsystem is introduced. Normal records retain the existing cards/actions; Partner/referrer and LinkedIn code remain unchanged. Personal filtering also includes social_opportunity records from root_health_personal; other filters retain their original semantics.

## Qualification and presentation

Require root_health_personal, a stable source_record_id, personal_opportunity or social_opportunity, an HTTPS direct discussion URL on a supported platform, actual metadata.original_post (or existing metadata.post_text), Root-relevant wellbeing context and explicit engine_safety booleans: public_context=true, consumer_outreach=false, health_targeting=false, verified_direct_discussion=true. Search Demand, article/blog and Partner/referrer provenance cannot qualify. Evidence/reason is context, never substituted for the original post. Preserve exact post and prepared response text. prepared_reply is preferred, then reply_draft/prepared_draft; existing public-reply safety validation suppresses unsafe drafts. There is no generation, send, publication, private outreach or external scraping in this feature.

Copy response and Open post & copy only access clipboard/navigation. The existing LinkedIn popup-safe helper opens synchronously and copies even when popups fail. Visible fallbacks permit manual copying/opening. They never call an action endpoint.

## Manual funnel and audit

Found -> Responded -> Engaged -> Capacity Check -> Signup -> Subscriber. The user must explicitly confirm before each step. Use existing acquisition statuses: actioned, engaged, converted. Capacity Check and Signup remain named events at engaged status. Existing acquisition_item_events stores actor, previous/new status, outcome, note, timestamp and idempotency key. API tenant membership/write authorization and item scoping are unchanged. Milestones must follow their prerequisites; retries reuse receipt keys. Dismiss uses the current handler.

## Unapplied additive migration

20261009170000_personal_signal_acquisition_actions.sql updates only the existing apply_acquisition_action RPC. Its current rule rejects every non-handoff transition to actioned, so an explicit Responded exception is required. The new branch is limited to named Personal Signal actions on safety-qualified Personal records; all original actions/handoff behaviour remain unchanged. The row lock also prevents duplicate named milestones and checks prerequisites atomically. No new schema/table is introduced. This migration is tested in local PGlite only and has NOT been applied remotely. Before rollout, review and separately authorise the migration. Until it is applied, Responded is rejected clearly with no funnel change.

## Remaining Google engine wiring (not performed)

The existing docs/google-engine-state-personal.config.json marks Social Queue and Action Outputs pending; the exporter deliberately skips pending sheets. Social Queue already has verified Social ID, Source URL, Context / Question, Theme and Platform header mappings. Its metadata currently lacks the actual original post and prepared public reply, and its safety mapping is empty. REACTIVE mode, approval state or risk level must never substitute for public provenance.

1. Identify the genuine source-post text and prepared public-response columns in the existing Personal engine; map them as metadata.original_post and metadata.prepared_reply. If those exact fields are already safely stored elsewhere, map that canonical text rather than duplicating/fabricating it. Do not label Context / Question research as the original post.
2. Retain the verified stable Social ID -> source_record_id and direct Source URL -> source_url. Platform can remain state.channel; the card independently checks the destination URL against the supported platform's direct-discussion structure. Preserve Theme -> signal and Context / Question -> evidence, with reason for relevance where available.
3. Supply and map real, explicitly verified boolean columns for public_context, consumer_outreach, health_targeting and verified_direct_discussion. Required values are true, false, false, true respectively. Keep unsupported/private/unverified rows excluded; no defaulting booleans based on REVIEW/REACTIVE or a health keyword.
4. Remove the Social Queue pending marker only after source fields and safety evidence are genuinely verified. Use social_opportunity/root_health_personal through the existing tenant-scoped /api/growth/engine-state exporter. The receiver already retains the metadata and overwrites engine_safety from validated raw safety. No importer change is needed.
5. Keep Search Demand research-only and all Partner mappings/workflows untouched. Action Outputs must remain pending unless its exact source text, individual lane, stable ID and all provenance are verified; do not import partner or generic content as Personal Signals.
6. Run a separately authorised ingestion with a real public source record, then select Personal in Acquisition and inspect Context / Original post / AI response. Copy/Open must not create an event. Only after separately authorising the migration and actual external reply should Responded and later milestones be live-tested. First-party Capacity Check/signup/subscription attribution is not wired; all milestones here are manual explicit confirmations.

No Production database writes, migrations or live replies were performed in this implementation. A green Preview is not evidence of real Personal-engine ingestion or successful live milestone writes.
