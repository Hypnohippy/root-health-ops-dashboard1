# PR #102 — Diary Phase 2

Base: `eb1bcc92a19aac2b9b5c1a4cadea3cfbf1e000d7`.

## Navigation repair retained

Authenticated current Production primary Diary navigation remained on Home with no feedback at 374 ms and 13.2 seconds; Diary had loaded by the next observation at 26.5 seconds. The server page awaits the canonical operational collection without a loading boundary. The route is present; silent pending server navigation was reproduced, not a missing route. A route loading boundary and explicit retry error now expose pending/failure states without changing canonical projection performance or meaning.

The authenticated first-build Preview opened Diary from the mobile drawer and showed its loading route within 682 ms. Diary now remains in the Root shell and has a calendar icon. Today/Week/Month, date selection and History API state remain intact. Week is a day selector plus selected-day agenda; Month is Monday-aligned. Desktop 1440×900 and mobile 390×844 measurements showed no horizontal overflow on that first build. These observations do not certify the subsequent Phase 2 persistence/OAuth extension.

## Google/Gmail audit

- Existing `/api/oauth/google/start` requests `openid`, profile and email only. It does not request Calendar access. Existing granted scopes were not introspected in Production; no existing token is assumed suitable or reused.
- Existing Google callback writes organisation-level social-account credentials. That is not a user-owned Diary calendar connection and is intentionally unchanged.
- Gmail evidence is imported by the existing Gmail-engine ingestion routes into `email_conversation_messages`. Stored fields include provider message/thread IDs, direction, sender/recipient, subject, body, timestamps and optional inbox item. No structured attachment field currently survives that intake.
- Diary now reads stored bodies conservatively. Structured VEVENT text already present in a body is preferred; unavailable binary attachments are not invented or silently claimed as processed. No changes to Gmail send/ingestion behavior.

## Manual persistence and authorization

Neither relationship tasks nor activities can represent a standalone entry: both require a relationship workspace. The generated, UNAPPLIED migration `20261025111451_diary_entries_and_calendar_read.sql` proposes:

- `diary_entries`: user + organisation ownership, explicit Meeting/Task/Reminder, start/end/timezone, notes, optional explicitly chosen existing relationship locator, optimistic revision.
- `diary_calendar_accounts`: separate user + organisation + provider-account ownership, scopes, AES-256-GCM encrypted refresh token. This additional credential storage is needed to avoid repurposing shared social/publishing credentials. It is part of the proposed migration and requires review before any hosted application.

Both tables enable RLS and revoke all browser/PUBLIC privileges; only server service-role access is granted. HTTP routes authorize tenant membership/write role first, derive owner from the authenticated user, filter all mutations by both tenant and owner, reject stale revisions, and validate optional relationship via the existing relationship reader. No arbitrary or name-based link is accepted. Auth-user/organisation deletion cascades only the new owned Diary rows, avoiding a new block on existing managed Auth deletion.

Diary Add entry supports a standalone title, UK date/time, optional duration, Meeting/Task/Reminder, notes and optional explicit relationship search/selection through the existing Relationships search. Manual edit/delete use the same owned endpoint and revision. No Google write, invitation, send or lifecycle transition occurs.

## Google Calendar read

Separate start/callback routes reuse the existing signed, expiring, browser-nonce + authenticated tenant/user OAuth state helper. They request `openid https://www.googleapis.com/auth/calendar.events.readonly`, never Calendar write scope. No Founder credential assumption or shared account fallback.

The reader refreshes the user's encrypted credential server-side and GETs their primary calendar's events, including expanded recurrence instances, for the previous 31 days / next 366 days. Pagination and request limits are bounded and disclosed. Unknown timezone stays null; all-day dates remain date-only with exclusive end. Declined/tentative/unaccepted invitations are excluded. Non-appointment calendar categories are reminders rather than manufactured meetings. No provider event mutation code exists. External cards are read-only and retain source/account/event/date/timezone/location/meeting URL where supplied.

### Required isolated/Production authorization steps — NOT performed

1. Review/apply the proposed migration to an isolated verification database first.
2. Enable Google Calendar API for the intended OAuth client and register the exact separate callback URI ending `/api/oauth/google-calendar/callback`.
3. Configure `GOOGLE_CALENDAR_REDIRECT_URI` and a new private 32-byte base64 `DIARY_CALENDAR_TOKEN_KEY` through a secure secret mechanism; existing Google client ID/secret and OAuth state secret are reused.
4. Obtain explicit per-user Calendar read consent/offline access. Existing Gmail/profile consent is insufficient proof.
5. External Google app verification/consent-screen requirements must be checked for the deployment audience before release.

No Production consent, environment setting, token retrieval, migration or data write was performed under this task. No paid environment or branch was created.

## Email evidence and dedupe

Proposals, booking links, vague intent, quoted replies, negations and uncertain dates/timezones fail closed. Prose confirmation requires one absolute ISO date/time and an explicit zone/offset with a meeting/call/appointment confirmation or “see you”. Relative weekdays, missing years and missing zones are not guessed. Consequently examples such as “Tuesday at 2pm is confirmed” are retained in their source message but do not become a dated meeting without sufficient absolute evidence.

Structured invitation text requires explicit confirmed status or accepted reply, a resolvable DTSTART and no cancelled/tentative status. Floating/ambiguous DST times stay uncertain. Exact supporting text, sender, provider message/thread IDs and confirmation basis remain in provenance.

Exact provider duplicates use organisation/account/provider/event ID. Google + email invite merge only with identical iCalUID and occurrence start, preserving both provenance references. Different occurrences and unrelated same-person/title events remain separate. Internal Ops meetings without a provider UID cannot be silently deduped against a similar external event. No identity inference, lifecycle suppression or follow-up removal.

## Shared grounding

`extendDiary` combines authoritative sources after `buildOperationalWork`. Diary, Ask Root and Home all use it. The existing lifecycle follow-up projection is unchanged. New meeting/task counts are recomputed from combined evidence; follow-up/reply authority remains unchanged. Ask Root source/person/time questions filter this same evidence and disclose unavailable/limited sources. It cannot create or change entries.

## Validation status

- 148/148 focused Phase 2, existing Diary, UI/navigation, Home and Ask Root tests pass, including the foreign-key cascade adjustment.
- Real local PGlite CRUD through the server mutation implementation proves create/edit/delete, standalone/optional relationship, foreign tenant/user denial and stale revision protection. Migration also builds on the real canonical empty baseline.
- Calendar HTTP is mocked; DB behavior is not mocked. Encryption, scope/account boundaries, read-only event requests, timezone/all-day behavior, proposals/confirmation, provenance and dedupe have focused coverage.
- TypeScript and targeted lint clean. React review covers state initialization, subscription cleanup, explicit async statuses, semantic form labels/buttons, read-only provider boundary and no global mutable tenant cache.
- Previously requested broader operational/visual suites had six failures also reproduced against unchanged main component sources: legacy snapshots/navigation expectation/history fixture and test-loader failures. They are not repaired here.
- Authenticated Preview first-build shell/calendar checks were completed. New manual CRUD and real Google consent/read in an isolated authenticated Preview are STILL PENDING the unapplied migration, secure configuration and user consent. No complete Phase 2 hosted verification or release readiness is claimed.

Keep PR #102 Draft and unmerged. No Production rollout is authorized by this work.
