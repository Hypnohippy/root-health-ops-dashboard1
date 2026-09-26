# Connection completion / provider setup

## Boundary

This is a guided setup layer on Connect, not another integration framework. It uses the current OAuth routes, tenant-scoped connection-health endpoint and hardened capability assessment. No OAuth scopes, adapters, engine workflows, sends, schema or credential stores change. Interrupted Prompt #7 work is not included.

Live connected account, granted permission, review, business verification and billing states could not be established from repository inspection. The authenticated endpoint reports saved workspace credentials; it never claims remote operation. No production connection was made or tested in this PR.

## Current implementation matrix

All social account tokens/identities are workspace-scoped `social_accounts` records. OAuth app credentials and callback settings are Root-wide server environment configuration. The customer normally authorizes an account; Root registers the app and completes provider setup. Gmail endpoint/ingestion entries are tenant-scoped within operator-managed environment configuration, with Google authorization in the existing engine.

| Channel | Current implementation / missing access | Registration and approval owner | Customer step / fallback |
| --- | --- | --- | --- |
| Facebook | Page publishing, comment reader/replier implemented. Comment grants unverified; `pages_read_user_content` and `pages_manage_engagement` absent from current request. | Root Meta developer app; required review/verification must be confirmed in provider console. | Connect managing account, select Page; native Page actions where unverified. |
| Instagram | Professional-account publishing and comment adapters. `instagram_manage_comments` absent from current Facebook-login request. | Root shared Meta app/review; customer professional account linked to Page. | Connect via Facebook; native Instagram replies until verified. |
| LinkedIn | Member publishing. Relationship/activity reader runtime-gated; no invitation/DM adapter. | Root app and products; additional Community Management access needs approval and implementation. | Authorize member account; manual relationship work. |
| Threads | Publishing adapter; no response/reply adapter. | Root Threads app and review for broader customer access. | Authorize account; native replies. |
| TikTok | Upload to inbox, not direct publication; no comment/reply adapter. Requested upload/direct-post scopes are not proof of grants. | Root developer app/product approval. Direct Post requires separate enablement/audit and implementation. | Connect; finish uploaded draft in native inbox, never re-upload an uncertain attempt. |
| Google Business Profile | Identity OAuth only; no business actions, no `business.manage`. | Root Cloud project, GBP API access approval and business adapters still needed. | Identity-only connection is labelled; posts/reviews remain in Google. |
| Gmail | Existing Phase 4D human-approved engine sends and inbound intake. Config presence cannot verify Google grants, reachability, quotas or delivery. | Root/operator configures existing tenant engine; Google consent/review depends on its scopes/deployment. | Authorize engine when asked, approve replies; verify uncertain outcomes in Gmail. |
| CRM/webhooks | Authenticated acquisition ingestion, no self-service CRM connector. | Operator-managed tenant/source credentials. | Ask operator; existing acquisition workflow. |
| YouTube, X, Bluesky, Pinterest, WhatsApp, Reddit, website forms, calendar, Outlook | Planned catalog entries, no enabled corresponding connector. | Deferred; do not ask customers to register/pay for unavailable adapters. | Native service/manual workflow. |

Paid access is **not established** for any channel by this inspection. The guide explicitly does not recommend payment as a way to unlock missing adapters. Account eligibility, business verification and app approval must be confirmed by the provider/operator; no local flag fabricates them.

## Current requested scopes and callbacks

| Flow | Existing request | Callback |
| --- | --- | --- |
| Facebook / Instagram | `pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish` | `/api/oauth/facebook/callback`; `META_FACEBOOK_REDIRECT_URI` override otherwise deployed origin |
| LinkedIn | `openid profile email w_member_social` | `/api/oauth/linkedin/callback` on configured app origin |
| Threads | `threads_basic,threads_content_publish` | `/api/oauth/threads/callback` on configured app origin |
| TikTok | `user.info.basic,video.upload,video.publish` | Exact `TIKTOK_REDIRECT_URI`; existing callback route `/api/oauth/tiktok/callback` |
| Google identity | `openid`, `userinfo.profile`, `userinfo.email` | Exact `GOOGLE_REDIRECT_URI`; existing callback route `/api/oauth/google/callback` |
| Gmail | Engine-owned Google authorization; not the Ops Google identity request | Managed in the existing engine |

An operator must register the exact deployed redirect with the provider. A route displayed in the guide is not proof the external allowlist is configured. Reconnect uses existing tenant-bound signed OAuth state. It cannot obtain a scope the current implementation does not request or enable an absent adapter.

## Guided journey and state

Expand **Continue setup** to see saved identity/configuration, limitations, the next human step and native fallback. Root-wide missing credentials/signing configuration produce operator setup instructions, not an end-user secret form. When required server configuration is present, the existing Connect/Reconnect action becomes available. GBP says **Connect identity only**. Provider registration, scopes and callback detail remain under an operator expander.

The state vocabulary supports ready, permissions incomplete/unverified, developer registration, credentials, business verification, provider approval, paid account, partial operation, manual-only and unsupported. Only states supported by existing evidence are assigned. Registration/review/payment completion and partial verified operation are not inferred from a token. Planned connectors remain unsupported; CRM is managed/manual; GBP and connected TikTok explain native-only actions.

**Recheck setup** reloads tenant-scoped credentials, expiry, root configuration presence and existing capability restrictions, with a check timestamp. Returning focus to Ops also reloads. Failures report that prior data may be stale. Checks do not issue test posts, send email, refresh grants, verify remote token validity or probe providers. This limitation is visible in the UI; operationallyVerified stays false under the existing assessment. Real provider probes and persisted grant evidence are intentionally deferred.

No new secret collection is necessary for this first version. The presence helper returns only boolean/unknown, never app IDs, secrets, token values or environment contents. Existing OAuth/server storage is reused without claiming new encryption guarantees. An absent or short OAuth-state signing secret blocks readiness. No app registration, review submission, billing action or credential rotation is performed.

## Official references

- Meta's official [Instagram collection](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00) and [Threads collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)
- [LinkedIn increasing access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2025-11)
- [TikTok Direct Post setup](https://developers.tiktok.com/docs/en/content-posting-api-get-started)
- [GBP basic setup](https://developers.google.com/my-business/content/basic-setup)
- [Gmail scope verification](https://developers.google.com/workspace/gmail/api/auth/scopes)

Provider requirements were checked against official documentation; actual account grants/approvals remain unknown. The implementation reports its own limits, not a blanket promise of API availability.
