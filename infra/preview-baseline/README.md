# Root Ops reproducible Preview baseline

Infrastructure snapshot of Production schema metadata on 19 October 2026, main
`702f2b7ab1ac2a41ca6e8c320fdcc138417e7077`, before PR84
`7ec8c3e5c5998386eee17eca345163964dcfb4dc`. No feature implementation changes.

## Safety and scope

This is a **new, empty, isolated database** installation path. Never apply it to
Production, a populated schema, or as an incremental upgrade. It deliberately
preserves current schema/security behavior, including the four known RLS-off
tables and broad legacy grants. Do not expose an isolated instance containing
real data; use synthetic data only. The separate `SECURITY-REMEDIATION.md` plan
contains proposed fixes, none executed here.

No Production DDL, DML, migration repair, Auth setting, environment variable,
business-row read, credential export, paid branch or merge is part of this work.
The catalog SELECTs are committed under `source/`; bucket IDs/MIME/limits/public
flags are declarative configuration, the only records included. No users,
password hashes, provider tokens, Storage objects, business rows, migration
ledger rows, sequence current values or Vault contents are included.

## Reproduce locally

With Node 22 and npm, from this directory:

```sh
npm ci --ignore-scripts
npm test
```

PGlite is pinned to **0.5.8**, with a separate lockfile; application dependencies
are unchanged. The verifier accepts no connection URL and performs no network
operations. It starts an in-memory empty PostgreSQL database, installs the
versioned managed-platform SQL contract, restores the canonical app migration,
compares catalogs, then applies the exact PR84 migration as a compatibility
check. A separate synthetic workflow suite then exercises PR84's pinned source
against fresh canonical databases. CI runs both paths without secrets. See
`WORKFLOW-VERIFICATION.md` for scope and hosted boundaries.

`generate.cjs` renders exclusively from catalog definitions. `integrity.cjs`
checks all 25 legacy migration checksums, the PR84 fixture, source/generated
artifact hashes, zero comparison drift, and credential-like strings.
`write-manifest.cjs` is an explicit reviewed cutover operation, never run by tests.

## Files and ordering

- `migrations/00000000000000_root_ops_schema_baseline.sql`: canonical application
  snapshot, including app-owned Auth trigger, six Storage policies and two bucket
  configurations. Tables first, non-FK keys/indexes before FKs, then triggers,
  policies, owners/ACLs/default ACLs. Functions retain exact catalog bodies,
  security mode and search paths. Both generated columns and identity sequence
  options are restored; bigint sequence bounds remain strings in metadata.
- `source/catalog.json`, `extra.json`: metadata-only source of truth. Capture SQL
  is alongside it. Full function bodies are included, not inferred definitions.
- `local-platform.sql`: local verifier only, restores the captured 27 Auth and
  eight Storage table definitions, four Auth and 19 Storage functions, enums,
  managed triggers, owners/ACLs/defaults/roles. **Never install this over a real
  Supabase project's managed auth/storage schemas.** A real branch supplies them.
- `MIGRATION-ORDER.md`, `migration-map.json`: every legacy file's treatment and
  checksum. Existing root `supabase/migrations` is unchanged; its 25 files are
  superseded only for this fresh-install path, not retroactively rewritten.
- `compatibility/20261019120000_solution_brief_foundation.sql`: unchanged PR84
  migration text (LF-normalized hash), pending and excluded from the active chain.
- `verification.json`, `structural-diff.json`: reproducible SQL proof/results.

The app-owned signup trigger on managed `auth.users` is created using the
supported table `TRIGGER` privilege. For its captured normal/origin-enabled (`O`)
state, the renderer verifies the newly created trigger and function target in
`pg_trigger` instead of issuing a redundant ownership-dependent `ALTER TABLE
auth.users ENABLE TRIGGER`. A missing, disabled or differently targeted trigger
fails closed. Other trigger-state rendering is unchanged. See
`AUTH-TRIGGER-HOSTED-COMPATIBILITY.md` for the read-only Production findings,
history limits and non-owner-role regression. This resolves that specific
hosted failure; it does not certify the full hosted baseline or Phase 2D writes.

Managed `supabase_admin` defaults for future public tables/functions/sequences
are likewise platform prerequisites. The hosted application baseline **asserts**
their captured schema grants and standard global defaults; it never changes
them or impersonates the managed role. A mismatch fails closed. The local-only
platform contract seeds those same defaults to model Supabase provisioning.
Defaults owned by `postgres`, explicit existing-object ACLs and RLS rendering
are unchanged. See `DEFAULT-ACL-HOSTED-COMPATIBILITY.md` for the scope, effective
privilege equivalence and synthetic restricted-role tests.

**Retained existing subsequent migrations: 0. Superseded fresh-install
migrations: 25. Pending PR84 compatibility migration: 1.** Do not run both the
legacy root migration chain and this baseline. Future approved deltas append
after the snapshot; updating a snapshot needs a reviewed capture/manifest diff.

## Structural comparison and limits

Production is PostgreSQL **17.6**; this available local PGlite engine is **18.3**.
The comparator checks all captured objects in public/auth/storage: ordered
columns, types/defaults/nullability/identity/generated/collation, constraints,
indexes/validity, full function definitions/signatures/owners/effective ACLs,
triggers/enabled state, RLS/forced RLS, policy commands/roles/expressions,
schema/default ACLs, sequence options/ownership/ACLs, enum label order, relation
persistence/replica identity, selected role flags and bucket configuration.

Documented normalizations: catalog array ordering; SQL deparser indentation after
newlines in policy expressions and CHECK definitions; PG18's extra `pg_constraint`
NOT NULL entries, because column `attnotnull` is compared independently. Function
bodies, column order, enum order and SQL string contents are not rewritten.
Owner names and effective grants/grant options are compared; original grantor
provenance/OIDs and runtime sequence counters are not portability targets.
Function-body code indentation is compared lexically for PL/pgSQL only; literal,
comment content, wrapper SQL and security metadata remain strict. See
`FUNCTION-INDENTATION.md` for the exact attempt-five artifacts, local PostgreSQL
proof, capture-attribution limitation and negative tests. Use lossless metadata
transport for hosted evidence, not whitespace-collapsed rendered text.

Function-body code line separators may be CRLF or LF after SQL-editor transport.
The comparator canonicalizes only CRLF pairs in code inside the outer dollar-
quoted body. Quoted values/identifiers and nested dollar-quoted SQL retain exact
bytes, including embedded newlines. Bare CR, indentation, blank lines, trailing
spaces, wrapper/header/config/security text, owner and grants remain strict.
See `FUNCTION-LINE-ENDINGS.md` for the captured hosted evidence and regression
proof. Source artifacts, generated SQL and manifest hashes are not rewritten.
Engine versions and extension binaries are intentionally not compared as app DDL.
Production's extensions (plpgsql, pg_stat_statements, uuid-ossp, pgcrypto,
supabase_vault) remain managed platform prerequisites; no app catalog definition
references extension-specific functions, and core `gen_random_uuid()` is used.

Zero normalized differences is **schema proof, not hosted service proof**. This
does not run GoTrue, PostgREST, Storage HTTP, Realtime, Auth redirect configuration,
SMTP or Vercel. Role login credentials/memberships, secrets and environment config
are deliberately not cloned. Managed-platform service versions and migration
ledgers are not recreated as runtime state. An approved temporary Supabase branch
must verify the same app SQL against its actual managed platform and services.

## Optional future isolated branch, only with separate cost approval

No paid branch is required for the current local/CI verification. The backend/data
workflow is covered by the baseline-backed suite. PR84's remaining deployment
checks can use an approved controlled Production migration and minimal synthetic
smoke test, as described in `WORKFLOW-VERIFICATION.md`. The following is an optional
future infrastructure path, not a prerequisite or authorization to create a branch.

1. Keep data copying disabled; branch bootstrap may still fail because the parent
   ledger is incomplete. Confirm the target is isolated and inspect it rather
   than layering patches over partial app DDL.
2. Supply the target's normal managed schemas/roles. Use this app baseline only
   after confirming public app schema is empty and platform contracts compatible.
   Explicit session opt-in is `SET root_ops.empty_preview_baseline = 'on'`.
   The SQL rejects absent opt-in, existing app objects or nonempty bucket config;
   do not bypass these guards. No network restore runner is included in this PR.
3. Compare its metadata with `source/`; stop on unexplained differences. Apply
   PR84's exact pending migration only to that isolated branch.
4. Configure branch-owned URL/keys/service secret, synthetic password account,
   Preview callback/site URLs and Preview-only intake organisation. Use the real
   signup trigger's organisation/membership; seed a supported synthetic plan,
   profile, proposal request and resource separately. No live provider accounts.
5. Run the authenticated PR84 workflow and remove the paid branch immediately
   after evidence capture. No branch is created or billed by this build.

This repository change **does not repair native dashboard branch creation**.
Supabase's dashboard replays the parent project's stored migration history;
its single recorded function entry still cannot build the app schema. A separate
approved ledger reconciliation is needed to change that behavior. Merely marking
versions applied does not supply missing CREATE statements. Never put this
empty-install snapshot through Production's incremental migration runner.

Reference: [Supabase dashboard branching schema source](https://supabase.com/docs/guides/deployment/branching/dashboard#where-a-dashboard-branch-gets-its-schema).
