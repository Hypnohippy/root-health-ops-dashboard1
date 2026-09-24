# Phase 4K LinkedIn activity coverage audit

The connected LinkedIn OAuth flow currently requests `openid profile email w_member_social`. LinkedIn documents those open scopes for member identity and publishing. They do not provide a relationship-event feed, invitations, inbox messages, follower identities, or read access to comments and reactions.

| Event | Class | Current result | Safest fallback |
| --- | --- | --- | --- |
| Accepted connection invitations | B | The Invitations API can query sent invitations in `ACCEPTED` state, but only for approved partners. The current app does not have that permission. | Continue the tenant-scoped Gmail acceptance intake and 30-day backfill. |
| Accepted follow/follower invitations | C | LinkedIn has no documented supported invitation-state API for personal-profile follows. | Confirmed notification email or manual capture only. |
| New followers | B for aggregate counts; C for follower identity | Community Management's `memberFollowersCount` uses `r_member_profileAnalytics` and returns counts, not the people who followed. | After approval, record aggregate growth metrics only. Never manufacture contacts from a count. |
| Profile follows | C | No supported member-identity feed is documented. | Manual capture or confirmed email only. |
| Direct messages | B | Communications/message access is restricted to approved partner/compliance use cases. The current app has no message-read permission. | Preserve human-reviewed Copy/Open LinkedIn actions. |
| Comments/replies | B | Current APIs require Community Management read permissions such as member or organization social-feed access. `w_member_social` does not grant the required reads. | The existing LinkedIn pull must report the permission limitation rather than imply success. |
| Connection requests received | B | Available through the restricted Invitations API for approved partners. | Supported invitation email or manual capture. |
| Reactions | B | Reads require Community Management member/organization social-feed permissions. | Do not scrape notification pages. |

## Accepted-invitation reconciliation

The supported reconciliation route is `GET /v2/invitations?q=inviter&states=ACCEPTED`. It would allow Ops to compare previously sent invitation URNs with their current state and create the same deduplicated `connection_accepted` Response event. It cannot be enabled with the current scopes: LinkedIn explicitly restricts the Invitations API to approved partners.

If LinkedIn grants that product later, Ops should store the granted scopes, retain invitation URNs when an invitation is sent, poll a bounded time window, canonicalize the returned member identity, and upsert through the existing Responses identity constraint. Email ingestion remains a recovery source, not a second contact record.

## Supported implementation boundary

`GET /api/linkedin/activity-coverage` exposes this tenant-authorized capability matrix without tokens or secrets. No unsupported polling, browser scraping, notification scraping, private-message sending, or automatic outreach is added. The existing Gmail ingestion remains the only automated acceptance source until LinkedIn grants Invitations API access.

Official references:

- [LinkedIn Getting Access to APIs and Open Permissions](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [LinkedIn Invitations API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations)
- [LinkedIn Community Management permissions](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)
- [LinkedIn Member Follower Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/follower-statistics)
- [LinkedIn Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api)
- [LinkedIn Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api)
- [LinkedIn webhook validation and approved-use-case requirement](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/webhook-validation)
