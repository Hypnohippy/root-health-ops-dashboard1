# Advisor mailbox bridge — not activated

Guide and stored-evidence Advisor are independent. No live keys, environment variables, Apps Script code or deployment has been changed.

## Separate activation review

1. Review `root-advisor-mailbox-adapter.gs`, the guarded dispatch addition and contract tests. Preserve the complete existing `doPost` after the early adapter dispatch. Adapter-shaped malformed requests must never fall through into sending/intake handlers. No new doGet, timer, trigger or existing intake changes.
2. Confirm the existing deploying Google account and its approved Root aliases. Confirm existing Gmail grants and applicable Google verification/data-processing requirements. Do not add OAuth scopes.
3. Authorise a new purpose-specific random signing key, stored privately in Apps Script and Vercel as `ROOT_ADVISOR_MAILBOX_SIGNING_KEY`; never reuse ingestion credentials. Configure matching `ROOT_ADVISOR_MAILBOX_KEY_ID`, `ROOT_ADVISOR_MAILBOX_ORGANISATION_ID`, `ROOT_ADVISOR_MAILBOX_ACCOUNT`, `ROOT_ADVISOR_MAILBOX_OWN_ADDRESSES`. Vercel additionally requires `ROOT_ADVISOR_MAILBOX_OPERATOR_ID` and `ROOT_ADVISOR_MAILBOX_URL` (reviewed versioned /exec endpoint). Preview has no mailbox credentials by default. Explicitly review any later Preview activation.
4. Review and deploy the adapter version only after Ops code is deployed and verified. Pin the web-app deployment version; keep triggers unchanged. The existing execute-as-deployer endpoint is public transport, not public mailbox authority; signed short-lived envelopes authenticate it.
5. Verify wrong tenant/account/key/signature/nonce/expiry/operation, unknown fields and replay are rejected before Gmail access. Confirm the 30-second request lifetime and locked nonce registry in Script Properties. Only dedicated security nonce/expiry metadata is written; no message bodies or operational data. Expired entries are removed under the lock; a full registry or storage failure rejects before Gmail access.
6. Use one explicitly authorised relationship with verified email/thread associations for a single read-only lookup. Verify participant constraints, exact Gmail IDs, candidate selection, limitations, zero writes/sends, and that live evidence is labelled not saved/linked. No ingestion/reconciliation runner is invoked.
7. Disable by removing adapter configuration or rotating the purpose-specific key. Stored advice and Guide remain available. Existing intake/sending credentials and schedules are unaffected.

## Limits

Maximum five candidate threads and twenty returned messages; 12,000 characters per message; partial coverage is explicit. HTML-only bodies remain unavailable rather than inferred. Known thread IDs take priority. A verified contact email is also required for participant revalidation. No name/domain-only lookup. Multiple candidates require explicit selection; each selected thread is revalidated. No mailbox-wide import, attachments, message read-state changes, Gmail drafts or operational writes.

ScriptLock serialises nonce check/use in the Script Properties security registry. Retries generate fresh signed requests and never persist live email in Ops. This security bookkeeping is distinct from operational record writes. It is not implemented using best-effort CacheService, which could evict replay evidence before expiry.
