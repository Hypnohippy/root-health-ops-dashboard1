begin;
alter table public.inbox_items
  add column if not exists source_engine text,
  add column if not exists proposed_response text,
  add column if not exists email_reply_draft text,
  add column if not exists approved_response text,
  add column if not exists email_delivery_status text,
  add column if not exists email_sent_message_id text,
  add column if not exists email_sent_thread_id text,
  add column if not exists email_sent_at timestamptz;
alter table public.inbox_items add constraint inbox_items_email_delivery_status_check
  check (email_delivery_status is null or email_delivery_status in ('draft','approved','dispatching','sent','failed'));

create table public.email_send_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  inbox_item_id uuid not null references public.inbox_items(id) on delete cascade,
  actor_user_id uuid not null,
  source_engine text not null,
  recipient text not null,
  subject text not null,
  approved_body text not null,
  gmail_thread_id text,
  gmail_message_id text,
  in_reply_to text,
  approval_idempotency_key uuid not null,
  status text not null check (status in ('dispatching','accepted','sent','failed')),
  engine_error text,
  gmail_sent_message_id text,
  gmail_sent_thread_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, inbox_item_id),
  unique (organisation_id, approval_idempotency_key)
);
create index email_send_requests_tenant_status_idx on public.email_send_requests(organisation_id,status,created_at desc);
alter table public.email_send_requests enable row level security;
revoke all on public.email_send_requests from anon, authenticated;
grant all on public.email_send_requests to service_role;

create table public.email_send_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  inbox_item_id uuid not null references public.inbox_items(id) on delete cascade,
  send_request_id uuid not null references public.email_send_requests(id) on delete cascade,
  event_type text not null check (event_type in ('approved','accepted','sent','failed')),
  actor_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(send_request_id,event_type)
);
alter table public.email_send_events enable row level security;
revoke all on public.email_send_events from anon, authenticated;
grant all on public.email_send_events to service_role;

create or replace function public.acknowledge_email_send(
  p_organisation_id uuid, p_inbox_item_id uuid, p_send_request_id uuid, p_source_engine text,
  p_status text, p_message_id text, p_thread_id text, p_sent_at timestamptz, p_error text
) returns setof public.email_send_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request public.email_send_requests;
begin
  if p_status not in ('sent','failed') then raise exception 'invalid_acknowledgement_status'; end if;
  select * into v_request from public.email_send_requests where id=p_send_request_id and inbox_item_id=p_inbox_item_id and organisation_id=p_organisation_id and source_engine=p_source_engine for update;
  if not found then raise exception using errcode='P0002',message='email_send_request_not_found'; end if;
  if v_request.status='sent' then return query select * from public.email_send_requests where id=p_send_request_id; return; end if;
  update public.email_send_requests set status=p_status,engine_error=case when p_status='failed' then p_error else null end,
    gmail_sent_message_id=case when p_status='sent' then p_message_id else null end,
    gmail_sent_thread_id=case when p_status='sent' then p_thread_id else null end,
    sent_at=case when p_status='sent' then coalesce(p_sent_at,now()) else null end,updated_at=now() where id=p_send_request_id;
  if p_status='sent' then
    update public.inbox_items set status='replied',response_state='engaged',email_delivery_status='sent',last_reply_text=v_request.approved_body,
      last_replied_at=coalesce(p_sent_at,now()),email_sent_message_id=p_message_id,email_sent_thread_id=p_thread_id,email_sent_at=coalesce(p_sent_at,now()),response_updated_at=now()
      where id=p_inbox_item_id and organisation_id=p_organisation_id and platform='email';
  else
    update public.inbox_items set email_delivery_status='failed',response_updated_at=now() where id=p_inbox_item_id and organisation_id=p_organisation_id and platform='email';
  end if;
  insert into public.email_send_events(organisation_id,inbox_item_id,send_request_id,event_type,details)
    values(p_organisation_id,p_inbox_item_id,p_send_request_id,p_status,jsonb_strip_nulls(jsonb_build_object('message_id',p_message_id,'thread_id',p_thread_id,'sent_at',p_sent_at,'error',p_error)))
    on conflict(send_request_id,event_type) do nothing;
  return query select * from public.email_send_requests where id=p_send_request_id;
end; $$;
revoke all on function public.acknowledge_email_send(uuid,uuid,uuid,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.acknowledge_email_send(uuid,uuid,uuid,text,text,text,text,timestamptz,text) to service_role;
commit;
