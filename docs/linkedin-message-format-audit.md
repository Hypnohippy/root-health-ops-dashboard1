# LinkedIn message-format audit

## Proven regression

- `5f05bed` originally asked for a naturally acknowledged accepted connection, grounded relevance and a low-friction conversation, with separate first-message, follow-up, inbound reply, nurture and warm-opportunity rules.
- `767b9f90ae3da19af758e32442e9ca5f94197f53` replaced that first-message objective with a hello that saved questions for later stages. It added a 300-character ceiling and a validator rejecting questions and natural context phrases.
- `2c982c1` made literal recipient context optional; `3ba39505a095ed32c302294d99d839e313fe730a` favoured sender-side context and explicitly prohibited questions, product explanation and thanks for connecting. Its short hello example was later removed, but those restrictions remained.
- The outreach console adopted these shared `responseDraftRules` and `safeLinkedInFirstMessage` rules. Its bounded-generation repair (`09a8bb1`) retries with at most 240 characters and no question. Consequently the model can only fit a short hello plus sender work area. The Kate example is consistent with these live rules; it is provider-generated copy, not a nameless fallback.
- `769bc11` restored absolute cadence timing and tenant profiles, but retained the first-message restrictions. The shared `contextualOutreachDraft` fallback also returned a brief sender description/hello; it is used by follow-ups-due, not by the console generate action.
- PR #57 only corrected saved name handling and acceptance-reference presentation. It did not introduce the short-copy policy.

## Active paths and repair

1. Outreach console -> POST `/api/growth/linkedin-console`, action generate -> verified queue/contact/history -> tenant Growth Profile -> OpenAI -> shared quality gate -> editable message. No draft persistence or sending.
2. Responses AI Suggest -> POST `/api/ai/root-coach` with inboxItemId -> verified interaction/lifecycle/contact context -> tenant messages -> OpenAI -> shared quality gate -> editable suggestion. No sending.
3. Growth pack uses `cadenceIntent`; follow-ups-due uses `contextualOutreachDraft`. The stage intent/fallback are aligned without changing discovery, scheduling or records.

The first opener now acknowledges the real connection, uses the saved name, references recorded context when available, explains tentative relevance from the tenant Growth Profile and ends naturally without a question or CTA. Aim: 60-110 words; quality gate: 45-140 words, no question marks, questions or CTAs, correct supplied name, recorded role/company term where available, no fake prior dialogue/hard pitch. Sparse records never acquire invented roles/company facts.

Day 3 is follow-up 1: actual earlier outbound, one useful thought/angle and a low-pressure question. Day 7 is follow-up 2: shorter concrete profile-supported angle and an optional brief conversation. All later cadence stages retain their established intent. Unknown stages are not guessed. Replies, nurture and advanced relationships keep separate rules; eligibility and lifecycle overrides remain authoritative.

Absolute cadence dates, external send evidence, receipt preservation, intake, acceptance dedupe, replies stopping cadence, Growth Profile tenant isolation and manual sending are unchanged. No migrations, Production writes, workers or trigger/cap changes.

## Review gate

Keep this PR draft. Review unsaved Preview examples for HR/People, partner/referrer, HR consultancy, education and care/health contacts, plus a real Day 3 and generation-only Day 7 when no live target exists before merge. Never fabricate historical sends or change live cadence state to expose a test stage. If no real due stage is available, use explicitly labelled generation-only examples with actual recorded outbound history, outside the live queue, and disclose that limitation.

## Corrected recipient framing

A shared drafting-only classifier selects the reason-for-connection framing from recorded role/company/sector/context. It distinguishes HR buyers, complementary partners/referrers, HR providers serving client organisations, education, care/health leadership and uncertain fit. Categories do not establish buying intent or alter lifecycle. The generator writes naturally from actual recipient facts and this tenant Growth Profile; sparse context remains neutral. First messages never ask for priorities, thoughts or a meeting. Day 3 and Day 7 retain their distinct question/soft-invitation rules.

The no-question/no-CTA first-message constraints are shared trusted system policy in both active generation paths. Recipient/profile/history JSON remains untrusted data. Preview diagnostics confirmed the initial stricter outputs were rejected for prohibited wording (75/77 words), rather than length or busy-state failure. The system policy produced a compliant unsaved HR-context opener. Temporary rule/count diagnostics were removed; they contained no names, post/message text or secrets. The expanded five-category and follow-up example gate remains pending where real recorded context or eligible history is unavailable.
