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

The first opener now acknowledges the real connection, uses the saved name, references recorded context when available, explains tentative relevance from the tenant Growth Profile and asks one natural question. Aim: 60-110 words; quality gate: 45-140 words, exactly one question, correct supplied name, recorded role/company term where available, no fake prior dialogue/hard pitch. Sparse records never acquire invented roles/company facts.

Day 3 is follow-up 1: actual earlier outbound, one useful thought/angle and a low-pressure question. Day 7 is follow-up 2: shorter concrete profile-supported angle and an optional brief conversation. All later cadence stages retain their established intent. Unknown stages are not guessed. Replies, nurture and advanced relationships keep separate rules; eligibility and lifecycle overrides remain authoritative.

Absolute cadence dates, external send evidence, receipt preservation, intake, acceptance dedupe, replies stopping cadence, Growth Profile tenant isolation and manual sending are unchanged. No migrations, Production writes, workers or trigger/cap changes.

## Review gate

Keep this PR draft. Review unsaved Preview examples for at least three real contacts and Day 3/Day 7 before merge. Never fabricate historical sends or change live cadence state to expose a test stage. If no real due stage is available, use explicitly labelled generation-only examples with actual recorded outbound history, outside the live queue, and disclose that limitation.
