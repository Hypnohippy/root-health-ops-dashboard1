# LinkedIn human reply notifications

## Evidence and rollout boundary

The existing acceptance timer reads invitations senders/acceptance subjects; the recommendation parser reads named recommendation patterns. Messaging-digest notifications are outside both paths. Ordinary Gmail email replies require In-Reply-To and remain email-thread scoped.

This branch adds a separate scoped notification endpoint. It requires the messaging-digest sender, single-person message subject, explicit new-message notice, exactly one canonical profile and a direct LinkedIn messaging thread. It never resolves redirects, scrapes LinkedIn or records invented message content/sentiment.

The existing unique inbox relationship is reused. Append-only raw notification receipts retain Gmail message ID, receipt timestamp, canonical profile and token-free messaging URL. Original acceptance/raw evidence, manual_completion, contacted_at, outbound timestamps, kind and content stay intact. Compare-and-swap protects concurrent receipt/state changes. Replays dedupe and can repair a partially failed target cadence stop.

Production receipt-preservation triggers intentionally retain old send state. The read-only projection independently makes the new notification Needs reply, while the active-conversation flag suspends silent cadence. Actual inbound text or an inbound-confirmed snapshot logged after the notification enables drafting. Logging alone does not resolve attention. Explicit human handling records actor/evidence and clears attention without claiming an outbound send or positive sentiment. A subsequent new notification reopens attention. Stronger closed/meeting/nurture states remain authoritative.

## Attention beacon

Existing /api/home/attention supplies tenant-scoped verified current human-reply counts and exact Responses owner links. Red is reserved for unresolved human replies, excluding acceptance, ordinary follow-ups, automated acknowledgements, delivery failures and invitations. Gmail replies use exact thread-local ownership. Navigation and the existing Responses refresh path refresh counts; no polling timer is added.

## Deferred Apps Script delta

After Ops Production is deployed and separately authorised:
1. Add docs/linkedin-message-notification-intake.gs to the existing B2B Gmail Apps Script project.
2. Add only the documented guarded call to runLinkedInMessageNotificationIntake inside existing runLinkedInAcceptanceIntake_ before returning acceptances.
3. Reuse OPS_ORGANISATION_ID and OPS_INGESTION_SECRET. No new secret, trigger, label or deployment is required. The existing Head timer executes saved code.
4. Acceptance and recommendation queries/parsers/caps remain unchanged.

Do not save Apps Script Head before the Ops endpoint is ready. No worker has been installed or run by this PR.

## Read-only Preview rehearsal

/dashboard/responses/linkedin/notification-rehearsal accepts a token-free excerpt of real notification evidence. Its authenticated API is enabled only when VERCEL_ENV=preview, uses read-only access, projects onto the existing relationship in memory and returns lifecycle/attention results. It never ingests, saves or sends. The selected record can be inspected in ordinary Responses separately; it remains unchanged until authorised intake.

Debbie audit references: Gmail notification 1a13062900c62444; canonical linkedin.com/in/debbie-bartlett-172523a8; existing inbox f2077f8a-ba37-4f4d-af34-3c59eeb5c590; target 311c84dc-8cdd-4f27-ac61-1560e928aec9. Rehearsal timestamps taken from the Gmail display have minute precision; the live worker will use Gmail getDate() exactly.

No migration, Production write, outbound action, live worker save or PR #58 change is included.


## Aggregate message digests (local implementation; not activated)

Recognised aggregate subjects such as `Nina and Tracy sent new messages` are
included alongside `just messaged you`, with the existing verified sender,
14-day search window, 50-thread cap and guarded timer invocation unchanged.
Ops validates the envelope and then accepts only self-contained structural
message rows/cards containing one canonical profile and one associated direct
LinkedIn thread labelled `View message`. It never derives identity from subject
names or pairs global links by order. Unsupported/unbalanced HTML, split pairs,
multiple identities/threads and shared threads across identities fail closed.
Valid independent blocks can succeed despite another invalid or unknown block.

Evidence remains append-only in the existing relationship, with Gmail ID stored
separately and a deterministic event key formed from Gmail ID, canonical identity
and canonical thread URL. Legacy receipts without a key are compared using those
same fields. Per-event outcomes and partial-failure HTTP 503 responses permit
safe replay, including repair of a previously saved inbox event whose target
cadence suspension failed. No relationship is created for an unknown identity.
Manual disposition uses the event key; old Gmail-only IDs remain accepted only
when they identify exactly one event on that relationship.

The current Needs reply projection, attention beacon, conversation destination
and actual-text drafting guard are reused. Acceptance and manual-send receipts
and stronger lifecycle states are preserved. No schema, trigger or configuration
change is required. Deploy Ops before separately authorising the documented
Apps Script Head update. No live worker update is part of this local work.

LinkedIn mobile push notifications without a corresponding Gmail notification
cannot currently be ingested.
