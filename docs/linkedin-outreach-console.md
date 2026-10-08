# LinkedIn Outreach Console

Route: `/dashboard/responses/linkedin`, linked from Responses and the dashboard's New LinkedIn connections card. Existing inbox and inbound reply workflows remain intact. An inbound attention banner is above outbound cards.

The queue is a read-only view of `buildContactLifecycle`, with `planManualCompletion` eligibility and existing due dates. It does not persist another lifecycle. Each batch contains up to ten contacts. Overdue follow-ups precede first messages; recorded leadership role matches then precede other first messages. Dates and stable contact identity break ties. No AI score is created.

Fresh means acceptance/detection within the last seven days, inclusive; older, missing or future acceptance timestamps use catch-up wording. A first message requires a recorded acceptance and verified LinkedIn identity so existing reconciliation can create/reuse the cadence safely. Missing identity and unreconciled legacy follow-ups are counted separately with a Growth reconciliation link. Follow-ups require a canonical growth action and actual projected due status. Replies, engagement, closure, nurture, source-owned actions, explicit next-step overrides and invalid lead quality suppress outbound work.

Generation reuses `responseDraftRules`, `safeLinkedInFirstMessage`, organisation generation context and the existing Responses model. It identifies the actual growth stage and recorded history, adds catch-up timing rules, and checks revision again after generation. Drafts remain in the current card until skipped, completed or the page is left. Generation errors allow manual writing; no draft persistence or provider sending is implied.

Open & Copy opens the stored validated HTTPS LinkedIn messaging URL, falling back to recorded canonical profile evidence, and copies the current edited text. The new tab is opened within the user gesture to avoid clipboard-await popup blocking. Clipboard errors preserve and select the text for ordinary copying. Missing destinations never generate an invented conversation URL. Navigation, copying, generation and skipping have no lifecycle mutation path.

Mark sent & next is explicit human confirmation of the actual provider send. It records the click time and edited message using `completeManualAction`, its revision lock, atomic `record_manual_completion` RPC, persistent receipt history and reconciliation. Retry reuses the same receipt, timestamp and message. The server checks queue eligibility again before a new completion, including human replies. Successful confirmation moves to the next card without page navigation; reconciliation errors stop the flow and instruct safe reload. No new migrations or cadence intervals are introduced. Existing main uses weekly follow-ups despite historical day-number stage labels; this implementation preserves that actual behaviour.

Tenant write membership is verified before snapshot reads, generation or completion. No LinkedIn sending API, scraping or LinkedIn browser automation is implemented. The human must paste and click Send in LinkedIn before Mark sent. Browser popup/clipboard permissions may require the displayed manual fallback controls.

Only captured Ops records are available. Intake remains unchanged and can miss connections. Sessions remember skips only while the page is open. A new batch retains the view; a separate control includes skipped contacts again. The console conservatively excludes ambiguous or source-owned records rather than silently changing their lifecycle.

## Validation environment

Based on current main `faf6323bb36eb13543dacc575ea73fb0d821a4fe` in an isolated checkout, preserving unrelated acquisition edits in the user's saved Ops project. Untouched main security suite: 257 tests, 246 pass, 11 fail. Existing failures concern cadence/draft expectations, email fixtures, and a manual-acquisition import missing from the tenant-generation test harness. The dashboard-link assertion is updated for the new required destination. New tests cover queue, clipboard, completion/reconciliation, catch-up prompt, revision races, receipt retries and tenant authorization. Existing SQL completion regressions exercise atomicity and idempotency.

Local build compiles and type-checks but cannot collect page data without Supabase environment variables. The branch Preview build must validate against the project's actual Preview configuration. No production deployment or merge is authorised by this task.
