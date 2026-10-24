# Attempt-five function indentation: local proof and bounded comparison

## Exact definitions and differences

The affected functions are:

```sql
public.commit_reviewed_relationship_decision(
  p_org uuid, p_actor uuid, p_key uuid, p_snapshot text, p_payload jsonb
) RETURNS jsonb
public.relationship_review_snapshot(p_org uuid, p_actor uuid) RETURNS text
```

Neither function exists in the original 31-function captured baseline. Both are
introduced by the unchanged `supabase/migrations/20261023193032_reviewed_identity_decisions.sql`
(CREATE statements at lines 36 and 24 respectively). They must not be attributed
to the baseline generator or its original Production catalog.

`workflow/fixtures/hosted-function-indentation.json` preserves the two expected
local catalog records and the two attempt-five rendered catalog records. Expected
means fresh canonical baseline plus the reviewed Phase 2D migration. Actual means
attempt-five `source/catalog.sql` (`pg_get_functiondef`, identity, owner, effective
ACL), captured from the SQL Editor's result cell using `innerText`. The original
external capture is `outputs/phase2d-hosted5-post-catalog.json`; its branch
`uhqcbowqpiziviyhlpiy` has been deleted. The fixture contains schema metadata only.

The first definition has **69 changed lines**, the second **2**. Each change is a
leading run of **2–5 U+0020 spaces (UTF-8 0x20)** becoming **one U+0020 space**.
There are no tabs, CR bytes, trailing-whitespace changes, changed line counts,
changed non-whitespace characters, or differences in the remaining catalog
fields. Both captured definitions use LF. Every exact line number, prefix byte
count, unchanged suffix and minimal diff is in `FUNCTION-INDENTATION-DIFF.md`.

## Pipeline and limits of attribution

1. The Phase 2D migration contains the multi-level indentation. Existing source
   catalogs and generated baseline SQL contain neither new function.
2. The local test builds the versioned platform contract, canonical baseline and
   exact migration. It explicitly supplies an LF transport in memory; it never
   rewrites a migration or source capture. PostgreSQL returns the expected
   `pg_get_functiondef` definitions exactly.
3. Recreating each function from the rendered hosted definition returns that
   definition exactly too. `prosrc` retains its indentation. Thus local PostgreSQL
   neither strips indentation on CREATE nor canonicalizes body indentation when
   deparsing. The dollar-quoted body is retained, while the wrapper is deparsed.
4. JSON decoding/encoding preserves these spaces. The old comparator input is
   already single-indented before comparison. Its CRLF rule changes neither of
   these LF-only inputs. Comparator extraction is not the source of the loss.
5. Replacing repeated spaces with one space reproduces both captures exactly.
   That is **not** proof that the editor submitted altered SQL: the evidence was
   read via rendered `innerText`, not a raw `prosrc`/downloaded JSON transport.
   Rendered-text whitespace collapse and editor transport cannot be distinguished
   retrospectively from the retained artifact. A local browser reproduction was
   unavailable because its localhost endpoint could not be reached. No external
   tunnel, hosted query or new branch was used to work around that limitation.

**The precise transport step remains unproven.** Do not describe a confirmed
Supabase editor bug or claim these artifacts are raw hosted body bytes. Future
hosted verification must retain a lossless raw export (or an encoded metadata
transport) as well as comparison results, so that literal whitespace cannot be
lost by the capture itself. This local change does not recertify the deleted
branch's transport or complete the outstanding hosted advisor review.

## Semantic-equivalence evidence before changing comparison

Local PostgreSQL replay of both pairs confirms equality of identity, argument
names/modes/types, all-argument types, return type, language, volatility,
strictness, parallel setting, leakproof flag, security-definer flag, SET config,
owner and ACL. The functions compile in the real canonical schema. `prosrc` and
deparsed body text are the only changed attributes.

The only changed bytes precede code or the opening quote/comment delimiter; they
are outside literal/comment content. A lexical scan normalizes those prefixes
and yields identical complete definitions. It consumes quoted strings (including
E-escapes and doubled delimiters), quoted identifiers, nested dollar literals,
line comments, nested block comments and complete identifiers. Consequently
literal values, identifiers, dynamic SQL text, comment content, tokens, statement
ordering and control flow are identical. Newlines are retained: PostgreSQL's
newline-sensitive adjacent-string concatenation has a separate executable
regression. This proof is local replay of the exact artifacts, not an invented
post-deletion hosted metadata read. Attempt five separately passed all 13 hosted
workflow groups and the explicit concurrency/lock tests before comparison stopped.

## Small comparison-only repair

`functionCodeIndentation` operates only on the outer dollar-quoted **PL/pgSQL
body** of a catalog function. At a code line start, it consumes spaces/tabs before
the next token. It does not normalize blank lines, trailing spaces, wrapper SQL,
function attributes or non-function SQL. It copies every protected lexical token
verbatim; indentation before an opening quote/comment is outside that token,
while indentation *within* one remains strict. Unsupported languages, incomplete
quotes/comments/dollar literals, and ambiguous plain-string backslash syntax
fail closed and return the original definition.

This is not generic trim/dedent, a whole-definition whitespace regex, or permission
to collapse rendered SQL text. Existing body-code CRLF compatibility is retained.
Owner, ACL, security, configuration, return types and signatures still use the
same strict comparison. No capture, migration, generator, grant, RLS state or
runtime feature is changed.

## Regression coverage and boundary

The new suite covers both exact artifacts and pre-repair rejection, explicit
PostgreSQL metadata replay, code indentation/CRLF compatibility, protected plain
and escaped strings, quoted identifiers, dynamic SQL, nested dollar literals,
nested/line comments, tokens, statement order, meaningful newlines, literal tabs,
trailing whitespace, owner/grants/security/configuration/signature/return type,
volatility, malformed/ambiguous quoting and unsupported languages. The original
CRLF suite remains included. Existing baseline consumers run through `npm test`.

No new branch, Production access, migration change, UI/runtime change, hosted
attempt six or merge is authorised by this local repair.

## Validation result

- Pre-repair comparator loaded directly from HEAD `9e027ad`: one definition
  mismatch for each exact pair. Repaired comparator: zero for each.
- Focused comparator suites: **36/36** (27 new tests plus 9 existing tests).
- Complete baseline command: **13/13 schema gates**, integrity/hash/credential
  checks pass, **72/72 workflow/security tests** including those 36.
- Phase 2D DB/server suites: **33/33**.
- Saved attempt-five post-migration capture: **55 tables / 33 functions**, zero
  normalized relevant catalog mismatches using the repaired comparator. This is
  an offline comparison of retained evidence, not a new hosted run.
- Three changed JavaScript files: syntax checks and targeted ESLint pass.
  `git diff --check` passes. Existing comparator consumers were all rerun by the
  complete baseline command. No application TypeScript changed.
