begin;
create table public.founder_research_records (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), created_by uuid not null,
 entity_kind text not null check(entity_kind in ('company','person')), person_name text, company text, website text, domain text, email text, email_verified boolean not null default false,
 linkedin_url text, linkedin_identity text, domain_verified boolean not null default false, identity_key text,
 lane text not null, geography text not null, discovery_context text, research_snapshot jsonb not null, research_versions jsonb not null default '[]', sources jsonb not null default '[]', contacts jsonb not null default '[]', scores_rationale jsonb not null default '{}',
 draft_subject text, draft_body text, saved boolean not null default false, linked_acquisition_item_id uuid references public.acquisition_items(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), unique(organisation_id,id), unique(organisation_id,identity_key)
);
create table public.founder_activity_events (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, research_record_id uuid not null, actor uuid not null,
 activity_type text not null check(activity_type in ('emailed','linkedin_contacted','called','note_added','promoted_to_acquisition','linked_gmail_evidence')),
 occurred_at timestamptz, recorded_at timestamptz not null default clock_timestamp(), route text, subject text, message text,
 gmail_message_id text, gmail_thread_id text, idempotency_key uuid not null, receipt_details jsonb not null,
 foreign key(organisation_id,research_record_id) references public.founder_research_records(organisation_id,id), unique(organisation_id,idempotency_key),
 check(occurred_at is null or occurred_at<=recorded_at), check((gmail_message_id is null)=(gmail_thread_id is null))
);
create unique index founder_gmail_event_once on public.founder_activity_events(organisation_id,gmail_message_id) where gmail_message_id is not null;
create index founder_memory_tenant_recent on public.founder_research_records(organisation_id,updated_at desc,id);
create index founder_history_tenant_record on public.founder_activity_events(organisation_id,research_record_id,recorded_at,id);
alter table public.founder_research_records enable row level security;
alter table public.founder_activity_events enable row level security;
-- No browser role access: API additionally enforces existing founder identity/plan.
revoke all on public.founder_research_records,public.founder_activity_events from public,anon,authenticated,service_role;
grant select,insert,update on public.founder_research_records to service_role;
grant select,insert on public.founder_activity_events to service_role;
create function public.guard_founder_record_tenant() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and (new.organisation_id<>old.organisation_id or new.id<>old.id or new.created_by<>old.created_by) then raise exception 'Founder identity ownership is immutable'; end if;
 if new.linked_acquisition_item_id is not null and not exists(select 1 from public.acquisition_items where id=new.linked_acquisition_item_id and organisation_id=new.organisation_id) then raise exception 'Invalid tenant acquisition link'; end if;
 return new;
end $$;
revoke all on function public.guard_founder_record_tenant() from public,anon,authenticated;
create trigger founder_record_tenant_guard before insert or update on public.founder_research_records for each row execute function public.guard_founder_record_tenant();
create function public.record_founder_activity(p_org uuid,p_record uuid,p_actor uuid,p_key uuid,p_details jsonb,p_acquisition uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.founder_research_records; e public.founder_activity_events; stamp timestamptz:=clock_timestamp();
begin
 select * into r from public.founder_research_records where organisation_id=p_org and id=p_record for update;
 if not found then raise exception 'Founder record not found'; end if;
 select * into e from public.founder_activity_events where organisation_id=p_org and idempotency_key=p_key;
 if found then
  if e.research_record_id<>p_record or e.actor<>p_actor or e.receipt_details is distinct from p_details then raise exception 'idempotency_key_reused'; end if;
  return jsonb_build_object('duplicate',true,'id',e.id);
 end if;
 if p_acquisition is not null then
  if p_details->>'activity_type'<>'promoted_to_acquisition' or not exists(select 1 from public.acquisition_items where organisation_id=p_org and id=p_acquisition) then raise exception 'Invalid tenant acquisition link'; end if;
  if r.linked_acquisition_item_id is not null and r.linked_acquisition_item_id<>p_acquisition then raise exception 'Acquisition link changed'; end if;
  update public.founder_research_records set linked_acquisition_item_id=p_acquisition,updated_at=stamp where id=p_record and organisation_id=p_org;
 end if;
 if p_details->>'gmail_message_id' is not null then
  if p_details->>'activity_type'<>'linked_gmail_evidence' or not exists(select 1 from public.email_conversation_messages where organisation_id=p_org and gmail_message_id=p_details->>'gmail_message_id' and gmail_thread_id=p_details->>'gmail_thread_id') then raise exception 'Existing tenant Gmail evidence required'; end if;
  select * into e from public.founder_activity_events where organisation_id=p_org and gmail_message_id=p_details->>'gmail_message_id';
  if found then
   if e.research_record_id<>p_record then raise exception 'Gmail evidence already linked to another Founder record; review identity'; end if;
   return jsonb_build_object('duplicate',true,'id',e.id);
  end if;
 end if;
 update public.founder_research_records set updated_at=stamp where id=p_record and organisation_id=p_org;
 insert into public.founder_activity_events(organisation_id,research_record_id,actor,activity_type,occurred_at,recorded_at,route,subject,message,gmail_message_id,gmail_thread_id,idempotency_key,receipt_details)
 values(p_org,p_record,p_actor,p_details->>'activity_type',case when p_details->>'time_status'='now' then stamp else nullif(p_details->>'occurred_at','')::timestamptz end,stamp,p_details->>'route',p_details->>'subject',p_details->>'message',p_details->>'gmail_message_id',p_details->>'gmail_thread_id',p_key,p_details) returning * into e;
 return jsonb_build_object('duplicate',false,'id',e.id);
end $$;
revoke all on function public.record_founder_activity(uuid,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_founder_activity(uuid,uuid,uuid,uuid,jsonb,uuid) to service_role;
commit;
