# Separate security remediation plan — no changes applied

Scope reviewed at main `702f2b7ab1ac2a41ca6e8c320fdcc138417e7077` and PR84
`7ec8c3e5c5998386eee17eca345163964dcfb4dc`. Production metadata proves RLS is
disabled, no policies exist, and anon/authenticated each have SELECT/INSERT/
UPDATE/DELETE on all four tables below. The public Data API is enabled. Service
role bypasses RLS. No live exploit or data retrieval was attempted.

The baseline must preserve this state to establish fidelity. Hardening belongs in
separately reviewed route changes/migrations and isolated regression tests.

## resource_library

- **Risk:** direct anonymous CRUD can expose presenter/private resources and alter
  or delete tenant resources. Main's resource routes also trust caller tenant IDs.
- **Routes:** `app/api/resource-library/route.ts`,
  PR84's `app/api/resources/[id]/route.ts`,
  `app/api/resource-artwork/route.ts`, and
  `app/api/resources/upload-slide-art/route.ts`. Browser Resources uses fetch, not a direct
  browser Supabase table call in the reviewed code.
- **Boundary:** authenticated server user, independently verified membership and
  permitted write role, resource organisation ownership, tenant-bound related
  IDs; audience responses must allowlist visible fields. Never trust browser IDs.
- **Migration/policies:** PR84 proposes RLS and browser/PUBLIC grant revocation,
  retaining service CRUD; no direct browser policy is needed by current access.
  Do not duplicate that migration or apply it before PR84 verification/review.
- **Tests:** anonymous/member/nonmember/cross-tenant CRUD/artwork denial;
  authorized standalone create/edit/rename/duplicate/delete; presenter notes
  present only in presenter projection; audience API contains no private fields.

## college_cohorts and unauthorised admin handlers

- **Risk:** anonymous direct CRUD permits commercial/cohort-code/notes exposure and
  tampering. Separately, GET/POST/PATCH in `app/api/admin/cohorts/route.ts` call
  service-role Supabase with **no server authentication/admin authorization**.
  Dashboard guards and RLS cannot protect those handlers.
- **Other affected paths:** `app/college/[slug]/page.tsx`,
  `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`. Preserve intentionally public
  landing/validated checkout and signature-verified webhook behavior.
- **Boundary:** add a shared, fail-closed server admin guard before *any* service
  query in each admin handler. Cohorts currently lack organisation ownership;
  ordinary tenant membership or a browser-provided role is insufficient for a
  global admin API. Use trusted server-managed platform-admin authorization.
  If tenant-scoped administration is desired, design explicit ownership/schema
  separately before granting tenant admins access. Never user_metadata/email
  substring inference. Public landing/checkout must expose a bounded projection
  and validate code/activity/expiry/caps server-side.
- **Migration/policies:** enable RLS and revoke PUBLIC/anon/authenticated table
  rights; preserve service-role server operations. No broad public table policy.
  No ownership backfill or blind enablement during this infrastructure task.
- **Tests:** unauthenticated GET/POST/PATCH denied before query; normal member,
  spoofed admin/tenant/body and user_metadata denied; authorized admin CRUD;
  public valid/invalid/expired/capped codes; private notes/code configuration not
  in public projection; valid webhook succeeds and invalid signature fails.

## college_cohort_redemptions

- **Risk:** direct browser CRUD exposes redemption identity/contact fields and
  permits entitlement/count/idempotency corruption.
- **Access:** no direct browser table call found. Signed Stripe webhook reads and
  inserts redemptions and updates parent cohorts in
  `app/api/stripe/webhook/route.ts` (signature verification precedes operations).
- **Boundary:** verified Stripe signature, validated event/type/metadata and
  idempotent redemption handling; admin reads, if added, require the trusted
  admin guard above. Future tenant/customer views need explicit owner scoping.
- **Migration/policies:** enable RLS, revoke PUBLIC/browser table access, preserve
  necessary service-role privileges; no anonymous or generic authenticated policy.
- **Tests:** anon/member direct CRUD denied; signed duplicate webhook records one
  redemption/count change; invalid signature cannot write; unrelated cohort
  history unchanged; authorized admin read only through guarded server route.

## user_ai_usage

- **Risk:** anonymous CRUD exposes usage attribution and permits allowance evidence
  tampering. Browser usage display calls `/api/usage`, not the table directly.
- **Routes:** `app/api/usage/route.ts`, server generation callers of `lib/usage.ts`
  (service-role insert/count). The usage API already resolves membership/plan.
- **Boundary:** authenticated tenant resolved server-side; caller cannot select
  another tenant; trusted server/cron callers must resolve an explicit owned
  organisation before logging/counting. Do not grant broad browser writes.
- **Migration/policies:** enable RLS and revoke PUBLIC/anon/authenticated table
  rights; preserve server service-role insert/count. No direct browser policy
  required by reviewed paths. Test before enforcement.
- **Tests:** anon/member direct CRUD denied; member usage endpoint allowed only
  for owned tenant; cross-tenant IDs denied; generation usage recorded once;
  quota/count behavior unchanged; signed service jobs remain functional.

## Rollout order and acceptance

1. Separate security PR: add server admin authorization/public projections and
   corresponding isolated route tests first; do not rely on RLS for service APIs.
2. Validate PR84's own Resources protections independently; do not fold unrelated
   cohort/usage changes into PR84.
3. Propose separate reversible hardening migration(s) for remaining tables,
   enumerate preserved service access and verify all relevant paths on synthetic
   data. Audit broad default ACLs so new tables do not reopen the issue; any
   default-privilege change is also separate, not a snapshot correction.
4. Review permissions/role policy with the owner, then seek explicit Production
   rollout approval. Do not automatically enable Production RLS during baseline
   verification. Rollback must restore only the documented previous access model,
   with no data deletion or ownership invention.

No security route, RLS flag, policy, grant or Production record was changed here.
