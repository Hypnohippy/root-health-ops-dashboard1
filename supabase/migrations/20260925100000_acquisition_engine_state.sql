begin;
-- Source snapshot on the existing acquisition identity; human-owned columns stay untouched.
alter table public.acquisition_items
  add column engine_state jsonb check (engine_state is null or jsonb_typeof(engine_state) = 'object'),
  add column engine_observed_at timestamptz;

create or replace function public.sync_acquisition_engine_state(
  p_organisation_id uuid, p_record jsonb, p_expected_state jsonb, p_expected_observed_at timestamptz
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item public.acquisition_items%rowtype;
  v_inserted uuid;
  v_at timestamptz := (p_record->>'engine_observed_at')::timestamptz;
begin
  if p_record->>'organisation_id' is distinct from p_organisation_id::text
    or p_record->>'source_engine' not in ('root_health_b2b','root_health_personal')
    or jsonb_typeof(p_record->'engine_state') is distinct from 'object' or v_at is null
  then raise exception 'invalid_engine_snapshot'; end if;
  insert into public.acquisition_items (organisation_id, source_engine, source_record_id, record_type,
    source_url, evidence, entity, person, company, reason, signal, suggested_action, status, metadata, engine_state, engine_observed_at)
  values (p_organisation_id, p_record->>'source_engine', p_record->>'source_record_id', p_record->>'record_type',
    p_record->>'source_url', p_record->>'evidence', p_record->>'entity', p_record->>'person', p_record->>'company',
    p_record->>'reason', p_record->>'signal', p_record->>'suggested_action', 'new', coalesce(p_record->'metadata','{}'::jsonb),
    p_record->'engine_state', v_at)
  on conflict (organisation_id, source_engine, source_record_id) do nothing returning id into v_inserted;
  if v_inserted is not null then return 'inserted'; end if;
  select * into strict v_item from public.acquisition_items
    where organisation_id = p_organisation_id and source_engine = p_record->>'source_engine'
      and source_record_id = p_record->>'source_record_id' for update;
  if v_item.engine_observed_at > v_at then return 'stale'; end if;
  if v_item.record_type is distinct from p_record->>'record_type' then return 'conflicts'; end if;
  if v_item.engine_state = p_record->'engine_state' and v_item.engine_observed_at = v_at then return 'duplicates'; end if;
  if v_item.engine_state is distinct from p_expected_state or v_item.engine_observed_at is distinct from p_expected_observed_at then return 'conflicts'; end if;
  if v_item.engine_observed_at = v_at then return 'conflicts'; end if;
  update public.acquisition_items set engine_state = p_record->'engine_state', engine_observed_at = v_at
    where id = v_item.id and organisation_id = p_organisation_id;
  return 'updated';
end;
$$;
revoke all on function public.sync_acquisition_engine_state(uuid,jsonb,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.sync_acquisition_engine_state(uuid,jsonb,jsonb,timestamptz) to service_role;
commit;
