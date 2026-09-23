begin;

create table public.organisation_profiles (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint organisation_profiles_object check (jsonb_typeof(profile) = 'object'),
  constraint organisation_profiles_size check (octet_length(profile::text) <= 1048576)
);

alter table public.organisation_profiles enable row level security;
revoke all on public.organisation_profiles from anon, authenticated;
grant select on public.organisation_profiles to authenticated;
grant all on public.organisation_profiles to service_role;

create policy organisation_profiles_member_read on public.organisation_profiles
for select to authenticated using (
  exists (select 1 from public.organisation_members m
    where m.organisation_id = organisation_profiles.organisation_id and m.user_id = auth.uid())
);

-- API validates the patch and authenticates membership. This function repeats
-- the write-role check and merges atomically so a brand-only edit cannot erase
-- growth fields saved concurrently by another member. No public write grants.
create function public.merge_organisation_profile(p_organisation_id uuid, p_patch jsonb, p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.organisation_members m where m.organisation_id = p_organisation_id
      and m.user_id = p_user_id and lower(m.role::text) in ('owner', 'admin', 'manager')
  ) then
    raise exception 'Insufficient organisation role' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid profile patch' using errcode = '22023';
  end if;
  insert into public.organisation_profiles (organisation_id, profile, updated_by)
    values (p_organisation_id, p_patch, p_user_id)
  on conflict (organisation_id) do update set
    profile = public.organisation_profiles.profile || excluded.profile,
    updated_at = clock_timestamp(), updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.merge_organisation_profile(uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.merge_organisation_profile(uuid,jsonb,uuid) to service_role;

commit;
