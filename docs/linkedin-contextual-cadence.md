# Contextual LinkedIn cadence drafting

Base: `39f1b4098ebed6e10dbdeca8c69c9b624548418f`.

## Cause and repair

Day 3 intent explicitly instructed the generator to acknowledge that the recipient might not have seen the previous message. The Console already supplied actual outbound evidence, but this instruction turned a hello into an unanswered request. Follow-up outputs had no language validator.

The Console now treats the exact latest verified outbound as primary conversational evidence. A pure draft policy records lexical question/request cues, distinguishes hello-only text, and provides stage-specific next-turn rules. Cues are not proof that a reply was owed. Role context remains secondary; company alone does not establish remit. Missing or mixed pasted history returns a visible generation error and leaves manual editing available.

A deterministic gate rejects chase/cliche variants, invented recipient statements, invented prior questions, early pitches/meeting asks and invalid Day 3/7 question counts. It corrects once through the existing two-attempt provider loop; another invalid output returns the existing editable error. It never strips phrases. This gate cannot prove every semantic claim; authenticated output review remains required.

Day 7 deepens the actual subject, Day 14 offers a grounded observation, Day 28 explains verified sender relevance and Day 42 closes without guilt. None may invent a recipient reply. Existing queue suppression remains authoritative and unchanged.

Legacy canned follow-up suggestions defer to the same Console rather than bypass the policy with a second stock sequence. Growth Today explicitly opens LinkedIn Outreach instead of showing an empty suggestion/Copy control, preserving the current organisation URL parameter.

## Boundaries

No change to Day 0 strategy, cadence dates, queue eligibility, revision recovery, send reconciliation/confirmation, reply suppression, Truth, identity, schema, provider/model/settings or external send behaviour. No send actions are part of verification.

## Automated verification

- 48 new contextual drafting tests.
- 313/313 tests across all 13 `tests/linkedin-*.test.mjs` suites plus `contact-lifecycle` and `lifecycle-responses`.
- TypeScript passes; targeted lint passes for changed API/library/test files.
- Growth page lint: nine pre-existing errors in both base and current, identical rule/message signatures; no additional errors.
- `git diff --check` passes.
- An additional legacy `lifecycle-control` run encountered its existing strict VM fixture's missing `@/lib/linkedinSendEvidence` dependency. Its production modules are unchanged; no unrelated fixture repair included.
- The capture suite fixture now states its existing catch-up mode explicitly and returns valid catch-up wording; production Responses code is unchanged.

Authenticated Preview results are recorded in the PR after verification. Until then, do not treat generated examples in unit fixtures as live evidence.

## Preview finding

The first authenticated Day 14 generation claimed an approach “we’ve seen help organisations” without outcome evidence in the supplied outbound. The policy now rejects unsupported witnessed-outcome/client-result wording and retries as a practical idea. This adds a regression for that exact observed failure.

Fiona’s live state on 22 October has advanced to Day 7, with a confirmed action at 09:26 UK and next due 25 October 13:52:53 UK. She is not currently eligible. Do not change dates or force queue inclusion to manufacture a positive live Day 3 test; the exact recorded Day 0 remains covered by the deterministic API/validation fixture.
