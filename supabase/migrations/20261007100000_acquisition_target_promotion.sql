begin;

-- One transaction owns canonical target promotion and the existing queue audit.
create function public.promote_acquisition_target(
  p_organisation_id uuid, p_item_id uuid, p_actor uuid, p_key uuid,
  p_action text, p_note text, p_updated_at timestamptz, p_target jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  item public.acquisition_items%rowtype;
  target public.growth_targets%rowtype;
  matches uuid[];
  created boolean := false;
  linked uuid;
  existing_linkedin text;
begin
  if p_actor is null or p_key is null or p_action is null or p_action not in ('prepare_outreach','route_outreach')
    or jsonb_typeof(p_target) is distinct from 'object'
    or p_target - array['target_name','company','role_title','email','linkedin_identity','linkedin_url','notes'] <> '{}'::jsonb
    or nullif(trim(p_target->>'target_name'),'') is null
    or (nullif(p_target->>'linkedin_identity','') is null and nullif(p_target->>'email','') is null)
    then raise exception 'invalid_promotion'; end if;

  -- Includes legacy/import writers which do not take an advisory identity lock.
  -- No provider calls occur while this short transaction holds the lock.
  lock table public.growth_targets in share row exclusive mode;
  select * into item from public.acquisition_items
    where id=p_item_id and organisation_id=p_organisation_id for update;
  if not found then raise exception 'acquisition_item_not_found'; end if;
  if item.record_type not in ('b2b_lead','partner_opportunity') then raise exception 'unsupported_type'; end if;
  if item.status not in ('accepted','actioned','nurture') then raise exception 'acquisition_item_changed'; end if;
  if exists(select 1 from public.acquisition_item_events where acquisition_item_id=p_item_id and idempotency_key=p_key and action<>p_action)
    then raise exception 'idempotency_key_reused'; end if;

  linked := nullif(item.metadata->'handoff'->>'target_id','')::uuid;
  if linked is not null and not exists(select 1 from public.growth_targets where id=linked and organisation_id=p_organisation_id)
    then raise exception 'linked_target_identity_conflict'; end if;
  select array_agg(id) into matches from public.growth_targets
    where organisation_id=p_organisation_id and (
      id=linked or acquisition_item_id=p_item_id
      or (source_type=item.source_engine and source_record_id=item.source_record_id)
      or (p_target->>'linkedin_identity' is not null and linkedin_identity=p_target->>'linkedin_identity')
      or (p_target->>'linkedin_identity' is not null and replace(regexp_replace(regexp_replace(
        lower(split_part(split_part(linkedin_url,'?',1),'#',1)),'^https?://(www\.)?',''), '/$',''),'/comm/in/','/in/')=p_target->>'linkedin_identity')
      or (p_target->>'email' is not null and lower(trim(email))=lower(p_target->>'email'))
      or (item.person is not null and p_target->>'company' is not null and lower(trim(target_name))=lower(trim(item.person))
        and lower(trim(company))=lower(trim(p_target->>'company')))
    );
  if coalesce(cardinality(matches),0)>1 then raise exception 'ambiguous_target_identity'; end if;
  if cardinality(matches)=1 then
    select * into target from public.growth_targets where id=matches[1] and organisation_id=p_organisation_id for update;
    existing_linkedin := coalesce(target.linkedin_identity,replace(regexp_replace(regexp_replace(
      lower(split_part(split_part(target.linkedin_url,'?',1),'#',1)),'^https?://(www\.)?',''), '/$',''),'/comm/in/','/in/'));
    if (existing_linkedin is not null and p_target->>'linkedin_identity' is not null and existing_linkedin<>p_target->>'linkedin_identity')
      or (target.email is not null and p_target->>'email' is not null and lower(trim(target.email))<>lower(p_target->>'email'))
      or (item.person is not null and target.target_name is not null and lower(trim(target.target_name))<>lower(trim(item.person))
        and lower(trim(target.target_name)) is distinct from lower(trim(target.company)))
      then raise exception 'target_identity_conflict'; end if;
    if linked=target.id and exists(select 1 from public.acquisition_item_events where organisation_id=p_organisation_id
      and acquisition_item_id=p_item_id and idempotency_key=(item.metadata->'handoff'->>'idempotency_key')::uuid
      and action=item.metadata->'handoff'->>'action') then
      return jsonb_build_object('targetId',target.id,'created',false,'duplicate',true,'item',to_jsonb(item));
    end if;
  end if;
  if item.updated_at is distinct from p_updated_at then raise exception 'acquisition_item_changed'; end if;
  if target.id is null then
    insert into public.growth_targets(organisation_id,target_name,company,role_title,email,linkedin_identity,linkedin_url,
      notes,stage,status,source_type,source_record_id,acquisition_item_id,owner_user_id)
    values(p_organisation_id,p_target->>'target_name',p_target->>'company',p_target->>'role_title',p_target->>'email',
      p_target->>'linkedin_identity',p_target->>'linkedin_url',p_target->>'notes','connection','active',
      item.source_engine,item.source_record_id,item.id,coalesce(item.owner_user_id,p_actor)) returning * into target;
    created := true;
  else
    -- Fill missing identity/context only; never reset a reused target's cadence.
    update public.growth_targets set email=coalesce(email,p_target->>'email'),
      linkedin_identity=coalesce(linkedin_identity,p_target->>'linkedin_identity'),
      linkedin_url=coalesce(linkedin_url,p_target->>'linkedin_url'),
      company=coalesce(company,p_target->>'company'),role_title=coalesce(role_title,p_target->>'role_title'),
      acquisition_item_id=coalesce(acquisition_item_id,item.id),owner_user_id=coalesce(owner_user_id,item.owner_user_id,p_actor)
      where id=target.id and organisation_id=p_organisation_id;
  end if;
  perform public.apply_acquisition_action(p_organisation_id,p_item_id,p_actor,item.status,p_action,'actioned',null,p_note,p_key,true);
  -- Retrying a legacy handoff receipt still upgrades its destination to a real target.
  update public.acquisition_items set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{handoff}',
    jsonb_build_object('action',p_action,'destination','/dashboard/growth/pipeline','target_id',target.id,
      'recorded_at',now(),'actor_user_id',p_actor,'idempotency_key',p_key)), updated_at=now()
    where id=p_item_id and organisation_id=p_organisation_id returning * into item;
  return jsonb_build_object('targetId',target.id,'created',created,'duplicate',not created,'item',to_jsonb(item));
end; $$;
revoke all on function public.promote_acquisition_target(uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.promote_acquisition_target(uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb) to service_role;
commit;
