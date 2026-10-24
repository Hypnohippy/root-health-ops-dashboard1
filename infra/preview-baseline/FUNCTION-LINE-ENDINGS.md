# Hosted function-body comparison

## Exact evidence

Attempt 3 (`pr101-phase2d-verification-3`, `baqqlkxvjiswsxcxsuhd`, PostgreSQL
17.11) restored the corrected baseline successfully. No PostgreSQL error occurred.
Both earlier managed Auth/default-ACL barriers passed. The captured catalog has
54 public tables and 31 application functions. Fresh assertions found every
application table empty, zero Auth users, zero Storage objects, and the two
declarative bucket configurations. The signup trigger was `O`-enabled, targeted
`public.handle_new_user_create_org()`, and `auth.users` remained owned by
`supabase_auth_admin`. Phase 2D was not applied; no test business records existed.
The temporary branch was deleted after explicit confirmation; refreshed inventory
showed only Production main. Production was never queried or mutated in this run.

Strict comparison stopped on one function definition:

```
public.apply_acquisition_action(
 p_organisation_id uuid, p_item_id uuid, p_actor_user_id uuid,
 p_expected_status text, p_action text, p_new_status text, p_outcome text,
 p_note text, p_idempotency_key uuid, p_marks_actioned boolean)
```

Expected: `source/catalog.json`, corresponding function record. Generated location:
`migrations/00000000000000_root_ops_schema_baseline.sql:1286`.
Actual: the branch SQL Editor ran the unchanged `source/catalog.sql`, which reads
`pg_get_functiondef`, identity arguments, owner and effective execute ACLs. The
exact affected metadata-only record is retained as
`workflow/fixtures/hosted-function-line-endings.json`. No business rows or secrets
are included. The full hosted capture is an external verification artifact.

The expected definition has LF; the restored body has 85 CRLF pairs. Replacing
those pairs with LF makes the entire definitions byte-identical. There are no
extra indentation, trailing-space, final-newline, quote, dollar-tag, statement or
literal differences. Signature, schema, owner and ACL entries match exactly.

`pg_get_functiondef` encodes language, return/argument types, volatility, security,
strictness, parallel/leakproof and configuration (including default attributes by
omission). The regression additionally recreates both exact definitions in a
fresh local canonical database and compares explicit `pg_proc`/`pg_language`
attributes, result/identity arguments, owner and ACL: identical except body CRLF.
This explicit attribute check is local replay of captured definitions, not a
claim of a second live hosted `pg_proc` query after deletion.

## Proven pipeline

1. Captured JSON contains LF in this definition. Most other captured public
   function bodies already contain CRLF; historical source bytes are preserved.
2. `generate.cjs` emits the captured definition verbatim except trimming its final
   deparser newline/adding the statement terminator. The emitted function body is
   LF. The overall SQL file intentionally has mixed historical/template endings.
3. `integrity.cjs` hashes whole files after its existing CRLF-to-LF transformation.
   That checksum establishes semantic artifact integrity, not exact transport EOL.
4. The existing cached branch SQL Editor was tested without executing SQL: paste
   this LF-only definition, select all, copy normally. Input had 0 CRLF/91 LF;
   clipboard had 91 CRLF and was otherwise byte-identical after EOL conversion.
   Thus the editor transport demonstrably converts EOLs before submission.
5. PostgreSQL retains body newlines in `prosrc`; `pg_get_functiondef` emits a
   canonical LF wrapper around the retained body. Local real PostgreSQL/PGlite
   replay confirms retention. It does not normalize stored body EOLs for us.
6. The verifier previously treated all function-definition text as byte-strict;
   its documented CHECK/policy formatting normalizations did not cover this case.
   This was a comparison representation mismatch, not a changed executable body.

## Bounded correction

`compare.cjs` extracts the existing comparison rules unchanged and adds only
function-record body code EOL canonicalization. It recognizes the deparser's
outer dollar-quoted body and preserves quoted SQL values/identifiers, escaped
strings and nested dollar-quoted dynamic SQL. Unsupported/incomplete quoting
stays strict. Only code CRLF pairs become LF; no bare CR, whitespace, blank line,
header, security setting, owner, grant or other schema property is ignored.

The historical capture, generator, baseline SQL, platform fixture, migrations and
manifest are unchanged. No runtime/Phase 2D/LinkedIn behavior is changed.

Nine focused regression tests cover the exact hosted record, executable changes,
whitespace/dollar-tag differences, owner/grant/security metadata differences,
meaningful quoted newlines, other structural contracts and explicit PostgreSQL
attribute replay. The standard baseline command includes them automatically.

After this local fix, a new hosted restore and all Phase 2D hosted contracts still
require a separately authorised temporary branch. No attempt 4 is authorised or
created by this repair.
