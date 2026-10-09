begin;
-- Add only explicit verified Personal Signal confirmations to the existing atomic acquisition RPC.
-- Existing actions, handoff rules, table and audit history are preserved.
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
  v_personal boolean;
  v_url_parts text[];
  v_host text;
  v_path text;
  v_direct_discussion boolean;
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

  v_personal := coalesce(p_action in ('personal_responded','personal_engaged','personal_capacity_check','personal_signup','personal_subscriber'),false);
  if v_personal then
    -- Parse authority separately from path/query: credentials, spoofed hosts and
    -- non-default ports cannot qualify, nor can a post-shaped query parameter.
    v_url_parts := regexp_match(v_item.source_url,
      '^https://([A-Za-z0-9.-]+)(:443)?(/[^?#[:space:]\\]*)([?][^#[:space:]\\]*)?(#[^[:space:]\\]*)?$', 'i');
    v_host := regexp_replace(lower(v_url_parts[1]), '^(www|m)[.]', '');
    v_path := v_url_parts[3];
    v_direct_discussion := coalesce(case
      when v_host in ('reddit.com','old.reddit.com','new.reddit.com') then v_path ~ '/comments/[^/]+'
      when v_host = 'facebook.com' then v_path ~ '/(posts|videos|reel)/[^/]+'
        or (v_path ~ '/(permalink|story)[.]php$' and v_url_parts[4] ~ '[?&]story_fbid=[^&#]+')
      when v_host = 'instagram.com' then v_path ~ '^/(p|reel)/[^/]+'
      when v_host in ('threads.net','threads.com') then v_path ~ '/post/[^/]+'
      when v_host in ('x.com','twitter.com') then v_path ~ '/status/[^/]+'
      when v_host = 'linkedin.com' then v_path ~ '/posts/[^/]+|/feed/update/urn:li:'
      when v_host = 'tiktok.com' then v_path ~ '/video/[^/]+'
      else false end, false);
    if v_item.source_engine <> 'root_health_personal' or v_item.record_type not in ('personal_opportunity','social_opportunity')
      or nullif(v_item.source_record_id,'') is null or not v_direct_discussion
      or concat_ws(' ', v_item.metadata->>'lane', v_item.metadata->>'opportunity_type',
        v_item.metadata->>'content_type', v_item.metadata->>'sheet_tab',
        v_item.engine_state->>'opportunity_type') ~* 'search.?demand|article|blog|partner|referr'
      or v_item.metadata->'engine_safety'->'public_context' is distinct from 'true'::jsonb
      or v_item.metadata->'engine_safety'->'consumer_outreach' is distinct from 'false'::jsonb
      or v_item.metadata->'engine_safety'->'health_targeting' is distinct from 'false'::jsonb
      or v_item.metadata->'engine_safety'->'verified_direct_discussion' is distinct from 'true'::jsonb
      or nullif(trim(coalesce(v_item.metadata->>'original_post',v_item.metadata->>'post_text','')),'') is null
    then raise exception 'unverified_personal_signal'; end if;
    if exists(select 1 from public.acquisition_item_events where acquisition_item_id=p_item_id and action=p_action) then raise exception 'personal_milestone_already_recorded'; end if;
    if (p_action='personal_responded' and (v_item.status not in ('new','reviewing','accepted') or p_new_status<>'actioned' or p_outcome<>'Responded'))
      or (p_action='personal_engaged' and (v_item.status<>'actioned' or p_new_status<>'engaged' or p_outcome<>'Engaged'))
      or (p_action='personal_capacity_check' and (v_item.status<>'engaged' or p_new_status<>'engaged' or p_outcome<>'Capacity Check'))
      or (p_action='personal_signup' and (v_item.status<>'engaged' or p_new_status<>'engaged' or p_outcome<>'Signup'))
      or (p_action='personal_subscriber' and (v_item.status<>'engaged' or p_new_status<>'converted' or p_outcome<>'Subscriber'))
      or p_outcome is null then raise exception 'invalid_personal_milestone'; end if;
    if p_action='personal_signup' and not exists(select 1 from public.acquisition_item_events where acquisition_item_id=p_item_id and action='personal_capacity_check')
      or p_action='personal_subscriber' and not exists(select 1 from public.acquisition_item_events where acquisition_item_id=p_item_id and action='personal_signup') then raise exception 'preceding_personal_milestone_required'; end if;
  end if;
  v_destination := case p_action
    when 'prepare_outreach' then '/dashboard/growth/pipeline' when 'route_outreach' then '/dashboard/growth/pipeline'
    when 'create_content_draft' then '/dashboard/brainstorm' when 'route_campaign' then '/dashboard/campaigns/new'
    when 'route_publishing' then '/dashboard/publishing' when 'route_responses' then '/dashboard/responses' else null end;
  if v_destination is not null and p_new_status <> 'actioned' then raise exception 'invalid_handoff_status'; end if;
  if p_new_status = 'actioned' and v_destination is null and not v_personal then raise exception 'handoff_required'; end if;
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
