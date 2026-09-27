# Manual takeover and recovery

The governor reads existing lifecycle and Control Tower projections. It has no scheduler, provider dispatch, CRM tables or parallel execution state.

## Decisions

- Running: the existing source records processing or dispatch; not proof of delivery.
- Scheduled: an existing due date or source schedule; not guaranteed execution.
- Waiting: an external response or intentional human action is outstanding.
- Completed: an existing confirmed action or explicit manual receipt.
- Blocked: a recorded failure prevents progress.

Human-by-design, automation unavailable/unverified, and automation failed remain separate reasons. Credential expiry and unsupported comments are not labelled failed sends. TikTok native completion is not a publishing failure or confirmed publication.

## Takeover

Home details, Responses and Growth share one manual completion control. Open the source, review/copy prepared content, verify actual completion time and evidence, and confirm that any earlier provider attempt has been checked and cannot still deliver. This records work; it does not send it.

GET /api/operations/manual-complete previews the current tenant lifecycle. POST requires write membership, the preview revision, a stable receipt key, actual completion time, evidence and both confirmations. The service rereads lifecycle, checks current action ownership and public-comment safety, and refuses stale or inappropriate work. Unknown/in-flight Phase 4D delivery stays blocked. Personal records cannot use generic takeover to bypass source safety verification. No manual DM route is added; existing LinkedIn connection follow-through stays explicitly human-operated.

The transaction locks the existing tenant lifecycle revision and target row. It records the actor, action time, evidence, actual content and prior receipts on inbox_items/growth_targets. Inbox history also uses response_item_events. Existing cadence computes Growth progression/dates. Existing lifecycle reconciliation runs after the receipt; partial reconciliation is reported explicitly and is safe to retry.

## Recovery boundaries

- Same receipt key, including a key from prior cadence history, is a no-op even after a lost response.
- Changed lifecycle revision requires a fresh preview; inbound replies and advanced stages prevent stale outreach completion.
- Inbox receipts preserve handled status and cancel stale pending follow-up on older writes; Growth rejects unreceipted stage changes except parking.
- A Phase 4D dispatch reservation cannot be created/reset after a manual receipt. Already reserved, accepted or uncertain delivery cannot be manually completed. Approval payloads and provider dispatch code are unchanged.
- Comment readers already preserve handled records; current capability checks remain in the existing reply path. No currently unverified reply adapter is enabled.
- Stronger relationship evidence remains authoritative; Home shows differing source/lifecycle evidence for review. No source identity or ingestion safety rule changes.
- Legacy unversioned Mark Sent / Mark Replied requests now ask the user to use the receipt control. They cannot silently advance a second action.

Ops does not cancel or control an independent Google engine job or a provider request already outside its database. An operator must verify/cancel that source delivery before manual takeover. This phase does not claim distributed exactly-once sending or enable automated retries. Acquisition source actions, provider connection repair and native publishing retain their existing workflows; they cannot be falsely marked delivered through this endpoint.

## Rollout

Apply 20260926100000_manual_completion_recovery.sql before deploying the UI/API. It adds two JSONB evidence columns, one service-only receipt RPC and recovery triggers on existing tables; no new operational store. The migration has only been exercised locally, not applied to production. Until it is applied, takeover fails closed. No cron, OAuth, provider review or B2B engine changes.
