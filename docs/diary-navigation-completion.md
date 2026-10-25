# Diary navigation and calendar completion

Base: `eb1bcc92a19aac2b9b5c1a4cadea3cfbf1e000d7`.

## Reproduced failure

In the authenticated current Production application, the primary Diary link kept Home and its URL unchanged at 374 ms and again after 13.2 seconds. By the next observation at 26.5 seconds it had opened Diary successfully. No browser error was recorded. The server page awaits tenant authorization and the complete canonical operational collection before returning; no Diary loading boundary existed. This is silent pending navigation, not a missing route or a dead click handler. The exact server response completion time lies between the last pending and first completed observation.

A route-local loading boundary now makes pending navigation visible immediately, and a generic route error provides retry without exposing server details. Canonical aggregation performance/meaning and authorization remain unchanged.

## Presentation and navigation

- Diary joins the existing Root shell, including its desktop sidebar and mobile drawer, and has its own calendar icon.
- Today retains canonical Overdue / Today / Upcoming grouping and summary values. Cards separate type, source workspace, actionability, exact date precision and source-record action. Technical provenance remains available under “Why it appears”.
- Week uses seven compact Monday–Sunday date selectors, counts/type markers and one selected-day agenda. Mobile wraps into usable rows instead of seven narrow event columns.
- Month aligns dates under Monday–Sunday headings and distinguishes selected/current date; the selected-day agenda appears below.
- Period/date/view changes use local state and the browser History API, preserving organisation and other query parameters. Popstate restores view/date. Reload initializes from the URL. No view navigation writes or aggregate re-fetches.
- Refresh remains a tenant-scoped GET and coalesces overlapping refresh events.

## Canonical boundaries

No changes to Diary, Home or Ask Root projections, lifecycle rules, identity rules, meetings/deduplication, permissions or API behavior. Structured meetings remain independent from follow-ups/tasks/waiting. No dates or bookings inferred. Source links are passed through unchanged.

Existing `relationship_tasks` can represent a dated operational task tied to an owned relationship/workspace. That is the appropriate existing entry path. Standalone manual Diary entries remain excluded: there is no agreed unlinked-entry ownership/persistence contract, and no new table or write path is introduced.

## Validation

- Focused Diary model/UI, Home control and navigation: 78/78.
- Broader requested operational-intelligence, Root visual and Home visual suites: 37/43, with the same six failures reproduced against unchanged main component sources. These include old frozen-file snapshots, a stale nav expectation omitting Diary, a history-order fixture expectation and two legacy test-loader syntax failures. No new failing test was introduced.
- TypeScript and targeted ESLint pass.
- React review: state initialized without synchronous effect updates; subscriptions cleaned up; URL inputs validated; semantic buttons/date input, focus indicators/current/selected states; shrinkable cards/calendar; no global tenant cache; no private-field expansion; no writes/providers.

Preview and viewport evidence will be recorded in the Draft PR after deployment. No Production data changes or merge are authorized by this work.
