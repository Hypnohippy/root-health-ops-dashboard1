# Ops capability truth audit + repair pack 1

Audit baseline: GitHub main `56c37cad95b24de40800e91fd0652d31d27097d6` (20 October 2026). Previous Creative Phase 2 task completed as unmerged Draft PR86; its implementation is not included. Dedicated branch: `codex/capability-truth-audit-repair1`.

Update baseline: main `a351028ad9cd42ab72e7ad26473c503c5088d89d` merged into this branch after PR #88. Only the Contact Support finding and focused regression evidence were reassessed; the original audit inventory and classifications remain historical.

## Scope and evidence

Static product-truth audit, not provider/runtime certification. WORKING means an implementation exists, not a successful live send. Mechanical inventory: **38 dashboard routes, 53 supporting TSX files, 688 button/link/form/textarea elements, 428 buttons, 12 forms**. Counts are source elements, not expanded runtime instances. Three buttons without onClick are legitimate follow-ups/tracker server-action submits. A route-aware AST pass validates 121 dashboard href/path references after repair, including dynamic relationships/presentation routes; zero unmatched destinations. Import paths, comments and match prefixes are excluded. Legacy /connect and its /org-setup entry were inspected only to establish reachability. No docs/migration/infra crawl, live business queries or provider tests.

Classification totals below count the **56 meaningful facilities at audit baseline**, not all controls. BROKEN/MISLEADING findings keep their initial classification so repaired defects do not disappear from the report. Final disposition is recorded separately.

| Classification | Facilities |
|---|---:|
| WORKING | 5 |
| CONDITIONAL | 23 |
| READ_ONLY | 6 |
| PLACEHOLDER | 3 |
| BROKEN | 2 |
| MISLEADING | 6 |
| NEEDS_LIVE_VERIFICATION | 4 |
| DELIBERATELY_BLOCKED | 4 |
| RETIRE_CANDIDATE | 3 |

## Facilities by workspace

| Page / Workspace | Control / Facility | Classification | Current behaviour | Problem | Recommended next step | Repair in this PR? yes/no |
|---|---|---|---|---|---|---|
| Home | Recorded control overview / refresh | READ_ONLY | Displays recorded work and refreshes existing read models. | No live engine/provider certification in this audit. | KEEP; verify operational freshness separately. | no |
| Home | Workspace navigation | WORKING | Existing routes and attention destinations are present. | None established; busy/selection guards are legitimate. | KEEP. | no |
| Growth | Approve today’s plan / recorded actions | CONDITIONAL | Client handlers exist; organisation, review and engine prerequisites apply. | Runtime execution is not proven by a button. | KEEP; controlled runtime checks separately. | no |
| Acquisition | Review, qualify, dismiss and operational handoff | CONDITIONAL | Existing handlers preserve reviewed source/evidence boundaries. | Depends on owned records and eligibility. | KEEP; do not change lifecycle. | no |
| Acquisition | Personal reach / clicks | READ_ONLY | Explicitly displays Unavailable rather than synthetic metrics. | Data not implemented; truthful UI. | KEEP; no invented metrics. | no |
| Targets/Follow-ups | Add Target / Save Lead Quality | WORKING | Forms bind server actions; absence of onClick is correct. | None; not inert controls. | KEEP. | no |
| Pipeline | Call preparation / save outcome | CONDITIONAL | Generation and outcome handlers are present. | Owned target, valid input and generation prerequisites. | KEEP; live generation separately. | no |
| Tracker | Mark as Used | WORKING | Existing form/server action records explicit use. | None; not a missing click handler. | KEEP. | no |
| Relationships | Discovery, detail and recorded evidence | READ_ONLY | Source projections and operational destinations render existing evidence. | Static review does not establish freshness of real records. | KEEP; RelationshipTruth unchanged. | no |
| Relationships | Notes, tasks, value and retention | CONDITIONAL | Guarded explicit writes; storage/role prerequisites and retry handling. | Missing schema can legitimately lock saving. | KEEP fail-closed guards. | no |
| Relationships | Overview/Strategy AI prompts and textarea | PLACEHOLDER | Hard-disabled controls; Forthcoming / Phase 2 notice. | Relationship-aware AI is not implemented. | DEFER; do not enable or create AI. | no |
| Relationships | R1: Discuss with Root / Open Strategy Room entry copy | MISLEADING | Active links only switch to a disabled strategy preview. | Labels imply an available discussion. | Relabel as forthcoming strategy preview; no capability change. | yes |
| Relationships | Merge duplicate / Permanent delete | DELIBERATELY_BLOCKED | Disabled and explicitly unavailable/review-required. | Intentional safety boundary. | KEEP disabled. | no |
| Relationships | Relationship storage fallback | CONDITIONAL | relationshipWorkspace.server.ts catches 42P01/PGRST205 and returns storageAvailable=false. | Still reachable on incomplete schema deployments; not dead copy. | KEEP; no migration work. | no |
| Relationships | Floating Ask Root guide | READ_ONLY | RootCoach posts organisationId, route and question; allowlisted navigation/explanations. | No current person/history/evidence payload. | KEEP boundary; relationship AI separately. | no |
| Relationships | M2: guide’s generic Relationships destination | MISLEADING | guideDestination builds a list URL, even from a detail pathname. | Current person context is lost; not relationship-aware assistance. | DEFER per instruction to audit this guide only; no guide redesign. | no |
| Responses | Review, draft/approve and social dismissal/delete | CONDITIONAL | Existing handlers, confirmation and channel eligibility gates. | Provider delivery is not certified here. | KEEP; no real cleanup/sends. | no |
| Responses | Pull latest / external reply delivery | NEEDS_LIVE_VERIFICATION | Implemented handler paths with provider/runtime prerequisites. | Stored connection does not prove permissions or delivery. | Controlled provider checks outside this pack. | no |
| LinkedIn | B1: Review existing Growth relationship | BROKEN | LinkedInToConnect linked to absent /dashboard/growth/targets. | Destination has no page or redirect. | Use existing /dashboard/growth/followups and retain organisationId. | yes |
| LinkedIn | Outreach, invitation confirmation and historical send controls | CONDITIONAL | Manual confirmation workflow; queue/draft handlers are implemented. | No automatic sends; prerequisites/receipt guards remain required. | KEEP; no cadence/receipt changes. | no |
| LinkedIn | Automatic response reading/reply provider capability | DELIBERATELY_BLOCKED | Channel catalogue marks pull/reply unavailable under current access gate. | Manual evidence and outreach are distinct from provider ingestion. | KEEP gate; no provider changes. | no |
| LinkedIn | Notification rehearsal | READ_ONLY | Explicit read-only rehearsal surface. | Not an outbound/recording action. | KEEP. | no |
| LinkedIn | Conversation storage fallback | CONDITIONAL | linkedinConversation.server.ts catches missing-table errors; save UI retains text. | Legitimate runtime unavailable path. | KEEP; no schema changes. | no |
| Founder Intelligence | Saved research, source routes and explicit activity | CONDITIONAL | Protected controls and record handlers exist. | Role, evidence and owned-record prerequisites. | KEEP; no implicit promotion. | no |
| Founder Intelligence | Live discovery / external contact research | NEEDS_LIVE_VERIFICATION | Provider/service handlers exist. | Sources, credentials and external results untested. | Separate controlled verification. | no |
| Campaigns | Campaign Studio (/sequences) | WORKING | Create, develop in Brainstorm, save webinar to Resources and explicit archive/restore handlers. | No missing destination established. | KEEP as current user-facing workflow. | no |
| Campaigns | Older campaigns/new and campaign detail surfaces | RETIRE_CANDIDATE | Existing ad-variant/experiment tools overlap newer planning. | Multiple meanings of Campaign; no deletion authorised. | RETIRE CANDIDATE; map remaining users before redirecting. | no |
| Brainstorm | Generate/edit and handoffs to Publishing/Stories/Scheduled | CONDITIONAL | Explicit handlers and existing destination routes. | Generation/provider prerequisites and human review. | KEEP; currently user-facing, not an empty alias. | no |
| Publishing | Quick Blast drafting, selection and approval handoff | CONDITIONAL | Existing handlers and capability guards. | Valid media/account/input required. | KEEP; never enable provider limitations. | no |
| Publishing | Live external publication | NEEDS_LIVE_VERIFICATION | Dispatch paths exist; catalogue distinguishes availability. | No external send performed. | Controlled provider verification separately. | no |
| Publishing | TikTok Direct Post | DELIBERATELY_BLOCKED | Default page says disabled pending audit; composer requires audit gate. | Intentional provider/compliance gate. | KEEP blocked; draft/upload → finish in TikTok. | no |
| Scheduled | Review/edit/delete recorded posts | CONDITIONAL | Existing record handlers with selected-item/busy guards. | No scheduler or external dispatch certification. | KEEP. | no |
| Approvals | Approve/reject/post-now and demo actions | CONDITIONAL | Explicit handlers exist; selections/permissions matter. | Demo creation and post-now are writes, not verification shortcuts. | KEEP; do not invoke here. | no |
| Stories | Generate/edit/send/schedule | CONDITIONAL | /dashboard/stories/new is the current route. | The /dashboard/stories string in shell is a match prefix, not a bad href. | KEEP; no route repair needed. | no |
| Resources | Create/edit/rename/duplicate/delete/artwork | CONDITIONAL | Existing resource handlers and image controls. | Ownership, image validation and generation allowance prerequisites. | KEEP; PR86 creative preset is unmerged and excluded. | no |
| Resources | Presenter/audience views | READ_ONLY | Owned resource routes and audience allowlist; private guidance separated. | Presentation data is not client-send authorisation. | KEEP. | no |
| Proposal Requests | Owned request review and brief entry | CONDITIONAL | Request dashboard and source ID handoff exist. | Unassigned legacy requests intentionally not adopted. | KEEP; no backfill. | no |
| Solution Briefs | Review/edit/approve/create/reopen | CONDITIONAL | Approved brief and single linked presentation contract. | Owned source, valid recommendation and migration availability required. | KEEP; no new workflow records. | no |
| Connect | Modern connection cards and checks | CONDITIONAL | connectionPresentation/catalogue drive setup, permission truth and read-only refresh. | Connected token != verified operation. | KEEP. | no |
| Connect | Facebook / Instagram operations | NEEDS_LIVE_VERIFICATION | Publish/pull/reply all limited; separate permission verification required. | Comment read/reply permissions remain unverified. | No OAuth/scope/config changes. | no |
| Connect | LinkedIn publish and Threads publish | CONDITIONAL | LinkedIn publish limited; Threads publish available in catalogue; pull/reply unavailable. | Credential/runtime state still gates actual use. | KEEP truthful catalogue. | no |
| Connect | TikTok draft / upload handoff | CONDITIONAL | Upload draft then complete in TikTok; not confirmed publication. | Direct Post is separately gated. | KEEP manual completion boundary. | no |
| Connect | Google Business Profile operational actions | DELIBERATELY_BLOCKED | Connection may be stored; publish/pull/reply unavailable; analytics planned. | Stored credential is not posting support. | KEEP unavailable states. | no |
| Connect | Managed Email / B2B Gmail | CONDITIONAL | Catalogue supports pull/reply/discovery/outreach with human approval. | Reachability/Gmail authorization require live verification. | KEEP managed setup and review gates. | no |
| Connect | Future channel catalogue | PLACEHOLDER | YouTube, X, Bluesky, Pinterest, WhatsApp, Reddit, website, calendar and Outlook are planned. | No self-service operational capability yet. | KEEP Coming soon; do not implement. | no |
| Connect | CRM / webhooks self-service | PLACEHOLDER | Managed ingestion exists; self-service setup is not complete. | Backend ingestion does not imply a customer setup flow. | DEFER self-service. | no |
| Connect | B2: legacy /connect Email action | BROKEN | /org-setup still navigates to /connect; Email pointed to missing /dashboard/connect/email/setup. | Reachable legacy surface, no current setup page. | Route only Email to modern Connect; preserve query organisationId. | yes |
| Connect | M3: legacy Test connection / Refresh status | MISLEADING | Non-Facebook handlers only alert that tests will be added later; Facebook sends a test post. | Active labels imply implemented verification and hide send semantics. | Disable forthcoming tests; explicitly label Facebook send. | yes |
| Connect | M4: legacy Ready for posting summary | MISLEADING | Computed solely from stored connection presence. | Cannot prove publication readiness. | Rename to Connection recorded; no status/provider logic changes. | yes |
| Connect | M5: legacy provider promises | MISLEADING | Legacy descriptions advertise GBP posts and WhatsApp automation despite modern unavailable/planned states. | Two Connect surfaces disagree. | DEFER retirement/redirect decision; use modern capability catalogue. | no |
| Metrics | Recorded result entry and reporting | CONDITIONAL | Filters and manual result-save handlers exist. | Provider analytics/freshness not inferred from recorded results. | KEEP; verify provenance before adding metrics. | no |
| Admin / legacy | /connect legacy surface | RETIRE_CANDIDATE | Still reached from /org-setup; remains a legacy provider surface. | Modern /dashboard/connect has canonical capability truth. | REDIRECT CANDIDATE after separate entry-point review; no route deleted. | no |
| Admin / legacy | /content/new upload utility | RETIRE_CANDIDATE | Media upload/copy utility with a real handler; overlaps modern Publishing media workflow. | Legacy overlap, not an inert button. | RETIRE CANDIDATE; preserve until usage decision. | no |
| Admin / legacy | /growth-lab alias | WORKING | Re-exports campaigns page and is linked by shell. | Overlap is intentional; not missing implementation. | KEEP alias; no duplicate rebuild. | no |
| Admin / legacy | Cohort administration | CONDITIONAL | Create, pause and activate handlers exist. | Known authorization/RLS review belongs to separate security track. | Do not invoke or enable RLS here. | no |
| Admin / legacy | M6: Contact Support diagnostic submission (RESOLVED BY MAIN) | MISLEADING | PR #88 now authorizes membership through withTenantRoute/requireOrganisation before diagnostics or Formspree. | Original tenant/privacy defect resolved; no live provider certification claimed. | KEEP merged fix: exact supplied membership, sole verified membership when omitted, otherwise fail closed; bounded diagnostics without post body/meta/error_info. | no — resolved separately by PR #88 |

## Confirmed broken items — complete list

- **B1** LinkedInToConnect.tsx: absent /dashboard/growth/targets → existing /dashboard/growth/followups, organisationId retained. Repaired.
- **B2** app/connect/page.tsx: reachable Email action to absent /dashboard/connect/email/setup → modern /dashboard/connect, organisationId retained. Repaired.

No other broken internal destination was established. /dashboard/stories in ClientDashboardLayout is a startsWith match prefix; its actual Stories href is /dashboard/stories/new.

## Misleading items — complete list

- **R1** Active relationship discussion entry labels open only the disabled strategy preview. Repaired copy only.
- **M2** Floating Ask Root Relationships destination loses current person context. Deferred explicitly: guide audit only; no relationship-aware AI.
- **M3** Legacy connection tests promise verification; non-Facebook is an alert stub, Facebook publishes a test post. Repaired disabled/copy treatment only.
- **M4** Legacy readiness summary infers posting readiness from stored connections. Repaired label only.
- **M5** Legacy GBP/WhatsApp descriptions conflict with canonical capabilities. Deferred legacy retirement/redirect decision.
- **M6 — resolved by main / PR #88** The original tenant/privacy blocker is cleared. Exact supplied organisation requires membership; omitted organisation resolves only a sole verified membership, with no global/latest-org fallback. Diagnostics and Formspree execute only after authorization. Post text, raw metadata and provider errors are excluded. No live support request was made.

## Direct implementation evidence

- Repairs: app/dashboard/responses/linkedin/LinkedInToConnect.tsx (known Growth relationship); app/connect/page.tsx (connectUrls, handleConnectClick, ProviderCard, summary); app/dashboard/growth/relationships/components/RelationshipDetail.tsx (two strategy entry labels).
- Canonical capability truth: lib/channelCapabilities.ts, lib/connectionPresentation.ts and app/dashboard/connect/ChannelCard.tsx. Catalogue and gates unchanged.
- Ask Root: app/dashboard/components/RootCoach.tsx passes only organisationId/route/question; lib/rootCoachGuide.ts guideDestination always builds catalogue URL. No relationship evidence fetch.
- Storage fallbacks: lib/relationshipWorkspace.server.ts missing-schema branch (42P01/PGRST205); lib/linkedinConversation.server.ts missing-schema branch; client text retention unchanged.
- Direct Post: app/dashboard/publishing/tiktok/page.tsx gates AuditComposer on TIKTOK_DIRECT_POST_AUDIT_ENABLED; default UI clearly says disabled.
- Support resolution: main PR #88, commit `22b9318d9bf3bab7969675bc72d10979df09facc`, merged as `a351028ad9cd42ab72e7ad26473c503c5088d89d`. app/api/support/report/route.ts uses withTenantRoute/requireOrganisation before latestFailure or fetch. Diagnostics select only id/status/platforms/scheduled_for/posted_at/updated_at for the authorized organisation, limited to one failed post. Generic errors conceal foreign membership/provider details; browser pathname excludes query/hash. tests/support-report.test.mjs executes the real tenant helper/wrapper with synthetic database/provider boundaries. Formspree configuration is unchanged; no live support report sent.

## Verification / boundaries

Focused tests and 1280×900 / 390×844 synthetic UI checks cover only the three repaired surfaces. No shared navigation/layout modified. Provider gates, auth/configuration, RelationshipTruth/discovery, send handlers/cadence, storage and migrations are unchanged. Current feature behaviour is audited statically; live provider outcomes remain explicitly unverified. Results: **63/63 tests pass** across capability-truth-repairs, navigation-connect, relationship-workspace-ui, connect-visual-system, linkedin-invitations and linkedin-actions. TypeScript passes. RelationshipDetail and LinkedInToConnect lint clean; legacy Connect retains exactly two baseline no-explicit-any findings (zero new diagnostics). Seven send/invitation/retention-related handler bodies exactly match baseline. All three repaired surfaces pass synthetic 1280×900 and 390×844 checks: no horizontal overflow or clipped repaired controls; strategy AI remains disabled. The harness uses actual components, compiled CSS and the matching dashboard content wrapper; GET fixtures only, no credentials/database or outbound calls. Shared shell is not modified or claimed re-certified.

Post-main update verification: focused Support authorization tests and the existing six repair/regression suites were rerun: **75/75 pass** (12 Support + 63 existing repair/regression tests). git diff --check passes. No full audit or UI recertification was repeated. The merge introduced only PR #88’s two reviewed files; this follow-up edits only this audit document.

Recommendation: **READY FOR CAPABILITY TRUTH REPAIR PACK 1 REVIEW** — Contact Support security blocker resolved by main / PR #88. Deferred capability findings and unverified live provider outcomes remain as documented; no provider readiness or delivery certification is implied.
