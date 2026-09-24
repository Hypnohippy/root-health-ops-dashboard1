# Root Health Ops dashboard inventory and information architecture

This inventory records the dashboard roles after Phase 4G. It deliberately keeps the three operational records separate: Acquisition owns discovery and approval, Responses owns inbound activity and reply decisions, and `growth_targets` owns the outreach cadence and pipeline.

| Route | Current role | Primary data | Navigation decision |
| --- | --- | --- | --- |
| `/dashboard` | Today command centre with live work counts | acquisition, inbox, growth targets, scheduled posts, connections | Home |
| `/dashboard/growth/acquisition` | Qualify and route discovered opportunities | `acquisition_items`, events | Acquisition |
| `/dashboard/responses` | Social/email/LinkedIn acceptance inbox and human response decisions | `inbox_items`, events | Responses |
| `/dashboard/sequences` | Campaign Studio | campaign/sequence APIs | Campaigns |
| `/dashboard/brainstorm` | Profile-aware idea generation | AI routes | Campaigns secondary |
| `/dashboard/growth-lab` | Experiments and learning | growth experiments | Campaigns secondary |
| `/dashboard/campaigns`, `/dashboard/campaigns/new`, `/dashboard/campaigns/[id]` | Campaign detail and creation | campaigns | Campaigns compatibility/deep links |
| `/dashboard/publishing` | Quick Blast composer moved intact from the old Home | social accounts, schedule/publish APIs | Publishing |
| `/dashboard/stories/new` | Story-form content creation | story generation | Publishing secondary |
| `/dashboard/scheduled` | Scheduled publishing queue | `scheduled_posts` | Publishing secondary |
| `/dashboard/approvals` | Human approval for queued posts | `scheduled_posts.meta.approvals` | Publishing secondary |
| `/dashboard/growth` | Today's existing outreach queue | `growth_targets` | Growth |
| `/dashboard/growth/followups` | Target maintenance and cadence compatibility view | `growth_targets` | Growth secondary |
| `/dashboard/growth/waiting` | Contacts waiting for their next cadence date | `growth_targets` | Growth secondary |
| `/dashboard/growth/pipeline` | Booked calls, outcomes and next steps | `growth_targets` | Growth secondary |
| `/dashboard/growth/import` | Import existing targets | `growth_targets` | Growth secondary |
| `/dashboard/growth/tracker` | Growth plan/tracker | `growth_plans` | Growth secondary |
| `/dashboard/metrics` | Operational metrics | reporting APIs | Growth secondary |
| `/dashboard/resources`, `/dashboard/resources/present`, `/dashboard/resources/presenter` | Resource library and presentation views | resources | Resources |
| `/dashboard/connect`, `/dashboard/connect/manual` | Channel state, OAuth entry and profile setup | social accounts/profile | Connect |
| `/dashboard/content/new` | Older lightweight content entry | content APIs | Compatibility only; do not promote |
| `/dashboard/proposal-requests` | Specialist proposal request workflow | proposal requests | Deep link only |
| `/dashboard/admin/cohorts` | Administrative cohort management | cohorts | Admin/deep link only |

## Lifecycle and ownership

1. Gmail LinkedIn acceptance intake creates an accepted-connection item in Responses and qualified suggested-network candidates in Acquisition. It never sends a LinkedIn message.
2. Acquisition retains provenance, deduplication, qualification, acceptance and routing history.
3. Starting outreach promotes or reconciles the approved person into `growth_targets`; it does not copy the whole Acquisition state machine.
4. `growth_targets` remains the source of truth for `connection → day3_dm → day10_insight → day17_followup → parked`, replies, calls and outcomes.
5. Responses remains the source of truth for inbound email/social/LinkedIn activity and human decisions. Cross-links identify related records without merging their histories.

## Reuse, consolidation and retirement

- Reuse the existing cadence, due-date calculation, mark-sent, reply update, call prep and pipeline records.
- Surface due work through Home and the Growth navigation so customers do not need to discover legacy URLs.
- Use Growth Profile-aware draft generation and retire generic default phrases from generated queues.
- Keep legacy Growth screens as compatibility and maintenance views while records exist. Do not migrate or delete existing `growth_targets`.
- Treat `/dashboard/content/new` and the older campaign detail routes as deep links until their remaining use is measured; no destructive retirement is part of this change.

No schema migration is required for this cohesion layer.
