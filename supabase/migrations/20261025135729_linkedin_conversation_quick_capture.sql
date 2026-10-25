-- PROPOSED ONLY. Atomic wrapper around the existing canonical per-message writer.
-- No new store; never applies automatically with a Vercel deployment.
begin;
create or replace function public.append_linkedin_conversation_batch(
 p_organisation_id uuid,p_actor uuid,p_identity text,p_revision bigint,p_refs jsonb,p_messages jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare version bigint; item jsonb; existing public.linkedin_conversation_messages%rowtype;
 duplicates integer:=0; appended integer:=0; result jsonb;
begin
 if p_actor is null or p_identity is null or p_identity !~ '^linkedin.com/in/[^/]+$'
 or jsonb_typeof(p_messages) is distinct from 'array'
 or jsonb_array_length(p_messages) not between 1 and 100
 or jsonb_typeof(p_refs) is distinct from 'array' or jsonb_array_length(p_refs)=0
 or not exists(select 1 from public.organisation_members where organisation_id=p_organisation_id and user_id=p_actor and lower(role) in ('owner','admin','manager'))
 then raise exception 'invalid_conversation_batch'; end if;
 if (select count(distinct value->>'key') from jsonb_array_elements(p_messages)) <> jsonb_array_length(p_messages) then raise exception 'duplicate_batch_key'; end if;
 insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
 select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id for update;
 -- Retried receipts must have the same identity AND payload, never merely the same key.
 for item in select value from jsonb_array_elements(p_messages) loop
  select * into existing from public.linkedin_conversation_messages where organisation_id=p_organisation_id and receipt_key=(item->>'key')::uuid;
  if found then
   if existing.linkedin_identity is distinct from p_identity
   or existing.direction is distinct from item->'details'->>'direction'
   or existing.message is distinct from item->'details'->>'message'
   or existing.message_at is distinct from (item->'details'->>'messageAt')::timestamptz
   or existing.time_precision is distinct from item->'details'->>'precision'
   then raise exception 'conversation_retry_payload_changed'; end if;
   duplicates:=duplicates+1;
  end if;
 end loop;
 if duplicates=jsonb_array_length(p_messages) then return jsonb_build_object('appended',0,'duplicates',duplicates,'revision',version::text); end if;
 if version is distinct from p_revision then raise exception 'stale_conversation_plan'; end if;
 for item in select value from jsonb_array_elements(p_messages) loop
  select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id;
  result:=public.append_linkedin_conversation_message(p_organisation_id,p_actor,p_identity,version,(item->>'key')::uuid,item->'details',p_refs);
  if not coalesce((result->>'duplicate')::boolean,false) then appended:=appended+1; end if;
 end loop;
 select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id;
 return jsonb_build_object('appended',appended,'duplicates',duplicates,'revision',version::text);
end;
$$;
revoke all on function public.append_linkedin_conversation_batch(uuid,uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.append_linkedin_conversation_batch(uuid,uuid,text,bigint,jsonb,jsonb) to service_role;
commit;
