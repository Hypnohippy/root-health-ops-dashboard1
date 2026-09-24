begin;

alter table public.acquisition_items drop constraint if exists acquisition_items_status_check;
alter table public.acquisition_items add constraint acquisition_items_status_check check (
  status in ('new','reviewing','accepted','actioned','engaged','converted','nurture','lost','dismissed')
);
alter table public.acquisition_items
  add column if not exists current_action text,
  add column if not exists actioned_at timestamptz,
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists owner_user_id uuid,
  add column if not exists updated_at timestamptz not null default now();

create table public.acquisition_item_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  acquisition_item_id uuid not null references public.acquisition_items(id) on delete cascade,
  actor_user_id uuid not null,
  action text not null,
  previous_status text not null,
  new_status text not null,
  outcome text,
  note text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (acquisition_item_id, idempotency_key)
);
create index acquisition_item_events_tenant_item_idx
  on public.acquisition_item_events(organisation_id, acquisition_item_id, created_at desc);
alter table public.acquisition_item_events enable row level security;
revoke all on public.acquisition_item_events from anon, authenticated;
grant all on public.acquisition_item_events to service_role;

create or replace function public.apply_acquisition_action(
  p_organisation_id uuid,
  p_item_id uuid,
  p_actor_user_id uuid,
  p_expected_status text,
  p_action text,
  p_new_status text,
  p_outcome text,
  p_note text,
  p_idempotency_key uuid,
  p_marks_actioned boolean
) returns setof public.acquisition_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.acquisition_items%rowtype;
begin
  select * into v_item from public.acquisition_items
    where id = p_item_id and organisation_id = p_organisation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'acquisition_item_not_found'; end if;

  if exists (select 1 from public.acquisition_item_events where acquisition_item_id = p_item_id and idempotency_key = p_idempotency_key) then
    return query select * from public.acquisition_items where id = p_item_id and organisation_id = p_organisation_id;
    return;
  end if;
  if v_item.status <> p_expected_status then raise exception using errcode = '40001', message = 'acquisition_item_changed'; end if;

  update public.acquisition_items set
    status = p_new_status,
    current_action = p_action,
    actioned_at = case when p_marks_actioned then coalesce(actioned_at, now()) else actioned_at end,
    outcome = coalesce(p_outcome, outcome),
    outcome_at = case when p_outcome is not null then now() else outcome_at end,
    owner_user_id = coalesce(owner_user_id, p_actor_user_id),
    updated_at = now()
  where id = p_item_id and organisation_id = p_organisation_id;

  insert into public.acquisition_item_events (
    organisation_id, acquisition_item_id, actor_user_id, action,
    previous_status, new_status, outcome, note, idempotency_key
  ) values (
    p_organisation_id, p_item_id, p_actor_user_id, p_action,
    v_item.status, p_new_status, p_outcome, p_note, p_idempotency_key
  );
  return query select * from public.acquisition_items where id = p_item_id and organisation_id = p_organisation_id;
end;
$$;
revoke all on function public.apply_acquisition_action(uuid,uuid,uuid,text,text,text,text,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.apply_acquisition_action(uuid,uuid,uuid,text,text,text,text,text,uuid,boolean) to service_role;

commit;
