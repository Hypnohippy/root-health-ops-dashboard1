# Personal Signals inside Acquisition

This is an additive card/workflow in /dashboard/growth/acquisition. No new page, navigation, table, importer or lifecycle subsystem is introduced. Normal records retain the existing cards/actions; Partner/referrer and LinkedIn code remain unchanged. Personal filtering also includes social_opportunity records from root_health_personal; other filters retain their original semantics.

## Qualification and presentation

Require root_health_personal, a stable source_record_id, personal_opportunity or social_opportunity, an HTTPS direct discussion URL on a supported platform, actual metadata.original_post (or existing metadata.post_text), Root-relevant wellbeing context and explicit engine_safety booleans: public_context=true, consumer_outreach=false, health_targeting=false, verified_direct_discussion=true. Search Demand, article/blog and Partner/referrer provenance cannot qualify. Evidence/reason is context, never substituted for the original post. Preserve exact post and prepared response text. prepared_reply is preferred, then reply_draft (prepared_draft only when explicitly labelled draft_kind=public_reply); existing public-reply safety validation suppresses unsafe drafts. There is no generation, send, publication, private outreach or external scraping in this feature.

Copy response and Open post & copy only access clipboard/navigation. The existing LinkedIn popup-safe helper opens synchronously and copies even when popups fail. Visible fallbacks permit manual copying/opening. They never call an action endpoint.

## Manual funnel and audit

Found -> Responded -> Engaged -> Capacity Check -> Signup -> Subscriber. The user must explicitly confirm before each step. Use existing acquisition statuses: actioned, engaged, converted. Capacity Check and Signup remain named events at engaged status. Existing acquisition_item_events stores actor, previous/new status, outcome, note, timestamp and idempotency key. API tenant membership/write authorization and item scoping are unchanged. Milestones must follow their prerequisites; retries reuse receipt keys. Dismiss uses the current handler.

## Unapplied additive migration

20261009170000_personal_signal_acquisition_actions.sql updates only the existing apply_acquisition_action RPC. Its current rule rejects every non-handoff transition to actioned, so an explicit Responded exception is required. The new branch is limited to named Personal Signal actions on safety-qualified Personal records; all original actions/handoff behaviour remain unchanged. The row lock also prevents duplicate named milestones and checks prerequisites atomically. No new schema/table is introduced. This migration is tested in local PGlite only and has NOT been applied remotely. Before rollout, review and separately authorise the migration. Until it is applied, Responded is rejected clearly with no funnel change.

## Social Queue export wiring and live activation

The Personal config now enables **Social Queue only** using the six explicit source/safety headers confirmed by the user. Social ID remains the exact identity; Context / Question remains context, never source text. All other Personal queues retain their pending configuration. No B2B mapping changes.

The exporter skips legacy/unverified Social rows before stable-ID and safety conversion. It requires a supported direct HTTPS discussion URL, populated Original Post and Prepared Reply, and all four explicit boolean safety values. It does not fetch URLs, resolve Google/Vertex redirects, infer safety from labels, or modify source rows. Skipped row counts are returned without text or identity data. Existing mode provenance exclusions also apply.

To activate the live wiring, update the existing bound exporter file and its `OPS_STATE_SYNC_CONFIG` Script Property with these repository versions, preserving the existing secret. If the bound script owns Social Queue discovery, update that existing writer to populate Original Post, Prepared Reply and the four explicit safety columns from verified SOCIAL_CONTEXT evidence; do not create another writer or engine. Live writer inspection and a genuine newly discovered record are still required to verify the complete Google → Ops path. Repository fixture tests do not count as live discovery evidence.

The Personal acquisition action migration remains subject to separate authorisation; this wiring change applies no migration and sends no messages.

Live inspection on 10 October 2026 confirmed all six new Social Queue headers. The Apps Script project opened from this spreadsheet's Extensions menu (`1ZgPmWuQxhrOWqhyYNhQu5OhblErC4tvSz9sbpKlEIdc0-dPLAdnP1Tkz`) contains Code.gs (Gmail Lead Engine), Untitled.gs (consent code), and AiConsent.html, with no Social Queue writer or Ops exporter found in the two script files. That project was not modified. The actual existing Social writer/exporter project must be identified before activation or a live end-to-end claim. Inspected legacy Social rows contained Vertex grounding redirects and lacked original-post/reply evidence; they were neither exported nor repaired into test records.

Once the existing writer/exporter is identified, verify a genuinely new direct public discussion record through the existing tenant-scoped engine-state endpoint and PR Preview Acquisition Personal filter. Inspect exact original text and prepared response; Copy/Open must not create events. Milestone write testing still requires separate migration authorisation and explicit external-action confirmation. Capacity Check/signup/subscription milestones remain manual confirmations, not automatic attribution.
