begin;
create table public.diary_entries (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade, title text not null check(length(title) between 1 and 200),
 entry_type text not null check(entry_type in ('Meeting','Task','Reminder')), starts_at timestamptz not null, ends_at timestamptz,
 time_zone text not null default 'Europe/London', notes text not null default '' check(length(notes)<=5000),
 relationship_locator text, revision integer not null default 1 check(revision>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at),check(relationship_locator is null or relationship_locator ~ '^(workspace|inbox|target|acquisition)_[a-f0-9-]{36}$')
);
create index diary_entries_owner_date on public.diary_entries(organisation_id,owner_user_id,starts_at);
alter table public.diary_entries enable row level security;
revoke all on public.diary_entries from public,anon,authenticated;
grant select,insert,update,delete on public.diary_entries to service_role;
-- Dedicated user/tenant-owned credentials; no reuse of shared social/publishing tokens.
create table public.diary_calendar_accounts (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete cascade,owner_user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider='google_calendar'),external_account_id text not null,encrypted_tokens text not null,
 scopes text[] not null,updated_at timestamptz not null default now(),unique(organisation_id,owner_user_id,provider,external_account_id)
);
alter table public.diary_calendar_accounts enable row level security;
revoke all on public.diary_calendar_accounts from public,anon,authenticated;
grant select,insert,update,delete on public.diary_calendar_accounts to service_role;
commit;
