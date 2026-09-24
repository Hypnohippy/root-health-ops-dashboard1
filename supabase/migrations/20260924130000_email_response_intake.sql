begin;
alter table public.inbox_items
  add column if not exists email_classification text,
  add column if not exists response_state text,
  add column if not exists email_thread_id text,
  add column if not exists email_message_id text,
  add column if not exists in_reply_to text,
  add column if not exists outreach_reference text,
  add column if not exists sender_email text,
  add column if not exists email_subject text,
  add column if not exists follow_up_at timestamptz,
  add column if not exists response_updated_at timestamptz;
alter table public.inbox_items add constraint inbox_items_email_classification_check check (email_classification is null or email_classification in ('human_positive','human_neutral','human_negative','question','redirect','auto_acknowledgement','waiting_for_human','closed_or_lost','out_of_office','bounce'));
alter table public.inbox_items add constraint inbox_items_response_state_check check (response_state is null or response_state in ('needs_reply','waiting_for_human','no_reply_needed','follow_up','nurture','closed_or_lost','engaged','converted'));
create unique index inbox_items_email_message_unique on public.inbox_items(organisation_id, email_message_id);

create table public.response_item_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  inbox_item_id uuid not null references public.inbox_items(id) on delete cascade, actor_user_id uuid not null,
  action text not null, previous_state text, new_state text not null, note text, idempotency_key uuid not null,
  created_at timestamptz not null default now(), unique(inbox_item_id,idempotency_key)
);
create index response_item_events_tenant_item_idx on public.response_item_events(organisation_id,inbox_item_id,created_at desc);
alter table public.response_item_events enable row level security;
revoke all on public.response_item_events from anon, authenticated;
grant all on public.response_item_events to service_role;

create or replace function public.apply_email_response_action(
  p_organisation_id uuid, p_item_id uuid, p_actor_user_id uuid, p_action text,
  p_new_state text, p_status text, p_follow_up_at timestamptz, p_note text, p_idempotency_key uuid
) returns setof public.inbox_items language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous text;
begin
  select response_state into v_previous from public.inbox_items where id=p_item_id and organisation_id=p_organisation_id and platform='email' for update;
  if not found then raise exception using errcode='P0002',message='email_response_not_found'; end if;
  if exists(select 1 from public.response_item_events where inbox_item_id=p_item_id and idempotency_key=p_idempotency_key) then
    return query select * from public.inbox_items where id=p_item_id and organisation_id=p_organisation_id; return;
  end if;
  update public.inbox_items set response_state=p_new_state,status=p_status,follow_up_at=p_follow_up_at,response_updated_at=now()
    where id=p_item_id and organisation_id=p_organisation_id and platform='email';
  insert into public.response_item_events(organisation_id,inbox_item_id,actor_user_id,action,previous_state,new_state,note,idempotency_key)
    values(p_organisation_id,p_item_id,p_actor_user_id,p_action,v_previous,p_new_state,p_note,p_idempotency_key);
  return query select * from public.inbox_items where id=p_item_id and organisation_id=p_organisation_id;
end; $$;
revoke all on function public.apply_email_response_action(uuid,uuid,uuid,text,text,text,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.apply_email_response_action(uuid,uuid,uuid,text,text,text,timestamptz,text,uuid) to service_role;
commit;
