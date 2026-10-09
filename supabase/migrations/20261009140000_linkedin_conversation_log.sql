begin;
alter table public.growth_targets add column if not exists linkedin_conversation_active boolean not null default false, add column if not exists linkedin_previously_contacted boolean not null default false;
alter table public.inbox_items add column if not exists linkedin_conversation_active boolean not null default false, add column if not exists linkedin_previously_contacted boolean not null default false;
alter table public.acquisition_items add column if not exists linkedin_conversation_active boolean not null default false, add column if not exists linkedin_previously_contacted boolean not null default false;
create table public.linkedin_conversation_messages (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), linkedin_identity text not null,
 receipt_key uuid not null, actor uuid not null, direction text not null check(direction in ('inbound','outbound')), message text not null check(length(trim(message))>0),
 message_at timestamptz, confirmed_at timestamptz not null default clock_timestamp(), date_status text not null check(date_status in ('verified','unknown')), timezone text, time_precision text not null,
 source text not null check(source='manually reconciled from LinkedIn conversation'),
 unique(organisation_id,receipt_key), check((date_status='verified')=(message_at is not null))
);
create index linkedin_conversation_identity on public.linkedin_conversation_messages(organisation_id,linkedin_identity,message_at,confirmed_at);
alter table public.linkedin_conversation_messages enable row level security;
revoke all on public.linkedin_conversation_messages from anon,authenticated;
grant select,insert on public.linkedin_conversation_messages to service_role;
create function public.keep_linkedin_conversation_history() returns trigger language plpgsql as $$ begin raise exception 'conversation_history_is_append_only'; end; $$;
create trigger immutable_linkedin_conversation_history before update or delete on public.linkedin_conversation_messages for each row execute function public.keep_linkedin_conversation_history();
create function public.append_linkedin_conversation_message(p_organisation_id uuid,p_actor uuid,p_identity text,p_revision bigint,p_key uuid,p_details jsonb,p_refs jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version bigint; ref jsonb; entry uuid; actual_at timestamptz;
begin
 if p_actor is null or p_key is null or p_identity !~ '^linkedin.com/in/[^/]+$' or p_details->>'direction' not in ('inbound','outbound') or nullif(trim(p_details->>'message'),'') is null or length(p_details->>'message')>50000 or jsonb_typeof(p_refs) is distinct from 'array' or jsonb_array_length(p_refs)=0 then raise exception 'invalid_conversation_entry'; end if;
 actual_at:=(p_details->>'messageAt')::timestamptz;
 if actual_at>now() then raise exception 'future_message_date'; end if;
 insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
 select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id for update;
 select id into entry from public.linkedin_conversation_messages where organisation_id=p_organisation_id and receipt_key=p_key;
 if found then return jsonb_build_object('duplicate',true,'id',entry); end if;
 if version is distinct from p_revision then raise exception 'stale_conversation_plan'; end if;
 -- Validate every tenant-bound reference before appending or changing conversation state.
 for ref in select * from jsonb_array_elements(p_refs) loop
  if ref->>'table'='growth_targets' then perform 1 from public.growth_targets where organisation_id=p_organisation_id and id=(ref->>'id')::uuid for update;
  elsif ref->>'table'='inbox_items' then perform 1 from public.inbox_items where organisation_id=p_organisation_id and id=(ref->>'id')::uuid for update;
  elsif ref->>'table'='acquisition_items' then perform 1 from public.acquisition_items where organisation_id=p_organisation_id and id=(ref->>'id')::uuid for update;
  else raise exception 'unsupported_contact_record'; end if;
  if not found then raise exception 'foreign_or_missing_contact_record'; end if;
 end loop;
 insert into public.linkedin_conversation_messages(organisation_id,linkedin_identity,receipt_key,actor,direction,message,message_at,date_status,timezone,time_precision,source)
 values(p_organisation_id,p_identity,p_key,p_actor,p_details->>'direction',p_details->>'message',actual_at,case when actual_at is null then 'unknown' else 'verified' end,p_details->>'timezone',p_details->>'precision','manually reconciled from LinkedIn conversation') returning id into entry;
 for ref in select * from jsonb_array_elements(p_refs) loop
  if ref->>'table'='growth_targets' then update public.growth_targets set linkedin_previously_contacted=true,linkedin_conversation_active=linkedin_conversation_active or p_details->>'direction'='inbound' where organisation_id=p_organisation_id and id=(ref->>'id')::uuid;
  elsif ref->>'table'='inbox_items' then update public.inbox_items set linkedin_previously_contacted=true,linkedin_conversation_active=linkedin_conversation_active or p_details->>'direction'='inbound' where organisation_id=p_organisation_id and id=(ref->>'id')::uuid;
  else update public.acquisition_items set linkedin_previously_contacted=true,linkedin_conversation_active=linkedin_conversation_active or p_details->>'direction'='inbound' where organisation_id=p_organisation_id and id=(ref->>'id')::uuid;
  end if;
 end loop;
 return jsonb_build_object('duplicate',false,'id',entry);
end; $$;
revoke all on function public.append_linkedin_conversation_message(uuid,uuid,text,bigint,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.append_linkedin_conversation_message(uuid,uuid,text,bigint,uuid,jsonb,jsonb) to service_role;
commit;
