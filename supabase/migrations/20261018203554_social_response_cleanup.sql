begin;
-- Reuse the existing event-level no-reply state and response_item_events audit.
-- Keep the provider key on inbox_items: pull's ON CONFLICT DO NOTHING preserves it.
create or replace function public.dismiss_social_responses(
  p_organisation_id uuid, p_ids uuid[], p_actor_user_id uuid, p_reason text, p_idempotency_key uuid
) returns setof public.inbox_items language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.inbox_items; stamp timestamptz := clock_timestamp();
begin
  if p_organisation_id is null or p_actor_user_id is null or p_idempotency_key is null or
    coalesce(cardinality(p_ids),0) not between 1 and 100 or array_position(p_ids,null) is not null or
    (p_reason is not null and p_reason not in ('Promotional solicitation','Spam / irrelevant','Not an opportunity','Other')) then
    raise exception 'invalid_dismissal';
  end if;
  -- Lock deterministically; invalid/mixed-tenant batches never partially apply.
  perform id from public.inbox_items where organisation_id=p_organisation_id and id=any(p_ids) order by id for update;
  if (select count(*) from public.inbox_items where organisation_id=p_organisation_id and id=any(p_ids)
      and platform in ('instagram','facebook','threads','reddit','tiktok','linkedin')
      and kind in ('comment','dm','mention','reaction')
      and coalesce(response_state,'') not in ('converted','closed_or_lost'))
      <> (select count(distinct id) from unnest(p_ids) id) then
    raise exception using errcode='P0002',message='social_response_not_found';
  end if;
  for item in select * from public.inbox_items where organisation_id=p_organisation_id and id=any(p_ids) order by id loop
    if (item.response_state is distinct from 'no_reply_needed' or item.status is distinct from 'archived') and
      not exists(select 1 from public.response_item_events where inbox_item_id=item.id and idempotency_key=p_idempotency_key) then
      update public.inbox_items set response_state='no_reply_needed',status='archived',follow_up_at=null,response_updated_at=stamp
        where organisation_id=p_organisation_id and id=item.id;
      insert into public.response_item_events(organisation_id,inbox_item_id,actor_user_id,action,previous_state,new_state,note,idempotency_key)
        values(p_organisation_id,item.id,p_actor_user_id,'dismissed',item.response_state,'no_reply_needed',p_reason,p_idempotency_key);
    end if;
  end loop;
  return query select * from public.inbox_items where organisation_id=p_organisation_id and id=any(p_ids);
end; $$;
revoke all on function public.dismiss_social_responses(uuid,uuid[],uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.dismiss_social_responses(uuid,uuid[],uuid,text,uuid) to service_role;
commit;
