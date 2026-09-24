# Channel capability audit

This matrix records what Root Health Ops implements today. A stored OAuth connection is not counted as a capability unless the corresponding workflow exists.

| Channel | Connection | Publish | Pull responses | Reply | Lead discovery / outreach | Analytics |
| --- | --- | --- | --- | --- | --- | --- |
| Facebook | OAuth | Available | Available | Available | Not implemented | Not implemented |
| Instagram | Meta OAuth | Limited by professional-account and media requirements | Available | Available | Not implemented | Not implemented |
| LinkedIn | OAuth | Available | Available | Not implemented | Not implemented | Not implemented |
| Threads | OAuth | Available | Not implemented | Not implemented | Not implemented | Not implemented |
| TikTok | OAuth code exists; production approval pending | Limited / provider-gated | Not implemented | Not implemented | Not implemented | Not implemented |
| Google Business Profile | OAuth connection is stored | Not implemented | Not implemented | Not implemented | Not implemented | Planned |
| Email / B2B Gmail | Managed server configuration | Not applicable | Available | Human-approved delivery through the existing B2B engine | Available for the managed B2B engine | Not implemented |
| WhatsApp Business | Not implemented | Not applicable | Planned | Planned | Planned | Not implemented |
| YouTube | Not implemented | Planned | Planned | Planned | Not implemented | Planned |
| Reddit | Not implemented | Not applicable | Planned | Planned | Planned | Not implemented |
| X / Twitter | Not implemented | Planned | Planned | Planned | Not implemented | Not implemented |
| Bluesky | Not implemented | Planned | Planned | Planned | Not implemented | Not implemented |
| Pinterest | Not implemented | Planned | Not implemented | Not implemented | Not implemented | Planned |
| Outlook | Not implemented | Not applicable | Planned | Planned | Planned | Not implemented |
| Website forms | Not implemented | Not applicable | Planned | Not applicable | Planned | Planned |
| CRM / webhooks | Managed acquisition ingestion exists; no self-service connector | Not applicable | Not applicable | Not applicable | Limited | Planned |
| Calendars | Not implemented | Not applicable | Not applicable | Not applicable | Planned | Planned |

## Code evidence

- `app/api/publish/now/route.ts` contains provider branches for Facebook, Instagram, LinkedIn, Threads and TikTok. It has no Google Business Profile publisher.
- `app/api/responses/pull/route.ts` pulls Facebook, Instagram and LinkedIn. Threads and TikTok are explicitly unimplemented.
- `app/api/responses/reply/route.ts` sends public replies only for Facebook and Instagram.
- `app/api/responses/email/*` and `lib/emailEngineDispatch.server.ts` provide inbound email, draft approval, secure engine dispatch and acknowledgement without adding Gmail OAuth to Ops.
- `app/api/growth/ingest/route.ts` provides organisation-scoped managed acquisition ingestion. It is infrastructure for future CRM and form connectors, not a customer-configurable connection.

## Reusable foundations

The organisation-scoped OAuth state, `social_accounts`, tenant authorization helpers and connection-health API can support more social providers. Each new provider still needs its own scopes, callback, token lifecycle and publish/response adapter. The managed engine contract can support server-side systems such as the B2B Gmail engine. The acquisition ingestion contract can accept records from trusted upstream systems once a secure, customer-facing provisioning flow exists.

## Provider or infrastructure work still required

- YouTube and Google Business Profile need approved Google scopes plus dedicated publishing, comments/reviews and token-refresh adapters.
- X, Pinterest and Reddit need provider access, OAuth and API-specific workflow adapters. X access may require a paid API tier.
- Bluesky needs an authenticated account/session strategy and provider adapter.
- WhatsApp Business needs Meta business onboarding, phone-number setup, webhook verification and template-policy handling.
- Outlook and Microsoft calendars need Microsoft identity/Graph OAuth, subscriptions and renewal handling; Google Calendar needs its own Google scopes and event/webhook workflows.
- Website forms need a public, abuse-resistant ingestion endpoint and field mapping. CRM products need per-provider OAuth/webhook verification and customer-controlled mappings.

The Connect page derives its labels from `lib/channelCapabilities.ts`, so product language and this audit can be reviewed together when a capability changes.
