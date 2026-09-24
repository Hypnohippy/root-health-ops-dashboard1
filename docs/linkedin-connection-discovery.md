# LinkedIn accepted-connection discovery architecture

## Safe boundary for this phase

`lib/linkedinConnectionDiscovery.ts` parses representative LinkedIn invitation-acceptance email HTML, extracts only the accepted contact and the explicit “Suggestions from … network” section, removes duplicate profiles, scores candidates against organisation buyer context, creates deterministic source IDs and prepares a review-only opener. It makes no network calls and cannot send a LinkedIn message.

Automatic Gmail intake is intentionally not attached to the Phase 4D inbound-reply endpoint. Invitation notifications are discovery events rather than replies, and mixing them would risk reply classification and delivery state. The safest integration point is a dedicated, secret-authenticated endpoint such as `/api/growth/linkedin-connections/ingest`, called by the existing B2B Gmail engine after it detects a LinkedIn invitation sender and `accepted your invitation` subject.

## Intended automated pipeline

1. The Gmail engine reads the notification and sends its Gmail message ID, subject, sender and HTML to the dedicated endpoint.
2. Ops parses the accepted contact and explicit network suggestions. Footer, promotional, unsubscribe and help content is excluded.
3. Ops loads the organisation generation profile and applies its audience, geography, priority-service and customer-problem context. Senior People/HR/L&D/wellbeing/care and commercial leadership roles are also recognised.
4. Before insertion, the intake service collects canonical LinkedIn profile URLs and stable source IDs from `acquisition_items`, known B2B lead identities supplied by the engine, prior email/action metadata and any stored known-connection data. The pure dedupe helper accepts those sets; integrations must fail closed if cross-source checks cannot be performed.
5. Relevant suggestions become `personal_opportunity` acquisition records with source engine `linkedin_connection_network`, a deterministic source record ID based on accepted and suggested profile URLs, human-readable evidence and provenance metadata including Gmail message ID and discovery time.
6. The accepted contact becomes a review item with their profile URL, direct Message URL when supplied by LinkedIn and an editable draft. Acquisition presents Copy and Open LinkedIn actions. No API send is claimed or attempted.

## Acquisition metadata contract

Suggested candidates retain `source_type`, `accepted_connection_name`, `accepted_profile_url`, `suggested_person_name`, `headline`, `company`, `profile_url`, `mutual_connection_count`, `source_gmail_message_id` and `discovered_at`. Evidence should read like: `Suggested via Nick Fahy → Alison Anderson, Chief People Officer → 1 mutual connection`.

## Owner intervention

No owner action is needed for the parser, qualification or deterministic dedupe foundation. Wiring the Gmail engine requires deploying a small detection/forwarding change in the existing Apps Script and configuring the dedicated endpoint secret in Script Properties and Vercel. The code should be completed before asking for the one provider-side deployment action; secrets must be entered directly in those settings and never pasted into chat.
