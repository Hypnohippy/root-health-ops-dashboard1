# LinkedIn capture name repair

Capture resolves names from the selected organisation's existing LinkedIn inbox,
growth target and recommendation records using the exact canonical profile.
Conflicting stored names require manual entry. With no stored name, only a simple
two-part slug (optionally followed by recognised credentials and a numeric ID)
produces an editable, explicitly unverified suggestion. LinkedIn is never fetched.

Saving requires a name and explicit acceptance confirmation. A repeated capture
can fill an existing blank name only; a compare-and-set guard preserves a name
added concurrently. It never replaces a non-blank name or changes acceptance,
send, contact or provenance fields. Recommendation and accepted cards reference
the existing Responses record, rather than creating another relationship.

## Existing-record dry run

Run `node scripts/linkedin-nameless-dry-run.mjs <organisation UUID>` in a server
environment with the existing Supabase credentials. The script selects only,
paginates all inputs, and prints proposed names and the basis for each proposal.
It has no apply mode. Do not commit credential files or the contact-level output.

Root organisation read-only Production audit on 12 October 2026:

| Result | Count |
| --- | ---: |
| Nameless accepted connections | 6 |
| Trusted existing name | 0 |
| Conservative slug suggestion (unverified) | 5 |
| Manual review required, no candidate | 1 |

No repair has been applied. After the user approves the contact-level dry run,
perform a controlled one-off name-only repair of approved IDs. Recheck each
record is still nameless and still matches the approved canonical profile before
writing. Compare the original blank/null value on update to prevent overwriting
another user's correction. Do not update raw evidence, profile/identity, source,
acceptance timestamps, manual completion, contacted state or outbound state.
Leave the unresolved record untouched for manual review.

Both first-message generators reject missing names before calling OpenAI.
Follow-up, reply, cadence and send eligibility rules are unchanged.
