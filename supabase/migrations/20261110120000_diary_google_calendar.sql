begin;

alter table public.appointments
  add column google_calendar_sync_enabled boolean not null default false,
  add column google_calendar_id text,
  add column google_calendar_event_id text,
  add column google_calendar_etag text,
  add column google_calendar_synced_at timestamptz,
  add column google_calendar_sync_pending boolean not null default false;

alter table public.appointments
  add constraint appointments_google_mirror_identity_check
  check ((google_calendar_id is null) = (google_calendar_event_id is null));

create unique index appointments_google_mirror_unique
  on public.appointments(google_calendar_id, google_calendar_event_id)
  where google_calendar_event_id is not null;

create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  owner_user_id uuid not null,
  google_account_id text not null,
  google_email text,
  calendar_id text not null default 'primary',
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_tag text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (length(google_account_id) between 1 and 255),
  check (google_email is null or length(google_email) <= 320),
  check (length(calendar_id) between 1 and 255)
);

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.google_calendar_connections to service_role;
grant update (google_calendar_sync_enabled, google_calendar_id, google_calendar_event_id, google_calendar_etag, google_calendar_synced_at, google_calendar_sync_pending)
  on public.appointments to service_role;

commit;
