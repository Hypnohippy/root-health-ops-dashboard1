# Phase 1: tenant safety

This change covers OAuth, connection management, Quick Blast, scheduling and publishing. No Supabase migration is required. It does not add Growth Profile features, platforms or dashboard layouts.

## Access rules

- Identity is verified by the existing Supabase SSR `getCurrentUserId()` helper (`auth.getUser()`), including chunked session cookies.
- A supplied organisation ID is checked against `organisation_members` for that user. Reads require membership; publishing, scheduling and connection changes require `owner`, `admin` or `manager`, matching the existing connection-management policy. Unknown/null roles cannot write.
- Requests without an ID work only when the user has exactly one membership. Multiple memberships require an explicit organisation selection. No global, newest-organisation or environment organisation fallback is used in these flows.
- OAuth state is HMAC-signed, valid for ten minutes and bound to provider, organisation, authenticated user and an HttpOnly SameSite=Lax browser nonce. Callback verification consumes the nonce and rechecks membership, including before saving after a provider exchange. Legacy unsigned OAuth links must be restarted.
- Cron requires an exact `Authorization: Bearer <CRON_SECRET>` match in every environment. A missing secret never authorizes dispatch. Only publishing delegates and the Meta sync endpoint accept this service credential, with an explicit organisation. Interactive routes do not accept cron credentials as a substitute for membership.
- Quick Blast only receives dispatcher results from its own organisation. Scheduling mutations always include both record ID and verified organisation ID. Campaign/sequence references on scheduling and experiment references used for publishing events are checked for ownership.
- Facebook/Instagram publishing payloads, formats, page selection and linked Instagram discovery remain intact. Legacy direct Facebook endpoints now use that organisation's stored connection. Environment-based Make webhooks require an explicit owning organisation.

## Connection health

`GET /api/social/connection-health?organisationId=<id>` returns `connections`, with `platform`, `state`, `name` and `expiresAt`. It never returns access tokens, refresh tokens or arbitrary connection metadata. Responses are private and uncached.

States are `not_connected` (no row), `reconnect_required` (inactive, missing credentials or invalid expiry), `expired` (stored expiry reached), and `connected` (active credentials with no known expiry failure). An absent expiry is treated as unknown rather than expired, preserving non-expiring Facebook page tokens. This is stored-credential health: it does not probe providers for revocation or automatically refresh tokens. Existing TikTok publishing refresh behavior remains unchanged.

## Vercel environment

Set values in the correct Vercel environment and redeploy. Never use `NEXT_PUBLIC_` names for secrets.

| Variable | Purpose |
| --- | --- |
| `OAUTH_STATE_SECRET` | New requirement: random secret of at least 32 characters, consistent between start and callback deployments. |
| `CRON_SECRET` | Required for dispatcher and cron routes. Vercel's existing cron schedule calls `/api/social/dispatch-scheduled`; manual triggers must send the bearer header. |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS deployment origin used by OAuth and internal publishing requests. Preview environments must use their own origin, not the production deployment. |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing public Supabase key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only database credential. |
| `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` | Threads app credentials. |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | Existing TikTok credentials and exact registered callback URI. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Existing LinkedIn credentials. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Existing Google credentials and exact registered callback URI. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (or `META_APP_ID`, `META_APP_SECRET`) | Existing Meta credentials. If used, `META_FACEBOOK_REDIRECT_URI` must match the registered callback. |
| `LEGACY_FACEBOOK_ORGANISATION_ID` | Only required for legacy Make webhook endpoints; explicitly identifies the organisation that owns those global webhooks. Its caller must have a write role there. No fallback is allowed. |

Existing unrelated services still need their own deployment variables, including `OPENAI_API_KEY` and Stripe configuration. `DISPATCH_SECRET`, `SINGLE_ORG_ID` and `NEXT_PUBLIC_SINGLE_ORG_ID` do not authorize these tenant-protected flows.

## External platform configuration and manual checks

1. Register exact HTTPS callbacks: `/api/oauth/threads/callback`, `/api/oauth/tiktok/callback`, `/api/oauth/linkedin/callback`, `/api/oauth/google/callback`, and `/api/oauth/facebook/callback`. Google also retains the existing `/api/social/callback/google` alias; the configured Google redirect URI must match the one used to start OAuth. The older Facebook `/api/social/callback/facebook` flow is retained with signed state.
2. Enable Threads `threads_basic` and `threads_content_publish`. Configure app/tester access or the platform's required review before connecting non-test accounts. Keep existing Meta Page and Instagram publishing permissions, TikTok upload/publish permissions, LinkedIn OpenID/profile/email and `w_member_social`, and Google profile/email scopes.
3. Verify real users have appropriate `organisation_members` rows and roles. For users with multiple memberships, callers must supply an organisation ID; this PR does not add a tenant-picker UI.
4. In a staging environment with test accounts, verify each OAuth flow, Facebook text/photo/video and Instagram publishing, TikTok/LinkedIn publishing, and one scheduled dispatch. Confirm cross-tenant IDs are denied. Provider round trips and live posting are not performed by the local regression suite.

## Validation and limits

Run `npm run test:security`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The security suite executes shared auth/state logic and route handlers with mocked Supabase/provider boundaries; it does not validate deployed RLS policies or external app approvals.

The existing lockfile was inconsistent with package.json and is repaired. Next.js and its ESLint config are patched from 16.0.7 to 16.0.11 within the existing release line following the [Next.js security advisory](https://nextjs.org/blog/security-update-2025-12-11). Build resolution is restricted to this project to avoid unrelated parent-directory dependencies.

Repository-wide lint contains pre-existing errors; the PR records the actual check results and a comparison against the base commit. This is a hardening of the requested social/OAuth/scheduling surfaces, not a complete security audit of every existing API or the deployed database. Review remaining application APIs and RLS before declaring the entire SaaS production-ready. Scheduled posts already accepted by the service remain publishable after their creator's membership changes; there is no schema change to attach or revalidate a scheduling user's identity at dispatch time.
