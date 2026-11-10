begin;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  owner_user_id uuid not null,
  relationship_id uuid,
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  timezone text not null check (length(btrim(timezone)) between 1 and 64),
  all_day boolean not null default false,
  location text check (location is null or length(location) <= 500),
  meeting_url text check (meeting_url is null or length(meeting_url) <= 2048),
  notes text check (notes is null or length(notes) <= 10000),
  status text not null default 'tentative' check (status in ('tentative','confirmed','completed','cancelled')),
  source text not null check (source in ('ops_manual','relationship')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  cancelled_at timestamptz,
  unique (organisation_id,id),
  foreign key (organisation_id,relationship_id) references public.relationship_workspaces(organisation_id,id),
  check (
    (all_day and starts_at is null and ends_at is null and start_date is not null and end_date is not null and start_date < end_date)
    or
    (not all_day and start_date is null and end_date is null and starts_at is not null and ends_at is not null and starts_at < ends_at)
  ),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((relationship_id is null and source = 'ops_manual') or (relationship_id is not null and source = 'relationship'))
);

create index appointments_org_start on public.appointments(organisation_id,starts_at,start_date,id);
create index appointments_org_owner on public.appointments(organisation_id,owner_user_id,updated_at desc);

alter table public.appointments enable row level security;
revoke all on public.appointments from public, anon, authenticated, service_role;
grant select on public.appointments to service_role;

create function public.save_appointment(
  p_org uuid, p_actor uuid, p_action text, p_id uuid, p_revision bigint,
  p_relationship_id uuid, p_title text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_start_date date, p_end_date date, p_timezone text, p_all_day boolean,
  p_location text, p_meeting_url text, p_notes text, p_status text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare stored_revision bigint; stored_status text; result public.appointments; stamp timestamptz := clock_timestamp();
begin
  if p_actor is null or not exists (
    select 1 from public.organisation_members m
    where m.organisation_id=p_org and m.user_id=p_actor and lower(m.role::text) in ('owner','admin','manager')
  ) then raise exception 'appointment_actor_not_authorized'; end if;

  if p_action not in ('create','update','cancel') then raise exception 'appointment_action_invalid'; end if;
  if p_action <> 'cancel' then
    if p_title is null or length(btrim(p_title)) not between 1 and 200 then raise exception 'appointment_title_invalid'; end if;
    if p_timezone is null or length(btrim(p_timezone)) not between 1 and 64 then raise exception 'appointment_timezone_invalid'; end if;
    if p_status not in ('tentative','confirmed','completed') then raise exception 'appointment_status_invalid'; end if;
    if p_all_day is null or (p_all_day and (p_start_date is null or p_end_date is null or p_start_date>=p_end_date or p_starts_at is not null or p_ends_at is not null))
      or (not p_all_day and (p_starts_at is null or p_ends_at is null or p_starts_at>=p_ends_at or p_start_date is not null or p_end_date is not null)) then
      raise exception 'appointment_time_invalid';
    end if;
    if p_location is not null and length(p_location)>500 then raise exception 'appointment_location_invalid'; end if;
    if p_meeting_url is not null and (length(p_meeting_url)>2048 or p_meeting_url !~* '^https?://') then raise exception 'appointment_url_invalid'; end if;
    if p_notes is not null and length(p_notes)>10000 then raise exception 'appointment_notes_invalid'; end if;
    if p_relationship_id is not null and not exists (
      select 1 from public.relationship_workspaces w
      where w.organisation_id=p_org and w.id=p_relationship_id and not w.founder_only
    ) then raise exception 'appointment_relationship_unavailable'; end if;
  end if;

  if p_action='create' then
    if p_id is not null or p_revision is not null then raise exception 'appointment_create_invalid'; end if;
    insert into public.appointments(
      organisation_id,owner_user_id,relationship_id,title,starts_at,ends_at,start_date,end_date,timezone,all_day,
      location,meeting_url,notes,status,source
    ) values (
      p_org,p_actor,p_relationship_id,btrim(p_title),p_starts_at,p_ends_at,p_start_date,p_end_date,btrim(p_timezone),p_all_day,
      nullif(btrim(p_location),''),nullif(btrim(p_meeting_url),''),nullif(btrim(p_notes),''),p_status,
      case when p_relationship_id is null then 'ops_manual' else 'relationship' end
    ) returning * into result;
    return to_jsonb(result);
  end if;

  if p_id is null or p_revision is null or p_revision<1 then raise exception 'appointment_revision_required'; end if;
  select appointment.revision, appointment.status
    into stored_revision, stored_status
    from public.appointments as appointment
    where appointment.organisation_id=p_org and appointment.id=p_id
    for update;
  if not found then raise exception 'appointment_not_found'; end if;
  if stored_revision is distinct from p_revision then raise exception 'appointment_revision_conflict'; end if;
  if stored_status in ('cancelled','completed') then raise exception 'appointment_not_editable'; end if;

  if p_action='cancel' then
    update public.appointments as appointment
      set status='cancelled',cancelled_at=stamp,updated_at=stamp,revision=appointment.revision+1
      where appointment.organisation_id=p_org and appointment.id=p_id and appointment.revision=p_revision
      returning appointment.* into result;
    if not found then raise exception 'appointment_revision_conflict'; end if;
    return to_jsonb(result);
  end if;
  if stored_status='tentative' and p_status='completed' then raise exception 'appointment_status_transition_invalid'; end if;
  update public.appointments as appointment set
    relationship_id=p_relationship_id,title=btrim(p_title),starts_at=p_starts_at,ends_at=p_ends_at,
    start_date=p_start_date,end_date=p_end_date,timezone=btrim(p_timezone),all_day=p_all_day,
    location=nullif(btrim(p_location),''),meeting_url=nullif(btrim(p_meeting_url),''),notes=nullif(btrim(p_notes),''),
    status=p_status,source=case when p_relationship_id is null then 'ops_manual' else 'relationship' end,
    updated_at=stamp,revision=appointment.revision+1
  where appointment.organisation_id=p_org and appointment.id=p_id and appointment.revision=p_revision
  returning appointment.* into result;
  if not found then raise exception 'appointment_revision_conflict'; end if;
  return to_jsonb(result);
end $$;

revoke all on function public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text) to service_role;

commit;
