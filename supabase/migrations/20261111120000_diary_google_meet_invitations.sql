begin;

alter table public.appointments
  add column google_meet_enabled boolean not null default false,
  add column google_meet_request_id text,
  add column google_meet_url text,
  add column google_calendar_attendee_email text;

alter table public.appointments
  add constraint appointments_google_meet_request_id_check
    check (google_meet_request_id is null or length(google_meet_request_id) between 1 and 256),
  add constraint appointments_google_meet_url_check
    check (google_meet_url is null or (length(google_meet_url) <= 2048 and google_meet_url ~* '^https://')),
  add constraint appointments_google_calendar_attendee_email_check
    check (google_calendar_attendee_email is null or (length(google_calendar_attendee_email) between 3 and 320 and google_calendar_attendee_email = btrim(google_calendar_attendee_email)));

grant update (google_meet_request_id, google_meet_url)
  on public.appointments to service_role;

drop function public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text);

create function public.save_appointment(
  p_org uuid, p_actor uuid, p_action text, p_id uuid, p_revision bigint,
  p_relationship_id uuid, p_title text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_start_date date, p_end_date date, p_timezone text, p_all_day boolean,
  p_location text, p_meeting_url text, p_notes text, p_status text,
  p_google_meet_enabled boolean, p_google_calendar_attendee_email text
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
    if p_google_meet_enabled is null then raise exception 'appointment_google_meet_invalid'; end if;
    if p_google_calendar_attendee_email is not null and (
      length(p_google_calendar_attendee_email) not between 3 and 320
      or p_google_calendar_attendee_email <> btrim(p_google_calendar_attendee_email)
    ) then raise exception 'appointment_attendee_email_invalid'; end if;
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
      location,meeting_url,notes,status,source,google_meet_enabled,google_calendar_attendee_email
    ) values (
      p_org,p_actor,p_relationship_id,btrim(p_title),p_starts_at,p_ends_at,p_start_date,p_end_date,btrim(p_timezone),p_all_day,
      nullif(btrim(p_location),''),nullif(btrim(p_meeting_url),''),nullif(btrim(p_notes),''),p_status,
      case when p_relationship_id is null then 'ops_manual' else 'relationship' end,p_google_meet_enabled,nullif(btrim(p_google_calendar_attendee_email),'')
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
    google_meet_enabled=p_google_meet_enabled,
    google_calendar_attendee_email=nullif(btrim(p_google_calendar_attendee_email),''),
    updated_at=stamp,revision=appointment.revision+1
  where appointment.organisation_id=p_org and appointment.id=p_id and appointment.revision=p_revision
  returning appointment.* into result;
  if not found then raise exception 'appointment_revision_conflict'; end if;
  return to_jsonb(result);
end $$;

revoke all on function public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text,boolean,text) to service_role;

commit;
