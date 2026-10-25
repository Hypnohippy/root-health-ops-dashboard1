# Final-review comparator blocker and local repair

## Reproduction before editing

At `c3f73266e7a9d2644d0531cfe813f5a99e23bad3`, the exact final-review probe
returned **zero comparator mismatches** for functions with different executable
results. A fresh local PostgreSQL/PGlite database executed both definitions:

```sql
CREATE OR REPLACE FUNCTION public.review_literal_probe()
 RETURNS text
 LANGUAGE plpgsql
 SET standard_conforming_strings TO 'off'
AS $function$
BEGIN
 RETURN 'first\'
  middle\'end';
END;
$function$
```

The physical newline after the first escaped quote is CRLF in one definition
and LF in the other. The values are respectively `"first'\r\n  middle'end"` and
`"first'\n  middle'end"`. This is executable data, not formatting. The permanent
`workflow/function-fail-closed.test.mjs` contains the exact strings and executes
both functions, asserts both results, then requires the comparator to distinguish
them. Running that same test against the saved pre-fix comparator gives **0/1
pass**, failing at its difference assertion. After repair it passes.

## Exact failure mechanism

The old composition was
`functionCodeIndentation(functionLineEndings(original))`. The first scanner
treated plain-string backslashes as ordinary characters. With standard strings
off, the two backslash-escaped quotes in the probe are inside one literal. The
scanner instead treated them as the end/start of two literals and converted the
physical CRLF between them as if it were code. The second scanner detected an
unsupported plain-string backslash, but its fallback returned its **input**, which
had already lost the literal CR. Protected spans were therefore rediscovered on
transformed text. Its fail-closed guard could not restore the original bytes.

## Correct ordering and narrower grammar

One shared classifier now reads the original prefix and body without rewriting
either. It records original code/protected spans. It recognizes complete plain
and E-escaped strings, doubled quotes, quoted identifiers, nested dollar-quoted
literals, line comments, nested block comments, complete identifiers and numeric
parameters. Dynamic SQL literal contents remain opaque protected text.

Only after **complete successful classification** does a separate renderer:

1. convert CRLF pairs in code whitespace to LF;
2. remove line-leading spaces/tabs in PL/pgSQL code whitespace, preserving blank
   lines and final trailing indentation.

Every protected span is copied exactly. A line comment ends *before* its newline;
that delimiter is code whitespace, while comment text is strict. Block-comment
internal CRLF is protected and no longer normalized. Whitespace preceding an
opening quote/comment is outside that protected token. Wrapper SQL, attributes,
signatures, result types, SET values, owners and grants are never rendered.

Any classification failure returns the **entire original definition**, not a
partially transformed prefix. This applies equally to the standalone EOL and
indentation helpers and the combined comparator entry point. The comparator no
longer composes independent mutating passes.

Support is deliberately narrower: only PL/pgSQL, valid supported outer delimiters,
and completely classified bodies can normalize. Unknown languages, incomplete
quotes/comments/dollar literals, Unicode escape/custom UESCAPE forms, unsupported
dollar tags, bare code CR and odd plain-string backslash runs remain strict.
Even plain-string backslash pairs have identical quote boundaries with standard
strings on/off; their bytes are retained. E-escaped strings are classified
explicitly. Prefix classification prevents a quoted config/default value from
impersonating an outer AS marker or language line. This is bounded lexical
classification, not a claim to validate every SQL/PLpgSQL program's grammar.

## Evidence and regression scope

The exact final-review reproduction now reports **one mismatch**, with neither
helper changing the ambiguous definition. PostgreSQL still returns the two
different values. The original 36 comparison tests remain green, including both
exact attempt-five functions, the safe 85-CRLF fixture and executable indentation.
The 34 new tests exercise the probe, late ambiguity/no partial changes, supported
paired backslashes, unsupported languages/forms, literal/dynamic-SQL/comment
contents, quote/comment-like characters in strings, token/order/numeric/string/
identifier changes, function attributes and owner/ACL/config/signature/result.

Attempt six remains valid for the exact hosted definitions it tested. Its
checksum-verified lossless exports are re-compared offline under this narrower
rule: baseline **54 tables / 31 functions**, post-migration **55 / 33**, zero
normalized mismatches. No new hosted run or branch is part of this repair.

No migration, capture, generator, manifest, application code, clock policy,
identity rule, grant, RLS setting, provider, UI or Production object changed.

## Validation

- Before: exact permanent PostgreSQL regression **0/1 pass**, incorrect equality.
- After: focused comparator suites **70/70**, including **34 new** tests.
- Complete baseline: **13/13 schema gates**, integrity/hash/credential checks,
  **106/106 workflow/security tests** (includes the 70 focused tests).
- Phase 2D DB/server: **33/33**.
- Changed JS syntax, targeted lint and diff checks pass.

Recommendation: Comparator blocker is resolved locally. PR #101 should undergo
final technical review again. No additional hosted branch is required unless the
final reviewer finds a hosted-dependent issue.
