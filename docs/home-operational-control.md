# Home operational control

Home is a read-only presentation of the existing Phase 4L contact lifecycle, scheduled publishing records and saved connection health. It adds no persisted state, sending, reconciliation, cron or migration.

| Group | Evidence and interpretation |
| --- | --- |
| Done / recently handled | Latest qualifying completed action or captured LinkedIn acceptance per contact within seven days; confirmed recent published posts. This is a receipt count, not a total of every historical send. |
| In hand / scheduled | Waiting, acknowledgements, future manual cadence, parked nurture, approved dispatch awaiting delivery acknowledgement, explicit engine processing or scheduled cadence, queued publishing. A schedule is recorded intent, not proof of execution. |
| Needs human | Review/qualification, first manual outreach, genuine reply, warm conversation, meeting, due manual follow-up/nurture, content approval. Human involvement is by design. |
| Blocked / fallback | Current delivery failure/bounce/redirect, failed publishing including partial results, or expired/reconnection-required saved accounts. Distinct from intentional human work. |

Current work is deduplicated through the shared lifecycle identity and precedence. Advanced/closed relationships do not acquire stale outreach tasks. A current bounced closed email remains a delivery issue for review, not permission to resume outreach. Recent receipts can overlap current work; the four numbers must not be summed into a people total.

Each summary opens its exact records on Home. Details expose the source, current stage, last action, recorded work, reason, next step/date, owner, prepared preview and evidence. Failed steps show intended/completed/remaining work and link to the existing manual workflow; already successful platforms must not be repeated. No Home button sends or marks completion.

Existing workspace cards remain available in a collapsed section. Record links retain the verified tenant and focus the actual record in Responses, Acquisition, Approvals or Growth. Connections open the tenant's existing Connect workflow. List APIs retain tenant authorization before applying optional record filters.

All input reads are tenant-scoped and paginated; failed reads produce an unavailable state instead of zero counts. Raw provider errors and credentials are excluded from the Home payload. There is no new provider uptime/credit probe, no assertion that nurture is actively monitored, and no reconciliation count without an existing persisted audit receipt. Engine snapshots can be stale; their observed timestamps are visible in evidence.

Record labels distinguish running, scheduled, waiting, completed, blocked and human action required. These are read-only display classifications: running requires a recorded dispatching/publishing/processing state, and source timestamps remain visible; no live execution monitor is implied.
