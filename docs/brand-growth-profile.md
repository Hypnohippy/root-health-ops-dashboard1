# Brand + Growth Profile

`/dashboard/connect` stores one shared profile per organisation in Supabase. The
three core questions stay visible; branding, growth focus and additional customer
detail expand on demand. The existing dashboard branding card uses the same
editor in compact mode. Resource previews and exports now read the same profile.

## Deployment

Apply `supabase/migrations/20260923090000_organisation_profiles.sql` to the target
Supabase project **before deploying** this change, using the usual migration
workflow or Supabase SQL editor. The migration adds `organisation_profiles` and
`merge_organisation_profile`; it does not alter existing tables or copy any
browser data. It assumes the existing organisations and organisation_members
tables use UUID identifiers and have user_id, organisation_id and role columns.

No new Vercel environment variables or external social-platform settings are
required. Existing Supabase URL, publishable/anon key and server-only
`SUPABASE_SERVICE_ROLE_KEY` must be configured. Never expose the service key in a
NEXT_PUBLIC variable. If the migration is missing, profile requests fail closed
and the editor shows a retryable error rather than saving locally.

After deployment, sign in as a member, save a profile, reload and verify it from
another device. Check another organisation and a read-only member as well. The
migration has been exercised in local PostgreSQL via PGlite; it has not been
applied to a live Supabase project by this change.

## Access and persistence

- GET `/api/organisation/profile?organisationId=<uuid>` permits organisation members.
- PATCH the same URL with `{ "profile": { "businessName": "Example" } }` requires
  owner, admin or manager. User identity comes from verified Supabase auth, never
  from the request body. Omit organisationId only for a user with one membership.
- Phase 1 `requireOrganisation` verifies membership for every server call.
  SQL repeats the write-role check. Only the service role can execute the merge
  function; browser roles cannot write directly. RLS limits direct SELECT to
  members. The profile endpoint uses private, uncached responses.
- Updates merge changed fields atomically, retaining other members' unrelated
  edits. Concurrent changes to the same field use the last saved value.
- Validation rejects unknown keys, invalid types, oversized fields, unsafe URLs
  and unsupported growth modes. All fields are optional and can be cleared.
- `organisation_profiles` is the canonical branding store. Only `id` and `name`
  are queried from organisations; its name seeds a missing business name. Optional
  legacy branding columns are neither required nor read.

Old `rootops_brand_profile_v1` data is only read by the explicit **Review browser
branding** importer. It shows the destination organisation, requires the user to
review and save, then removes the legacy key after success. No branding is
automatically assigned to an organisation, and no profile is written to browser
storage. Older branding on another browser must be imported from that browser.

Uploaded PNG/JPEG/WebP logos (up to 512 KB) are stored as data URLs, preserving
embedded export logos without adding a storage bucket. Existing HTTPS logo URLs
are allowed but are not fetched by the server; those images need network access
when opening an exported document. Exports use the default colour `#10b981`
without requiring a legacy organisation colour column.

The installed `@supabase/ssr` 0.2 package uses get/set/remove cookie adapters.
The server and session proxy now use that API; the previous getAll/setAll methods
were ignored by that installed version. Auth still verifies the user with
Supabase, and the proxy forwards refreshed cookie chunks.

## Future generation

`BrandGrowthProfile` and `toGenerationProfile` in `lib/brandGrowthProfile.ts`
define the neutral, typed business/customer/offer/voice context. Server code can
call `getOrganisationGenerationProfile(organisationId)` from
`lib/organisationProfile.server.ts` to authenticate and obtain that context.
Do not cache it across organisations. Profile text is untrusted user content;
future prompts must treat it as data, not system instructions. Contact details
and logo data are omitted from the generation context.

This change does not wire the profile into existing AI prompts, run discovery,
start campaigns, add platforms or change publishing rules. Growth mode is a saved
planning preference: steady, launch or expand.

## Verification

`npm run test:security` includes Phase 1 regressions plus profile validation,
tenant isolation, read/write permissions, API errors, cookie compatibility and
the real SQL migration's grants, RLS and atomic merge behaviour. TypeScript and
the production build should also pass. A build needs the application's existing
Supabase, OpenAI and Stripe variables even when no services are contacted.

The local browser smoke test uses synthetic auth/database responses to check
load, edit, save and reload. Live Supabase and external-platform end-to-end
testing remains a deployment check.
