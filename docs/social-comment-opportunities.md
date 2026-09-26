# Public comment opportunities

This phase reuses official Facebook Page / Instagram comment pulls, `inbox_items`, the organisation Growth Profile, unified lifecycle and Responses briefing/drafting/manual status controls. It creates no acquisition rows, new response store, lifecycle state, migration or scheduled job. There is no wider social search or DM ingestion.

On opening a Response, the server checks official-reader provenance, exact comment ID, supported public URL, explicit question/service/partnership intent and at least two meaningful profile terms. The result carries author, platform, comment and parent context, source URL, matched terms, rule-based confidence, risk, next action and capability reason. This is conservative lexical classification, not a semantic relevance guarantee.

Only the earliest open comment in a tenant/platform/post can be an opportunity. A handled comment in that thread suppresses further suggestions. Polling uses the existing tenant/platform/external-ID unique key with ignoreDuplicates, so it cannot overwrite a handled status or saved evidence. Existing rows without the new official-reader provenance remain unverified; this phase does not backfill trust or refresh changed comment text.

Health/Personal contexts require existing engine safety evidence linked to the same lifecycle contact and exact public URL: public_context=true, consumer_outreach=false, health_targeting=false, verified_direct_discussion=true. Partnership contexts also require verified_public_business=true. Neither profile terms, source labels nor a public URL substitute for those flags. Clinical/sensitive or excluded topics remain blocked even with evidence. A missing flag disables AI suggestions; it does not manufacture a safe assertion.

AI Suggest is human-triggered and uses the existing Root coach with public-only, useful, non-salesy instructions. It rechecks lifecycle/eligibility after generation and rejects obvious unsafe drafts. The output filter is a conservative screen, not a clinical safety guarantee; human review remains mandatory. No generated text is sent automatically.

The existing hardened capability assessment is authoritative. An available reply plus operational verification can route to the existing human-triggered FB/IG reply endpoint. Today neither platform has that verification, so eligible comments show manual fallback. Missing capability, manual-by-design and safety/context review are distinct reasons. Other platform readers remain unchanged/disabled; no new approval or scopes are claimed.

Responses provides Open public conversation, existing Copy and Mark manually replied. Marking completion updates only the existing inbox status and refreshes lifecycle; it does not send. Unverified/blocked items still retain source evidence for human review but get no generated outreach. Keep all manual action on the public thread, never a DM or consumer cold approach.

No Phase 4D email, B2B workflow, Daily Growth Plan, Home, OAuth or publishing changes. Tests use mocked official integrations; no live platform replies were made.
