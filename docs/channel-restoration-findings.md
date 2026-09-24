# Phase 4F channel restoration and setup findings

The operating rule is **build first, ask the owner last**. Existing code and configuration names were audited without reading or exposing secret values.

## X / Twitter

**Finding: B — third-party configuration remnants exist; no native connector is recoverable.**

Historic commits `8208adf`, `69d5e9f`, `569f8a4` and `d6aca7f` show `twitter` in generic provider lists. Quick Blast and public replies were delegated to an Ayrshare API key rather than X OAuth. No reachable commit contains an X start route, callback, PKCE verifier, OAuth 1.0a signer, X token refresh, X token storage or X-specific publish adapter. Current `app/api/social/connections/route.ts` is another obsolete Ayrshare remnant and is not used by the new Connect capability health model.

**Technical work completed:** searched current files, all Git commits, deleted/renamed paths, provider lists, environment references and publish/reply history; documented the native gap. Connect continues to mark X as Available soon. No X or Ayrshare behavior was added.

**Existing configuration reused:** none. `AYRSHARE_API_KEY` is explicitly excluded from any restoration plan.

**Provider block:** a future native connector needs an approved X developer Project/App, user-context authorization, current write/read scopes, token lifecycle, tenant-scoped storage, posting and response adapters, and sufficient API access. Current X documentation permits user access through OAuth 1.0a or OAuth 2.0 PKCE; a native design should prefer OAuth 2.0 authorization code with PKCE where endpoint support and required scopes are confirmed.

**Does David need to do anything now?** No. No new X integration is being built in this phase. If a later native build reaches an unavoidable app-owner step, all code and exact callback/scopes will be prepared first and only one exact provider action will be requested at a time.

## LinkedIn accepted-connection discovery

**Technical work completed:** added an isolated parser, provenance contract, deterministic dedupe identity, Growth Profile targeting filter, accepted-contact review draft, representative fixture and regression suite. The helper performs no sending or external calls.

**Existing configuration reused:** the existing LinkedIn OAuth connection remains untouched. The design reuses `organisation_profiles`, organisation-scoped acquisition ingestion concepts and the B2B Gmail engine as the future notification source.

**Provider block:** LinkedIn invitation emails can be parsed without new LinkedIn API access. Private-message API access is not assumed, so the workflow exposes Copy, profile URL and LinkedIn’s email-supplied Message URL for human action.

**Does David need to do anything now?** No. Automatic intake is not wired in this PR because a dedicated discovery endpoint and Apps Script forwarding change should be reviewed independently from Phase 4D replies.

## Gmail notification intake

**Technical work completed:** defined the isolated intake boundary and payload/provenance requirements in `docs/linkedin-connection-discovery.md`. The parser is ready for the Gmail engine to call and does not alter reply classification or delivery.

**Existing configuration reused:** future dispatch should use the existing organisation ID and secret-authenticated Ops pattern already used by the B2B engine. No new Gmail OAuth belongs in Ops.

**Provider block:** none for parsing. Automatic operation needs an Apps Script deployment after the dedicated Ops endpoint and forwarding helper are completed.

**Does David need to do anything now?** No. For the later deployment, code should be completed first; the only expected owner action is deploying the revised Apps Script version. Any secret stays in Script Properties/Vercel and must not be pasted into chat.

## Google / YouTube

**Technical work completed:** audited the existing Google OAuth routes and `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` configuration references. They currently establish a Google Business Profile connection only; there is no verified publisher, review adapter or YouTube scope/adapter.

**Existing configuration reused:** the existing Google OAuth app may be extendable, subject to its provider configuration and approved scopes. No duplicate app should be requested before that is verified.

**Provider block:** YouTube and additional Business Profile capabilities require exact scopes, API enablement and potentially Google verification/review. Those changes are outside this UI/discovery PR.

**Does David need to do anything now?** No.

## WhatsApp Business

**Technical work completed:** confirmed there is no current OAuth, webhook or phone-number integration to restore; Connect truthfully keeps it in Available soon.

**Existing configuration reused:** the Meta tenant/OAuth state and webhook patterns may support a future implementation, but no WhatsApp credentials or identifiers are referenced in the repository.

**Provider block:** Meta business onboarding, phone-number verification, permissions and production review require account-owner/provider action after code exists.

**Does David need to do anything now?** No.
