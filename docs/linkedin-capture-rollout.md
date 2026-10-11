# LinkedIn capture (separate draft PR)

No schema migration, live trigger change, invitation sending, LinkedIn scraping or Production capture/import was performed for this PR. Existing Personal discovery, Commercial, Founder Intelligence, partner dispatch and LinkedIn messaging/cadence stay intact.

## Acceptance audit, 11 October 2026

A read-only Gmail inspection found ten acceptance digests in the last 30 days. They advertise 43 connections but actually expose 41 named profile links. All 41 have a separate `inbox_items` `connection_accepted` record in the selected Ops organisation. The two missing names/profile links are absent from the emails themselves, not demonstrable Ops ingestion misses. A per-person report retains canonical public profiles, existing record IDs and states; no messages or tracking credentials are reproduced here.

The existing acceptance endpoint already iterates all `acceptedConnections` and uses the tenant/profile unique index. The defence changes recognise formatted digest body evidence without requiring a particular subject or Message link, and reject spoof sender domains and non-profile URLs. No historical records are rewritten.

## Recommendation intake

Install the reviewed `docs/linkedin-recommendation-intake.gs` into the EXISTING Corporate/B2B Gmail Apps Script alongside the updated acceptance section in `docs/b2b-phase4d-apps-script.gs`, only after this Ops PR is deployed. Do not replace the engine or its unrelated code. The existing `runLinkedInAcceptanceIntake_` timer calls the additional recommendation scan; no new trigger is necessary. This module is not yet installed live.

It reads bounded recent LinkedIn recommendation emails, sends exact message provenance through the existing tenant-scoped ingestion credential, and uses `/api/growth/linkedin-connections/recommendations`. Recommendations are qualified with the existing buyer/organisation targeting and deduped against Acquisition, growth targets and LinkedIn inbox identities. A digest with acceptance evidence always stays in Responses. Recommendations do not assert acceptance, consumer-health inference or private-contact permission.

Acquisition offers a `LinkedIn Connection Opportunities` link and cards with Open profile, editable Draft connection note, Copy current note, Save for later and Dismiss. All external invitation sending is manual. An accepted recommendation projects a link to the existing Responses record and stops offering another invitation; the original opportunity/Gmail history remains intact. This is a read-only transition, not a second contact/lifecycle system.

## iPhone Shortcut: Send to Root Ops

Use the signed-in Safari session rather than storing any shared ingestion or service-role secret on the phone. No new server environment variable or credential is needed.

Create an Apple Shortcut named **Send to Root Ops**:

1. Enable **Show in Share Sheet** and accept URLs.
2. **Get URLs from Shortcut Input**; choose the LinkedIn profile URL. Do not scrape or fetch LinkedIn.
3. **Current Date** → **Format Date** (ISO 8601).
4. URL-encode the profile URL and timestamp separately.
5. Construct `https://roothealthops.com/linkedin-capture?profile_url=[encoded URL]&captured_at=[encoded ISO date]&source=manual_iphone_share&organisationId=[your organisation UUID]`.
6. **Open URLs** in Safari. Ops retains the input across its sign-in link.
7. Confirm **I confirm this person accepted my LinkedIn connection**, then **Save accepted connection**. Name is optional.

The final same-origin POST to `/api/growth/linkedin-connections/capture` requires the existing signed-in tenant write role. A shared URL alone never proves acceptance. It records actor, manual/iPhone source, capture and confirmation time, and canonical profile; it never records an outbound send. The existing person-level unique index handles Gmail/manual retries and races without overwriting existing evidence. A conflicting conversation kind fails closed for review. The Shortcut intentionally does not issue an unauthenticated/background bearer POST.

The Shortcut must be installed on the user's iPhone; an actual device Share Sheet test is still required. No LinkedIn API approval is needed for this manual capture. Connected-account reads or invitation sending are not implemented or claimed.

## Controlled verification after review

Keep both PRs draft. Inspect the Preview capture page and recommendations link without submitting new records. Offline tests exercise writes/retries against isolated memory fixtures. For a later authorised live capture, use one genuinely missing accepted profile, confirm it appears once, then share again and confirm the original record is returned. Do not replay the already captured 41 people or run a broad Production backfill. Nothing externally sends or publishes.

PR #55 is independent: its ONS Audience Intelligence delivery and generated brief binding are complete at `8634414a6953ffc2eb41061ba172ed0cf01fdf7f`. This LinkedIn PR is based on current main and must preserve that work when integrated.
