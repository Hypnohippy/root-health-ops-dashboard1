# Atomic Founder authorization — PR #101 local repair

This is an unapplied migration and application cutover. Production is not changed.
The original `20261023193032_reviewed_identity_decisions.sql` remains unchanged.

## Security boundary

The former confirmation path accepted a valid signed Founder creation preview after
Founder eligibility was revoked while organisation ownership remained. A local
reproduction committed one Founder record, workspace and receipt, then failed its
canonical read. Signed intent is not current permission.

Migration `20261024184449_atomic_founder_authorization.sql` adds:

- Private schema `root_ops_private`.
- Global singleton `founder_authorization_policy`: canonical required email,
  revision and timestamps. It starts **empty**, so Founder access is denied.
- `founder_actor_identity`: user ID, nullable canonical current email, revision and
  update time. No Auth foreign key, profile data or pending-email fields.
- `normalize_founder_email(text)`: the only email canonicalizer.
- `sync_founder_actor_identity()`: separate Auth trigger function.
- `require_founder_authorization(uuid,uuid)`: transactional authorization helper.
- `set_founder_authorization_policy(text)`: trusted administrative SQL only.
- Public service-only `founder_authorization_allowed(uuid,uuid)` wrapper.
- Replacement reviewed-decision RPC with a pre-receipt protected authorization call.

No new Auth-table privileges are granted to application roles. The mirror trigger
function/table owner is `root_ops_founder_mirror_owner`, a NOLOGIN/NOINHERIT role
without superuser, role-management, RLS-bypass or Auth read/update privileges.
`postgres` receives membership so the migration/admin can manage those private
objects. The role receives private schema USAGE and normalizer execution; temporary
schema CREATE is revoked after ownership transfer. Remaining helpers retain the
repository's postgres-owned SECURITY DEFINER convention. The normalizer is INVOKER.
All functions have empty search_path; objects are qualified. PUBLIC/browser access
is revoked. service_role cannot read/mutate either private table or call the setter.
Private relations are outside the exposed public schema and protected by ACLs.

## Canonical email contract

Trim exactly ASCII HT, LF, VT, FF, CR and SPACE. Accept ASCII alphanumeric/underscore/
plus/hyphen local components separated by single dots; accept alphanumeric domain
labels with internal hyphens and at least one domain dot. Translate only A–Z to a–z.
Unsupported input returns NULL. This deliberately excludes Unicode, quoted mailboxes
and other email syntax; it is a Founder-eligibility grammar, not a general email
validator. Unsupported/null Auth email must still commit and yield an ineligible
mirror. No JS trim/lowercase equivalent is claimed. The application consumes the
SQL authority; normalization vectors exercise both SQL and the actual wrapper.

## Trigger/backfill

`founder_actor_identity_sync` is a non-deferred AFTER ROW Auth INSERT, UPDATE OF
email, DELETE trigger. INSERT/update use NEW.email and upsert; DELETE uses OLD.id.
Errors propagate, so Auth and mirror commit or roll back together. The trigger name
sorts before `on_auth_user_created_create_org`; neither depends on the other's result.
The existing organisation-creation trigger is unchanged.

Migration acquires SHARE ROW EXCLUSIVE on auth.users before installing the trigger
and backfilling all users. Full-join verification checks coverage and canonical
email equivalence while concurrent Auth DML remains blocked. Lock acquisition has
a two-second timeout; failure rolls the migration back. No real email is seeded.

## Transaction order and races

Protected create targeting founder_research_records and save_research:

1. Existing tenant advisory locks 742 then 5805.
2. Policy FOR SHARE.
3. Actor mirror FOR SHARE.
4. Exact organisation membership FOR SHARE.
5. Exact organisation plan FOR SHARE.
6. Check the values returned by these locking reads: canonical matching email,
   current owner membership, plan OR plan_key equal to founder.
7. Existing receipt lookup, source table locks, snapshot checks, workspace locks
   and writes, unchanged.

Missing/invalid policy, identity, membership or plan denies with generic 42501.
No protected execution subsequently reads/locks auth.users, including implicit new
foreign keys. Existing Phase 2D inserted objects have no Auth foreign keys.
Receipt replay is authorized before returning prior protected results. Current
authorized callers retain the existing receipt hash/actor/idempotency behavior.
Non-Founder operations and KEEP_SEPARATE semantics are unchanged.

Auth email changes lock Auth then mirror; protected writes never reverse that edge.
If revocation wins, the locking read sees revoked state. If authorization wins,
revocation waits until commit. Plan/ownership/policy updates serialize on their
locked rows. Cascades or other callers may still deadlock; timeout/deadlock aborts
the transaction. No automatic mutation retry is introduced.

The application resolves the actor using the existing authenticated session, validates
the actor/org-bound signed review, then rechecks DB-backed Founder authorization
immediately before protected RPC invocation. This includes replay. The service-role
RPC does not carry browser auth.uid(); it trusts only the authenticated server's
actor binding, not client email or editable metadata. Service credential compromise
remains a privileged-administrator boundary, not something this helper can repair.

## Explicit rollout gate — not performed

1. Review this repair and complete separately authorized hosted proof.
2. Check the currently configured email against the deliberately narrow grammar.
3. Apply the new migration during a controlled deployment window. Empty policy
   deliberately disables Founder features until the following setup completes.
4. As a trusted SQL administrator, call
   `root_ops_private.set_founder_authorization_policy(<verified configured email>)`.
   Do not place the real email in repository SQL, logs or browser APIs.
5. Cut application/RPCs over together and drain/disable older deployments. Both use
   the same DB policy; environment variables are no longer an authorization fallback.
6. Verify access and administrative policy revision. Subsequent revocations update
   policy, plan, membership or Auth email using normal transactional writes.

Missing migration/wrapper gives a generic verification error; missing policy/mirror
denies. No authorization cache exists. An administrative drift audit can compare
Auth ID/email coverage with the mirror; bypassing/disabling triggers is a privileged
security incident, never a reason to use an environment fallback.

## Local proof commands

From the repository root:

```text
node --test tests/founder-atomic-authorization.test.mjs tests/reviewed-identity-server.test.mjs tests/reviewed-identity-db.test.mjs tests/reviewed-identity-token.test.mjs tests/reviewed-identity.test.mjs tests/reviewed-identity-ui.test.mjs tests/founder-memory.test.mjs tests/founder-intelligence.test.mjs
npm ci --prefix infra/founder-authorization
npm --prefix infra/founder-authorization test
npx tsc --noEmit
```

The isolated harness uses pinned embedded PostgreSQL and pg, starts a fresh loopback
cluster, applies the real baseline/migrations and runs genuinely separate connections.
It never accepts a hosted URL. Cluster shutdown and deletion run in finally. The
race test file skips when invoked without the harness URL; a skipped standalone
invocation is **not** race proof. The harness run must report zero skips.

Tests cover both serial outcomes for four revocations, research-policy races,
forced 40P01 deadlock, 55P03 lock timeout, duplicate receipts, browser/private ACLs,
managed-role Auth email changes, trigger rollback and fresh zero-write counts.
The database behavior is real; server tests mock only external module boundaries.

## Hosted verification still required

No hosted branch was created for this repair. Local proof does not certify managed
trigger installation/role creation on Supabase. A separately authorized fresh branch
must verify installation/backfill, actual Auth signup/email update/delete behavior,
private ACLs, race ordering and cleanup. Do not apply this migration to Production
or claim hosted authorization re-verification from the earlier attempt-six results.

## Captured local results

- Before repair: the exact signed-preview/revoked-Founder reproduction committed
  one Founder row, one workspace and one receipt, then canonical read failed.
- After repair: server regression retains owner membership but revokes policy;
  confirmation rejects before the mutation RPC and fresh counts remain unchanged
  across Founder records, workspaces, source links, receipts and decisions.
- Focused Founder/Phase 2D/server/token/UI contracts: 112/112 passed, zero skips.
  Includes 28 private authorization/normalization/trigger/security checks.
- Separate-connection PostgreSQL 18.4 race/concurrency proof: 13/13, zero skips.
  Backend connections were distinct (7820/5648/29204 in the captured final run).
  Four revocations passed both orders; research passed both policy-race orders;
  duplicate receipt, real 55P03 timeout and forced 40P01 deadlock rollback passed.
- Canonical baseline reconstruction: 13/13 schema gates, zero relevant normalized
  structural mismatches; 106/106 existing baseline workflow/security tests passed.
- TypeScript, targeted lint and diff checks passed. No comparator, clock, original
  migration, identity thresholds, KEEP_SEPARATE, UI or provider behavior changed.

The new migration was applied only to fresh synthetic local databases. These are
local results, not certification of Supabase's managed-role installation boundary.
