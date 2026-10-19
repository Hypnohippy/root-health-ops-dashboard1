# Baseline-backed PR84 workflow verification

PR84 source: **7ec8c3e5c5998386eee17eca345163964dcfb4dc**, unchanged.

## Reproduce

`npm ci --ignore-scripts` then `npm test` in this directory. No database URL,
credentials, network service or paid environment is needed. The same GitHub CI
job runs the baseline gates, integrity checks and workflow suite.

- **13 baseline verification gates**: 54/54 public tables, 31/31 functions,
  zero normalized catalog mismatches, exact PR84 migration compatibility, empty
  schemas/data, browser grants and replay guards.
- **20 workflow/Resources/privacy/UI regression tests**: all pass, none skipped.
- Integrity checks cover all 25 historical migrations, baseline artifacts, the
  exact pending migration and **19 pinned PR84 source files**. Credential-pattern
  scans remain in place. Snapshot files have LF-normalized SHA256 hashes from Git.

## Implementation under test

`workflow/pr84/` contains exact Git source from the stated PR84 commit; it is test
input, not a deployed application or a change to PR84. The source manifest pins
each file's hash. Files use a `.snapshot` suffix to exclude test input from the
Next application build; the loader transpiles that exact content in isolation.
The original Ops workflow fixture/test style is reused, with
its hand-built schema replaced by the complete baseline.

Each data test starts a new in-memory PGlite PostgreSQL instance, restores the
catalog-derived platform contract and canonical baseline, seeds only synthetic
data, and applies PR84's exact migration. No CREATE/ALTER shortcuts patch the
database for workflow tests. The real Auth signup database trigger executes.
Synthetic account/organisation records use example.invalid addresses. A supported
stored `enterprise` plan is used; the real application maps it to public `team`.

The real route handlers, tenant membership/write-role checks, recommendation and
generation-input logic, organisation profile logic, allowance/count/logging logic,
audience projection and renderer execute. A small Supabase transport adapter
translates the used query-builder operations into parameterized SQL and executes
server operations inside transactions using **SET LOCAL ROLE service_role**.
RPCs execute their real PostgreSQL function bodies. SQL triggers, row locks,
constraints, uniqueness, FKs, RLS and grants are never mocked.

Substituted boundaries are HTTP/Next request/response transport, authenticated
session user lookup and OpenAI's external response/failure/delay. The UI interaction
test substitutes fetch responses to exercise review state/error recovery. Profile,
allowance and database behavior are not replaced with canned values.

## Proven behavior

1. Pending migration preserves existing submitted request values; browser roles
   cannot access request/resource/brief tables or service RPCs.
2. Request-to-brief snapshot captures the source ID, tenant and exact source row.
   Reviewer interpretation, missing information and human-reviewed pricing remain
   separate; saving/reloading does not alter the request.
3. Anonymous, foreign-tenant, ambiguous membership and viewer writes fail before
   generation. Actual foreign request/brief/resource IDs cannot be read or changed
   under an authorized different tenant (404/null or 403 as appropriate).
4. Approval checks required context; stale edit/approval versions cannot overwrite
   current state. Stale generation claims fail without inserting a resource.
5. Approved brief invokes the existing generator, carries audience/outcomes/
   duration/delivery context, produces the eight-layout contract, persists private
   presenter guidance and links request -> brief -> resource and resource -> brief.
6. Reload/repeated generation returns the same resource. Concurrent requests allow
   one generator call/resource; interrupted/failed claims recover deliberately;
   late completion cannot create another resource.
7. Immutable source trigger rejects changes to source snapshot, source request,
   tenant and creator. Composite tenant FK rejects cross-tenant linkage independently
   of route checks. No source inference or names/text matching is used.
8. Audience API uses an allowlist and excludes script, timing, facilitation, internal
   facts/recommendation/pricing and unknown private fields. Presenter response retains
   guidance. All seven audience layout variants render without private content.
9. Standalone Resources create/load/edit/rename/duplicate/delete remain compatible;
   foreign sequence/resource writes fail. Stored artwork URL and selected image source
   survive the audience projection; no actual Storage upload is simulated as a pass.
10. Real profile reads and plan lookup feed generation; real usage SQL records one
    presentation-generation entry. Database signup trigger creates owner membership.
11. Review UI disables dirty generation, shows server failure and recovers to the
    linked resource. Presentation pages avoid hydrating private browser-cache data.
12. Public intake ignores caller tenant selection, preserves raw submitted payload,
    binds to the server-configured owner and appears in that tenant's admin reads.

## Hosted boundary and PR84 decision

| Area | Existing Production behavior | PR84 change / local proof | Minimal post-migration check |
| --- | --- | --- | --- |
| Auth service/JWT/cookies | Existing sign-in/session infrastructure; not reimplemented | Session identity is substituted locally; real tenant authorization executes | Use an ordinary authenticated owner session; a foreign/anonymous request must fail |
| Managed Storage/upload/public asset delivery | Existing Resources PNG bucket/upload workflow | Ownership gates and audience projection are covered locally; actual object upload isn't | One owned synthetic PNG upload/open; foreign-resource upload denied; no need to re-provision Storage |
| PostgREST/schema cache/roles | Existing service transport and DB roles | Real SQL/RPC/grant behavior passes, but PGlite is PG18.3 and Production is PG17.6 | Confirm exact migration/objects/grants installed and RPCs available through the real service client |
| External generation/provider | Existing standalone presentation generator/provider | Same PR84 handler, real plan/profile/usage, controlled external response | One controlled approved brief generates once with the real provider; verify reopen reuses resource |
| Browser/deployment/runtime | Existing Resources pages and app deployment | Data contracts/React state/privacy pass; no claim of a hosted responsive-browser pass | Open synthetic brief, presenter/audience and source links; desktop/mobile controls/overflow check |
| Public intake owner config | Existing public submission | New explicit server-owner binding proven locally | Verify PROPOSAL_REQUEST_ORGANISATION_ID identifies the intended owner; one synthetic submission cannot override it |

Neither Supabase's unchanged Auth service nor unchanged Storage infrastructure
requires a second paid project merely to retest it. This suite does **not** claim
hosted JWT validation, real HTTP PostgREST, managed service version compatibility,
actual image upload, provider output quality or deployed browser responsiveness.
These are controlled deployment smoke boundaries, not missing database mocks.

Before PR84 moves forward, review its unchanged implementation and the pending
Production rollout. A separately authorized controlled migration must apply **only**
20261019120000_solution_brief_foundation.sql to Production, never this empty-install
baseline or local-platform.sql. No such authorization or migration is executed here.
Validate target/backup/recovery procedure, request ownership configuration and no
automatic legacy ownership backfill. Existing unowned requests stay unowned.

After the approved migration/deployment, use one clearly synthetic request only:
submit -> owner admin -> brief -> edit/save/reload -> approve -> generate -> reopen;
confirm original request unchanged, one linked resource, source links, private
presenter/audience separation and a negative foreign-tenant access check. Include
one standalone synthetic resource CRUD/PNG check and desktop/mobile visibility.
No client send, real contact data, bulk cleanup, Campaign/Publishing action or
automatic ownership repair is needed. This small real-service smoke is required
before declaring PR84's deployed workflow verified; it is not part of PR85's
baseline merge gate. Synthetic cleanup should preserve FK order and normal audit
history; do not promise hard deletion of immutable/source-linked records.

PR85 can be reviewed independently when its local/CI baseline and workflow gates
are green. Its canonical schema SQL, historical migration ordering and PR84 source
remain unchanged by this test extension. No Production changes, paid branch or
merge are performed.
