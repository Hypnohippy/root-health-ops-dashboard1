begin;
-- Durable handoff evidence stays on the existing acquisition record and event history.
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
  v_destination text;
begin
  select * into v_item from public.acquisition_items
    where id = p_item_id and organisation_id = p_organisation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'acquisition_item_not_found'; end if;

  if exists (select 1 from public.acquisition_item_events where acquisition_item_id=p_item_id and idempotency_key=p_idempotency_key and action<>p_action) then raise exception 'idempotency_key_reused'; end if;
  if exists (select 1 from public.acquisition_item_events where acquisition_item_id = p_item_id and idempotency_key = p_idempotency_key) then
    return query select * from public.acquisition_items where id = p_item_id and organisation_id = p_organisation_id;
    return;
  end if;
  if v_item.status <> p_expected_status then raise exception using errcode = '40001', message = 'acquisition_item_changed'; end if;

  v_destination := case p_action
    when 'prepare_outreach' then '/dashboard/growth/pipeline' when 'route_outreach' then '/dashboard/growth/pipeline'
    when 'create_content_draft' then '/dashboard/brainstorm' when 'route_campaign' then '/dashboard/campaigns/new'
    when 'route_publishing' then '/dashboard/publishing' when 'route_responses' then '/dashboard/responses' else null end;
  if v_destination is not null and p_new_status <> 'actioned' then raise exception 'invalid_handoff_status'; end if;
  if p_new_status = 'actioned' and v_destination is null then raise exception 'handoff_required'; end if;
  update public.acquisition_items set
    metadata = case when v_destination is null then metadata else coalesce(metadata,'{}'::jsonb) || jsonb_build_object('handoff',
      jsonb_build_object('action',p_action,'destination',v_destination,'recorded_at',now(),'actor_user_id',p_actor_user_id,'idempotency_key',p_idempotency_key)) end,
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
