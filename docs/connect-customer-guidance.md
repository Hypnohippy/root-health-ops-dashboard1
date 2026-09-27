# Connect customer guidance

Connect cards now answer: connected account, available features/limits, and the next action. Technical descriptions and secondary actions are collapsed under Advanced technical details. This is presentation only; no capability, OAuth, provider or sending code changes.

## Ownership and links
The existing setup configuration must be present and canConnect must be true before a customer can authorise an account. Expired connections then offer Reconnect; missing accounts offer Connect. Root/operator setup, business verification, app registration and provider approval states never generate a customer setup instruction. Unknown readiness remains a Root check. Explicit provider-approval-required state can say waiting; unknown review status never claims an application has been submitted.

The short guide explains account/Page selection and return before navigating to the existing tenant-scoped authorisation start route. Instagram uses the existing Facebook flow. No generic provider homepage or developer console is a customer setup action. Root review/configuration remains in support diagnostics; no customer is asked to perform app review.

## Technical truth and fallback
Current capability assessments never establish operational verification. Consequently a connected account cannot be called fully usable; even a standalone verification flag cannot override capability restrictions. Future verified capability support requires a separately scoped backend change, not an optimistic label here.

Facebook/Instagram comments require Root-side permissions. LinkedIn responses remain unavailable and messages manual. Threads comments/replies are unsupported. TikTok uploads still require native completion and must not be repeated. Google Business Profile remains identity-only. Gmail setup requires Root verification and human approval of replies. Existing prepared items retain their source/copy/manual-completion paths; Connect does not create or send drafts. Gmail fallback warns against repeating an uncertain send.

Advanced retains requested scopes, callback, credential/configuration presence, token expiry, review status, capability reasons, operator requirements, stored-state check limits and Disconnect. Checking reloads saved state; it does not claim a remote delivery test.
