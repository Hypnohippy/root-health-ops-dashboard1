begin;

-- A tenant revision makes multi-table reads and subsequent repairs optimistic,
-- atomic and safe against ALL writers, including existing manual actions.
create table public.lifecycle_revisions (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  revision bigint not null default 0
);
alter table public.lifecycle_revisions enable row level security;
revoke all on public.lifecycle_revisions from public, anon, authenticated;
grant select on public.lifecycle_revisions to service_role;

alter table public.inbox_items add column contacted_at timestamptz;

create function public.track_lifecycle_revision() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare tenant uuid;
begin
  if tg_op = 'DELETE' then tenant := old.organisation_id; else tenant := new.organisation_id; end if;
  if tenant is not null then
    insert into public.lifecycle_revisions(organisation_id, revision) values(tenant, 1)
      on conflict(organisation_id) do update set revision = lifecycle_revisions.revision + 1;
  end if;
  if tg_op = 'UPDATE' and old.organisation_id is distinct from new.organisation_id and old.organisation_id is not null then
    insert into public.lifecycle_revisions(organisation_id, revision) values(old.organisation_id, 1)
      on conflict(organisation_id) do update set revision = lifecycle_revisions.revision + 1;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create function public.record_linkedin_contacted_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.platform = 'linkedin' and new.kind = 'connection_accepted'
    and new.status = 'replied' and old.status is distinct from 'replied' then
    new.contacted_at := coalesce(old.contacted_at, now());
  end if;
  return new;
end; $$;
create trigger record_linkedin_contacted_at before update of status on public.inbox_items
  for each row execute function public.record_linkedin_contacted_at();
create trigger lifecycle_revision_acquisition after insert or update or delete on public.acquisition_items
  for each row execute function public.track_lifecycle_revision();
create trigger lifecycle_revision_inbox after insert or update or delete on public.inbox_items
  for each row execute function public.track_lifecycle_revision();
create trigger lifecycle_revision_growth after insert or update or delete on public.growth_targets
  for each row execute function public.track_lifecycle_revision();

create function public.apply_lifecycle_repairs(p_organisation_id uuid, p_expected_revision bigint, p_repairs jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare version bigint; repair jsonb; patch jsonb; target public.growth_targets%rowtype;
  applied integer := 0; affected integer; item_id uuid;
begin
  if p_organisation_id is null or jsonb_typeof(p_repairs) is distinct from 'array' then raise exception 'invalid_reconciliation'; end if;
  insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
  select revision into version from public.lifecycle_revisions where organisation_id = p_organisation_id for update;
  if version is distinct from p_expected_revision then return jsonb_build_object('stale', true, 'applied', 0); end if;
  for repair in select value from jsonb_array_elements(p_repairs) loop
    patch := repair->'patch';
    item_id := (repair->>'id')::uuid;
    if jsonb_typeof(patch) is distinct from 'object' or patch = '{}'::jsonb then raise exception 'invalid_patch'; end if;
    if repair->>'table' = 'growth_targets' then
      if item_id is null then
        if patch - array['target_name','company','linkedin_identity','linkedin_url','stage','status','last_action_at','source_type','source_record_id'] <> '{}'::jsonb
          or patch->>'source_type' is distinct from 'lifecycle_connection_accepted'
          or patch->>'linkedin_identity' is null then raise exception 'invalid_insert'; end if;
        target := jsonb_populate_record(null::public.growth_targets, patch);
        insert into public.growth_targets(organisation_id, target_name, company, linkedin_identity, linkedin_url, stage, status, last_action_at, source_type, source_record_id)
          values(p_organisation_id, target.target_name, target.company, target.linkedin_identity, target.linkedin_url, target.stage, target.status, target.last_action_at, target.source_type, target.source_record_id);
      else
        if patch - array['stage','status','last_action_at','reply_status','replied_at','deal_stage'] <> '{}'::jsonb then raise exception 'invalid_growth_patch'; end if;
        select * into target from public.growth_targets where id = item_id and organisation_id = p_organisation_id for update;
        if not found then raise exception 'target_not_found'; end if;
        target := jsonb_populate_record(target, patch);
        update public.growth_targets set stage = target.stage, status = target.status, last_action_at = target.last_action_at,
          reply_status = target.reply_status, replied_at = target.replied_at, deal_stage = target.deal_stage
          where id = item_id and organisation_id = p_organisation_id;
      end if;
    elsif repair->>'table' = 'inbox_items' and item_id is not null then
      if patch - array['response_state','follow_up_at'] <> '{}'::jsonb then raise exception 'invalid_inbox_patch'; end if;
      update public.inbox_items set
        response_state = case when patch ? 'response_state' then patch->>'response_state' else response_state end,
        follow_up_at = case when patch ? 'follow_up_at' then (patch->>'follow_up_at')::timestamptz else follow_up_at end
        where id = item_id and organisation_id = p_organisation_id;
    else raise exception 'invalid_repair_table'; end if;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'repair_target_not_found'; end if;
    applied := applied + 1;
  end loop;
  return jsonb_build_object('stale', false, 'applied', applied);
end; $$;

revoke all on function public.track_lifecycle_revision() from public, anon, authenticated;
revoke all on function public.record_linkedin_contacted_at() from public, anon, authenticated;
revoke all on function public.apply_lifecycle_repairs(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.apply_lifecycle_repairs(uuid,bigint,jsonb) to service_role;
commit;
