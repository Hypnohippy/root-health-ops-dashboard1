# Phase 4G Gmail acceptance worker

The existing B2B Apps Script now contains `runLinkedInAcceptanceIntake_`. It is deliberately separate from `doPost(e)`, Phase 4D sending and inbound reply classification.

The worker searches recent LinkedIn invitation mail for individual `accepted your invitation` notifications and accepted-invitation digests whose body confirms `You have X new connections`. It validates the sender and structure again, then posts the original HTML plus Gmail message identity to `/api/growth/linkedin-connections/ingest`. Ops parses every accepted person, keeps suggestion sections separate, and applies tenant-scoped person-level deduplication. The regular worker may label successfully processed threads, but correctness never depends on that label.

Run `backfillLinkedInAcceptanceLast30Days_()` once after deployment to scan up to 200 matching threads from the last 30 days. It deliberately includes previously labelled mail because older runs may have only imported the first person in a digest. Repeating it is safe: Ops deduplicates each accepted person by canonical LinkedIn identity.

It reuses `OPS_ORGANISATION_ID` and `OPS_INGESTION_SECRET`; no new secret is introduced. `root_health_b2b` must remain in that organisation's `GROWTH_INGESTION_KEYS.source_engines` list in Ops.

## Duplicate investigation (2026-09-28)

The execution totals alone do not establish that new people were incorrectly suppressed. The regular worker scans all matching threads in the last 14 days (up to 50), including labelled threads, then every qualifying message in those threads. A digest can contain multiple people, and the same person can appear in several messages. Consequently 28 duplicate candidates across 13 threads is possible without a defect; these are candidate occurrences, not 28 distinct people.

Acceptance preflight dedupe matches either `inbox_items.linkedin_identity` or the canonical `permalink` of an existing LinkedIn `connection_accepted` row in the organisation. Canonicalisation removes tracking query/fragment, normalises case and `www`, maps `/comm/in/` to `/in/`, and removes a trailing slash. Name, company, subject, Gmail thread/message identity, acquisition items and growth targets do not determine acceptance duplicates. Targets and acquisition records only filter network suggestions. An existing acceptance intentionally blocks later notifications for the same profile regardless of response status.

The database unique index covers `(organisation_id, linkedin_identity)` across all inbox kinds. A row of another kind can therefore cause an insert to be ignored even though it was not included in the preflight read. A legacy row with a wrong stored identity or permalink can also block the wrong person. Neither condition has been established in production; do not change the index or remove rows without examining the matching records.

Deploy the API and updated Apps Script, then temporarily set Script Property `OPS_LINKEDIN_INTAKE_DIAGNOSTICS` to `true` and run the existing intake. Each skipped candidate is logged with Gmail message ID, candidate name, canonical identity, matched record ID/type, exact matching rule, stored identity and canonical permalink. The API includes these fields only for authenticated requests with `diagnostics: true`. Database conflicts are looked up within the same organisation, including rows outside the acceptance kind and concurrent inserts. A disappeared blocker is explicitly reported as unresolved. This is the normal ingestion run with diagnostics enabled, not a dry run; it can import new records. Disable the property after collecting evidence. Logs contain contact names and identities, but no message bodies or credentials.

Live verification is still required: this checkout has no deployment credentials or Gmail/Apps Script connection. Compare a known missing contact's original notification with the candidate diagnostics and blocking row before selecting a dedupe fix. The parser for individual notices chooses the first labelled profile link, so also verify that this link actually belongs to the person named in the subject.

### One-run activation and reading

1. Deploy the Ops API from this PR. Update the existing B2B Apps Script with the diagnostic additions to `processLinkedInAcceptanceIntake_` and `sendLinkedInAcceptanceToOps_`, then save the project. Do not install another trigger. These editor-run/time-trigger functions use saved project code; no web-app deployment change is needed for this diagnostic.
2. In Apps Script, open Project Settings > Script properties. Add `OPS_LINKEDIN_INTAKE_DIAGNOSTICS` with the exact value `true`. Keep the existing organisation ID and ingestion secret.
3. In the editor, select `runLinkedInAcceptanceIntake_` and click Run once. This runs the existing intake and can import genuinely new acceptances. It does not send messages.
4. Open Executions, select that invocation, and read its logs. Each skipped acceptance has a `LINKEDIN ACCEPTANCE DUPLICATE:` JSON line. `gmailMessageId` ties the candidate to the source email. `candidateName` and `canonicalIdentity` identify the candidate; `matchedRecordId` and `matchedRecordType` identify the blocker. `storedIdentity` and `canonicalPermalink` show the existing row's two possible identity sources.
5. Read `reason`: `existing_acceptance_linkedin_identity` means the stored identity matched; `existing_acceptance_permalink` means the canonical existing permalink matched; `database_linkedin_identity_conflict` means the unique index blocked the insert (including concurrent inserts and other record kinds). `database_conflict_record_no_longer_visible` explicitly means the blocker could not be resolved after the insert; its ID/type are `unresolved`.
6. Remove the diagnostic property or set it to `false` after collecting the run. A scheduled run during this interval also logs diagnostics. Do not change the existing trigger schedule.

Example log (synthetic):

```json
{"gmailMessageId":"message-123","candidateName":"Alex Smith","canonicalIdentity":"linkedin.com/in/alex-smith","matchedRecordId":"existing-row-uuid","matchedRecordType":"linkedin/connection_accepted","reason":"existing_acceptance_linkedin_identity","storedIdentity":"linkedin.com/in/alex-smith","canonicalPermalink":"linkedin.com/in/alex-smith"}
```

The existing summary still reports the duplicate count. If it is nonzero but candidate lines are absent, verify both the API deployment and the saved Apps Script additions/property before drawing conclusions. Do not paste the ingestion secret or full email HTML into logs or issue reports.

Run `testLinkedInAcceptanceIntakeSafe_()` before deployment. It does not access Gmail or make HTTP calls. After deploying the updated script, create one time-driven trigger for `runLinkedInAcceptanceIntake_`; every 10–15 minutes is appropriate. This provider-owned trigger creation is the only manual deployment step.
