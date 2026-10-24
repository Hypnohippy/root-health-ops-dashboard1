# Managed default-privilege reconstruction — 24 October 2026

Scope: PR #101 fresh baseline only. No paid branch, Production DDL/business-row
read/write, provider/calendar changes or Phase 2D implementation change.

## Exact failure and source

The second isolated restore returned PostgreSQL **42501**, **permission denied
to change default privileges**. Before this repair, the first unavailable-role
operation at line 5774 of
`migrations/00000000000000_root_ops_schema_baseline.sql` was:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public"
REVOKE ALL ON SEQUENCES FROM PUBLIC;
```

It is the first managed-role default replay after the permitted `postgres`
sequence-default statements. The same issue affects subsequent managed-role
function/table default statements. The hosted error did not include a line
number; attribution to the first managed-role statement follows execution
ordering, the role metadata and reproduction of that exact statement under a
non-member local role. Do not imply a hosted line number was returned.

`generate.cjs` mechanically rendered each captured `pg_default_acl` row as a
full set of REVOKEs followed by GRANTs, without distinguishing platform-owned
defaults from installer-owned defaults. Commit
`25021ff0ef32ad2cc58b6747e796a89c9b659a1c` introduced this renderer and generated
file on 19 October 2026. The immutable snapshot was a schema metadata capture,
not evidence that Production had run the reconstruction SQL.

## Current Production: metadata only

On 24 October the six public schema default sets for `postgres` and
`supabase_admin` (tables, functions, sequences) exactly match the snapshot.
There are **no custom global default-ACL rows for either role**. `postgres` is
not a superuser and is neither a member of nor able to act as `supabase_admin`;
the managed role is a superuser. No managed-role ownership/membership was
changed. Roles have membership/authority relationships, not table-style owners.

Both creators' schema additions are:

| Object type | Grantees | Schema default privileges |
| --- | --- | --- |
| Sequences | postgres, anon, authenticated, service_role | SELECT, UPDATE, USAGE |
| Functions | same four | EXECUTE |
| Tables | same four | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN |

No listed schema grant has grant option. These are **future-object** defaults,
not current access to every existing table/RPC. Built-in global defaults also
apply: owner rights and normal PUBLIC function EXECUTE, for example. Per-schema
revokes cannot remove a global grant. The repair verifies that global defaults
remain equivalent to those built-ins, rather than ignoring an extra global
PUBLIC/browser grant. Sequence catalog type `S` maps to `acldefault` type `s`.

Production's existing 54 captured application tables and 31 captured functions
remain `postgres`-owned. All 31 function ACLs match the snapshot. Existing table
ACL/RLS differences are the expected separately applied PR84 hardening:
`proposal_requests` and `resource_library` deny browser table access, and
`resource_library` now has RLS. Production also has the PR84 service-only
Solution Brief table/RPCs. No application table/function is owned by
`supabase_admin`. Public schema USAGE remains as recorded (PUBLIC, postgres,
anon, authenticated, service_role; pg_database_owner also has CREATE).

The distinction matters: changing defaults does not change existing objects;
the baseline's explicit per-object grants/RLS restore the historical snapshot,
and approved subsequent migrations (including PR84 and later Phase 2D) enforce
their narrower contracts. Do not replace those explicit grants with defaults
or resurrect older access after a later migration.

Supabase documents that it installs `supabase_admin` defaults during database
creation. Those defaults apply to objects created by that role, not objects
created by `postgres`; normal hosted postgres cannot change them or become a
member of this reserved role. This is a reconstruction compatibility problem,
not a missing application grant or justification for escalation.

References:
- https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema
- https://supabase.com/docs/guides/database/postgres/roles-superuser
- https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html

## Narrow repair

For exactly `supabase_admin` / public / captured table, function and sequence
default sets, application restore performs catalog assertions only. It compares
the complete schema privilege/grantee/grant-option sets plus effective global
defaults. Missing, weaker, broader or differently grantable state fails closed;
there is no fallback that widens browser access. It performs no managed-role
ALTER DEFAULT, SET ROLE, membership grant or SECURITY DEFINER operation.

The LOCAL-ONLY platform fixture installs these captured managed defaults as
part of its platform simulation (where the synthetic engine's bootstrap role
has the needed authority). It must never be applied to hosted managed schemas.
The application baseline still replays `postgres`-owned defaults and all
existing-object ACLs, policies and RLS exactly as before. The source catalog and
historical migrations remain immutable; only the generated application and
local-platform artifact hashes are refreshed.

This preserves the full future-object contract rather than pretending explicit
grants on existing objects replace it. Nine focused real PostgreSQL/PGlite tests
reproduce the original permission error; run the exact new assertions under a
NOSUPERUSER/NOBYPASSRLS non-member with zero catalog mutation; reject missing,
extra PUBLIC, browser grant-option and broadened global grants; compare existing
object ACLs/RLS; create synthetic future tables/functions/sequences under both
creator roles; and verify later service-only table/RPC grants and RLS.

The local platform deliberately does not give its managed-role fixture
superuser rights. Only the future-object test temporarily grants local schema
CREATE/USAGE to model the real platform creator, then revokes it. No such grant
is in the generated application baseline or sent to Production.

The prior seven Auth/signup tests and Phase 2D database/server tests must also
pass. Full normalized structural comparison must remain zero. This repairs the
specific default-privilege blocker; a complete hosted restore and Phase 2D
persistence/concurrency still need a separately authorised temporary branch.
No hosted verification is claimed by this local/read-only audit.

## Validation of this repair

- `npm test --prefix infra/preview-baseline`: 13/13 schema gates, 54 tables /
  31 functions at the historical snapshot, zero structural mismatches, artifact
  integrity/credential checks pass, PR84 compatibility applies, 36/36 workflow
  tests (nine default-ACL, seven Auth/signup, 20 existing workflow tests).
- Current Production metadata versus corrected baseline **plus the approved
  PR84 migration**: 55/55 public table ACL/RLS/forced-RLS contracts, 35/35 public
  function ACL/owner contracts and the public schema ACL match exactly. This
  is read-only metadata comparison; no future object was created in Production.
- Phase 2D real database/server suites: 32/32 pass on corrected baseline.
- New test lint and JavaScript syntax checks pass. Generator retains only the
  same two pre-existing CommonJS import lint findings on untouched lines 2–3.
  Application TypeScript/TSX and the Phase 2D migration are unchanged, so no
  unrelated TypeScript/UI recertification was run.
- No Production DDL, business-row access/write, managed-role ownership/membership
  or provider setting change. No paid branch or new hosted migration.
