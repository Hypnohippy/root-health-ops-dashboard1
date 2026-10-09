begin;
alter table public.growth_targets add column if not exists last_reply_text text;
alter table public.growth_targets add column if not exists first_outbound_at timestamptz;
alter table public.growth_targets add column if not exists first_outbound_text text;
create or replace function public.record_manual_completion(p_organisation_id uuid, p_actor uuid, p_table text, p_id uuid,
  p_revision bigint, p_key uuid, p_completed_at timestamptz, p_evidence text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare version bigint; previous jsonb; receipt jsonb; item public.inbox_items%rowtype; target public.growth_targets%rowtype;
begin
  if p_table not in ('inbox_items','growth_targets') or p_key is null or p_actor is null or p_completed_at is null
    or p_completed_at > now() or nullif(trim(p_evidence),'') is null or length(p_evidence)>2000 or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'invalid_manual_receipt'; end if;
  insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
  insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
 select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id for update;
  if p_table='inbox_items' then
    -- Serialise against an already reserved Phase 4D delivery without changing its semantics.
    perform 1 from public.email_send_requests where organisation_id=p_organisation_id and inbox_item_id=p_id for update;
    select * into item from public.inbox_items where organisation_id=p_organisation_id and id=p_id for update;
    if not found then raise exception 'record_not_found'; end if;
    previous := item.manual_completion;
  else
    select * into target from public.growth_targets where organisation_id=p_organisation_id and id=p_id for update;
    if not found then raise exception 'record_not_found'; end if;
    previous := target.manual_completion;
  end if;
  if previous->>'key'=p_key::text or exists(select 1 from jsonb_array_elements(coalesce(previous->'history','[]'::jsonb)) r where r->>'key'=p_key::text) then return jsonb_build_object('duplicate',true); end if;
  if version is distinct from p_revision then raise exception 'stale_manual_plan'; end if;
  receipt := jsonb_build_object('key',p_key,'actor',p_actor,'completed_at',p_completed_at,'recorded_at',now(),'evidence',p_evidence,'message',p_patch->>'last_reply_text','stage',case when p_table='growth_targets' then case p_patch->>'stage' when 'day3_followup' then 'connection' when 'day7_parity' then 'day3_followup' when 'day14_insight' then 'day7_parity' when 'day28_relevance' then 'day14_insight' when 'day42_close' then 'day28_relevance' when 'parked' then 'day42_close' end else 'connection' end,
    'history',coalesce(previous->'history','[]'::jsonb) || case when previous is null then '[]'::jsonb else jsonb_build_array(previous-'history') end);
  if p_table='inbox_items' then
    if item.status in ('replied','archived') or previous is not null or item.email_delivery_status in ('approved','dispatching','sent')
      or exists(select 1 from public.email_send_requests where organisation_id=p_organisation_id and inbox_item_id=p_id and status in ('dispatching','accepted','sent'))
      then raise exception 'already_handled_or_delivery_uncertain'; end if;
    if p_patch-array['status','response_state','follow_up_at','last_replied_at','last_reply_text','contacted_at'] <> '{}'::jsonb
      or p_patch->>'status' is distinct from 'replied' or p_patch->>'response_state' not in ('engaged','waiting_for_human') then raise exception 'invalid_manual_patch'; end if;
    update public.inbox_items set status='replied',response_state=p_patch->>'response_state',follow_up_at=null,
      last_replied_at=p_completed_at,last_reply_text=p_patch->>'last_reply_text',
      contacted_at=case when kind='connection_accepted' then p_completed_at else contacted_at end,
      manual_completion=receipt where organisation_id=p_organisation_id and id=p_id;
    insert into public.response_item_events(organisation_id,inbox_item_id,actor_user_id,action,previous_state,new_state,note,idempotency_key)
      values(p_organisation_id,p_id,p_actor,'manual_complete',item.response_state,p_patch->>'response_state',p_evidence,p_key);
  else
    if target.status is distinct from 'active' or target.replied_at is not null or coalesce(target.reply_status,'') not in ('','no_reply')
      then raise exception 'cadence_not_actionable'; end if;
    if p_patch-array['stage','status','last_action_at','last_reply_text'] <> '{}'::jsonb or p_patch->>'stage' is null
      or p_patch->>'stage'=target.stage or p_patch->>'status' not in ('active','parked') then raise exception 'invalid_manual_patch'; end if;
    update public.growth_targets set stage=p_patch->>'stage',status=p_patch->>'status',last_action_at=p_completed_at,manual_completion=receipt,
      last_reply_text=p_patch->>'last_reply_text',
      first_outbound_at=case when target.stage='connection' then coalesce(target.first_outbound_at,p_completed_at) else target.first_outbound_at end,
      first_outbound_text=case when target.stage='connection' then coalesce(target.first_outbound_text,p_patch->>'last_reply_text') else target.first_outbound_text end
      where organisation_id=p_organisation_id and id=p_id;
  end if;
  return jsonb_build_object('duplicate',false,'completedAt',p_completed_at);
end; $$;
create or replace function public.preserve_manual_completion() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if current_user in ('anon','authenticated') and new.manual_completion is not null then raise exception 'manual_receipt_requires_authorized_service'; end if;
    return new;
  end if;
  if current_user in ('anon','authenticated') and new.manual_completion is distinct from old.manual_completion then raise exception 'manual_receipt_requires_authorized_service'; end if;
  if old.manual_completion is not null then
    if new.manual_completion is null then new.manual_completion:=old.manual_completion; end if;
    if tg_table_name='inbox_items' then
      if new.status is distinct from 'archived' then new.status:=old.status; end if;
      new.last_replied_at:=old.last_replied_at; new.last_reply_text:=old.last_reply_text;
      new.contacted_at:=old.contacted_at; new.follow_up_at:=null;
      if new.response_state is null or new.response_state in ('needs_reply','follow_up','waiting_for_human') or (old.response_state in ('converted','closed_or_lost','meeting') and new.response_state not in ('converted','closed_or_lost','meeting')) then new.response_state:=old.response_state; end if;
    elsif new.manual_completion is not distinct from old.manual_completion then
      if new.stage is distinct from old.stage and new.stage is distinct from 'parked' and not (current_user not in ('anon','authenticated') and current_setting('root.cadence_backfill',true)='1') then raise exception 'manual_completion_prevents_cadence_regression'; end if;
      new.last_action_at := greatest(old.last_action_at,new.last_action_at);
    end if;
  end if;
  return new;
end; $$;

create or replace function public.backfill_linkedin_cadence(p_organisation_id uuid,p_expected_revision bigint,p_repairs jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version bigint; repair jsonb; target public.growth_targets%rowtype; applied integer:=0;
begin
 insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
 select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id for update;
 if version is distinct from p_expected_revision then raise exception 'stale_cadence_report'; end if;
 if jsonb_typeof(p_repairs) is distinct from 'array' then raise exception 'invalid_cadence_repairs'; end if;
 perform set_config('root.cadence_backfill','1',true);
 for repair in select * from jsonb_array_elements(p_repairs) loop
  if repair->>'id' is null then
   if repair->'patch'->>'source_type' is distinct from 'lifecycle_connection_accepted'
    or not exists(select 1 from public.inbox_items where organisation_id=p_organisation_id and id=(repair->'patch'->>'source_record_id')::uuid and kind='connection_accepted' and platform='linkedin' and status='replied')
    or exists(select 1 from public.growth_targets where organisation_id=p_organisation_id and linkedin_identity=repair->'patch'->>'linkedin_identity') then raise exception 'cadence_creation_evidence_changed'; end if;
   insert into public.growth_targets(organisation_id,target_name,linkedin_identity,linkedin_url,stage,status,last_action_at,first_outbound_at,first_outbound_text,source_type,source_record_id)
    values(p_organisation_id,repair->'patch'->>'target_name',repair->'patch'->>'linkedin_identity',repair->'patch'->>'linkedin_url',repair->'patch'->>'stage','active',(repair->'patch'->>'last_action_at')::timestamptz,(repair->'patch'->>'first_outbound_at')::timestamptz,repair->'patch'->>'first_outbound_text','lifecycle_connection_accepted',repair->'patch'->>'source_record_id');
   applied:=applied+1;continue;
  end if;
  select * into target from public.growth_targets where organisation_id=p_organisation_id and id=(repair->>'id')::uuid for update;
  if not found or target.status not in ('active','waiting') or target.replied_at is not null or coalesce(target.reply_status,'') not in ('','no_reply') then raise exception 'cadence_evidence_changed'; end if;
  if (repair->'patch') - array['stage','status','first_outbound_at','first_outbound_text'] <> '{}'::jsonb
   or repair->'patch'->>'stage' not in ('day3_followup','day7_parity','day14_insight','day28_relevance','day42_close','parked')
   or nullif(repair->'patch'->>'first_outbound_text','') is null
   or (repair->'patch'->>'first_outbound_at')::timestamptz > now()
   or (target.first_outbound_at is not null and target.first_outbound_at is distinct from (repair->'patch'->>'first_outbound_at')::timestamptz)
   then raise exception 'invalid_cadence_anchor'; end if;
  if repair->'patch'->>'stage'='parked' and target.manual_completion->>'stage' is distinct from 'day42_close' then raise exception 'final_close_not_confirmed'; end if;
  update public.growth_targets set stage=repair->'patch'->>'stage',status=case when repair->'patch'->>'stage'='parked' then 'parked' else status end,
   first_outbound_at=coalesce(first_outbound_at,(repair->'patch'->>'first_outbound_at')::timestamptz),
   first_outbound_text=coalesce(first_outbound_text,repair->'patch'->>'first_outbound_text')
   where organisation_id=p_organisation_id and id=target.id;
  applied:=applied+1;
 end loop;
 perform set_config('root.cadence_backfill','0',true);
 return jsonb_build_object('applied',applied);
end; $$;
revoke all on function public.backfill_linkedin_cadence(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.backfill_linkedin_cadence(uuid,bigint,jsonb) to service_role;
commit;
