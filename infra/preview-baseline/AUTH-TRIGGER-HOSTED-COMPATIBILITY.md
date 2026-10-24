# Managed Auth trigger reconstruction — 24 October 2026

Scope: PR #101 baseline reconstruction only. No hosted branch, Production DDL,
business-row access, provider/configuration change or Phase 2D behaviour change.

## Exact origin and history

The fresh-install file is
`migrations/00000000000000_root_ops_schema_baseline.sql`. Before this repair,
line 2998 contained:

```sql
ALTER TABLE "auth"."users" ENABLE TRIGGER "on_auth_user_created_create_org";
```

`generate.cjs` emitted it immediately after the captured `CREATE TRIGGER` because
its general renderer explicitly restored every `tgenabled` value, including the
default `O`. Commit `25021ff0ef32ad2cc58b6747e796a89c9b659a1c` introduced both
the generator and generated statement on 19 October 2026 at 19:13:04 BST. This
was a reconstruction of existing Production metadata, not the original signup
migration. The captured catalog predates this commit and already has the same
enabled trigger and function. No earlier tracked incremental migration defines
this trigger/function; repository-wide `git log --all -S` first finds the
baseline commit. No later repository migration supersedes them.

Production's currently recorded migration ledger contains only
`20261010054821 personal_signal_acquisition_actions` and
`20261019120000 solution_brief_foundation`, neither of which establishes this
signup trigger. The catalogs and available repository history do **not** prove
when/by whom the original trigger was installed, whether there was manual SQL,
or whether historical hosted privileges differed. Do not present those guesses
as a root cause. Production never needed this new empty-install baseline to
recreate a trigger that already existed. The local verifier used a superuser,
which explains why it failed to detect the redundant ALTER's ownership demand.

## Current Production — metadata SELECT only

Live metadata on 24 October 2026 matches the captured signup objects:

| Object/property | Verified value |
| --- | --- |
| Table | `auth.users`, owner `supabase_auth_admin` |
| SQL execution role | `postgres` |
| `postgres` table TRIGGER privilege | true |
| `postgres` active membership in table owner role | false |
| Non-internal Auth trigger | `on_auth_user_created_create_org` |
| Event | AFTER INSERT, FOR EACH ROW |
| Enabled state | `O` (origin/local) |
| Function | `public.handle_new_user_create_org()` |
| Function owner/security | `postgres`, SECURITY DEFINER |
| Existing search path | `public, auth` |
| Existing EXECUTE ACL | PUBLIC, postgres, anon, authenticated, service_role |

These existing function security/ACL properties are preserved, not expanded or
hardened here. No Auth table ownership, policy, extension or provider setting
was changed. Only schema definitions/permissions and migration names/versions
were read; no user or business rows were selected.

The unchanged trigger function returns early for a user with a membership;
otherwise it creates an organisation from signup display metadata and an
`owner` membership for `NEW.id`. The trigger/function remain required for this
onboarding behaviour. The redundant post-CREATE ALTER is **not** required.

## Narrow repair and proof

Retain the exact captured CREATE and function body. For only this app Auth
trigger with captured state `O`, skip the redundant ALTER and assert the exact
table/name, non-internal status, enabled state and function OID in `pg_trigger`.
A non-default captured Auth-trigger state stops generation for separate review;
other existing trigger-state rendering remains unchanged. No privilege
escalation, ownership transfer, new SECURITY DEFINER function or exception
swallowing is used. The SQL does not try to repair managed state.

PostgreSQL creates a normal trigger enabled by default. Its documented CREATE
permission is table TRIGGER plus function EXECUTE; ALTER TABLE requires table
ownership. Supabase documents creating application signup triggers on managed
`auth.users` using CREATE TRIGGER. References:

- https://supabase.com/docs/guides/auth/managing-user-data
- https://www.postgresql.org/docs/17/sql-createtrigger.html
- https://www.postgresql.org/docs/17/sql-altertable.html
- https://www.postgresql.org/docs/17/catalog-pg-trigger.html

`workflow/auth-trigger.test.mjs` runs real PostgreSQL/PGlite permissions. It
reproduces the original 42501 under a NOSUPERUSER/NOBYPASSRLS non-owner role,
then installs the exact generated create/assertion block with TRIGGER privilege
and no owner-role membership. It verifies origin-enabled metadata, exercises a
synthetic signup under the managed Auth role (exactly one organisation/owner
membership), and proves missing/disabled/wrong-function triggers fail closed.
Only local test-superuser setup induces the negative states; no such SQL runs
against Production. This is not a substitute for a full fresh hosted restore.

The migration artifact checksum is explicitly refreshed in `migration-map.json`;
the source catalog, all historical migration hashes and PR84
fixture are unchanged. Full structural comparison must remain zero. The
Phase 2D migration remains unchanged and unapplied hosted. A newly authorised
temporary branch is still needed to verify the remaining hosted chain and
Phase 2D persistence/concurrency. No branch is created in this audit.

## Local validation for this repair

- Production metadata comparison: exact trigger definition/state and function
  definition/owner match the immutable baseline capture.
- `npm test --prefix infra/preview-baseline`: 13/13 schema gates, 54 tables,
  31 functions, zero structural mismatches, manifest/credential integrity pass,
  and 27/27 workflow tests (seven new restricted-role tests plus 20 existing
  Solution Brief tests). PR84 compatibility migration applies cleanly.
- `node --test --test-concurrency=2 tests/reviewed-identity-db.test.mjs
  tests/reviewed-identity-server.test.mjs`: 32/32 pass, exercising the unchanged
  Phase 2D migration on the corrected baseline.
- JavaScript syntax checks pass. The new test is lint-clean. Targeted ESLint on
  `generate.cjs` reports the same two pre-existing CommonJS `require()` findings
  on untouched lines 2–3; exact pre-repair source reproduces both. No unrelated
  module-format conversion or lint suppression is included.
- TypeScript was not rerun: no application TypeScript/TSX or type contract changed.
- No new hosted branch, Production write, Auth configuration change or Phase 2D
  migration application. Full hosted restore/persistence remains unverified.

Subsequent default-ACL compatibility work separately moves platform-owned
public default-ACL setup to the local-only platform fixture and replaces its
application replay with assertions. See `DEFAULT-ACL-HOSTED-COMPATIBILITY.md`;
the Auth trigger repair and its seven tests remain unchanged.
