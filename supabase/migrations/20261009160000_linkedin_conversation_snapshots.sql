begin;
alter table public.linkedin_conversation_messages drop constraint linkedin_conversation_messages_direction_check;
alter table public.linkedin_conversation_messages add constraint linkedin_conversation_messages_direction_check check(direction in ('inbound','outbound','snapshot'));
alter table public.linkedin_conversation_messages add column contains_inbound_reply boolean not null default false, add column earliest_outbound_at timestamptz;
alter table public.growth_targets add column linkedin_cadence_anchor jsonb;
alter table public.inbox_items add column linkedin_cadence_anchor jsonb;
alter table public.acquisition_items add column linkedin_cadence_anchor jsonb;
create function public.append_linkedin_conversation_snapshot(p_organisation_id uuid,p_actor uuid,p_identity text,p_revision bigint,p_key uuid,p_details jsonb,p_refs jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version bigint; ref jsonb; entry uuid; earliest timestamptz; anchor jsonb; inbound boolean; confirmed timestamptz:=clock_timestamp();
begin
 if p_actor is null or p_key is null or p_identity !~ '^linkedin.com/in/[^/]+$' or nullif(trim(p_details->>'message'),'') is null or length(p_details->>'message')>500000 or jsonb_typeof(p_details->'containsInboundReply') is distinct from 'boolean' or jsonb_typeof(p_refs) is distinct from 'array' or jsonb_array_length(p_refs)=0 then raise exception 'invalid_conversation_snapshot'; end if;
 earliest:=(p_details->>'earliestOutboundAt')::timestamptz;inbound:=(p_details->>'containsInboundReply')::boolean;
 if earliest>confirmed then raise exception 'future_outbound_date'; end if;
 insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
 select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id for update;
 select id into entry from public.linkedin_conversation_messages where organisation_id=p_organisation_id and receipt_key=p_key;
 if found then return jsonb_build_object('duplicate',true,'id',entry); end if;
 if version is distinct from p_revision then raise exception 'stale_conversation_plan'; end if;
 for ref in select * from jsonb_array_elements(p_refs) loop
  if ref->>'table'='growth_targets' then perform 1 from public.growth_targets where organisation_id=p_organisation_id and id=(ref->>'id')::uuid for update;
  elsif ref->>'table'='inbox_items' then perform 1 from public.inbox_items where organisation_id=p_organisation_id and id=(ref->>'id')::uuid for update;
  elsif ref->>'table'='acquisition_items' then perform 1 from public.acquisition_items where organisation_id=p_organisation_id and id=(ref->>'id')::uuid for update;
  else raise exception 'unsupported_contact_record'; end if;
  if not found then raise exception 'foreign_or_missing_contact_record'; end if;
 end loop;
 insert into public.linkedin_conversation_messages(organisation_id,linkedin_identity,receipt_key,actor,direction,message,message_at,date_status,timezone,time_precision,source,contains_inbound_reply,earliest_outbound_at)
 values(p_organisation_id,p_identity,p_key,p_actor,'snapshot',p_details->>'message',null,'unknown',p_details->>'timezone',p_details->>'precision','manually reconciled from LinkedIn conversation',inbound,earliest) returning id into entry;
 anchor:=case when earliest is null then null else jsonb_build_object('key',p_key,'actor',p_actor,'message',p_details->>'message','evidence','User explicitly confirmed earliest outbound date for exact pasted conversation; no individual dates inferred','source','manually reconciled from LinkedIn conversation','content_kind','conversation_history_pasted','stage','connection','sent_at',earliest,'confirmed_at',confirmed,'historical_send_date_status','verified') end;
 for ref in select * from jsonb_array_elements(p_refs) loop
  if ref->>'table'='growth_targets' then update public.growth_targets set linkedin_previously_contacted=true,linkedin_conversation_active=linkedin_conversation_active or inbound,linkedin_cadence_anchor=coalesce(linkedin_cadence_anchor,anchor) where organisation_id=p_organisation_id and id=(ref->>'id')::uuid;
  elsif ref->>'table'='inbox_items' then update public.inbox_items set linkedin_previously_contacted=true,linkedin_conversation_active=linkedin_conversation_active or inbound,linkedin_cadence_anchor=coalesce(linkedin_cadence_anchor,anchor) where organisation_id=p_organisation_id and id=(ref->>'id')::uuid;
  else update public.acquisition_items set linkedin_previously_contacted=true,linkedin_conversation_active=linkedin_conversation_active or inbound,linkedin_cadence_anchor=coalesce(linkedin_cadence_anchor,anchor) where organisation_id=p_organisation_id and id=(ref->>'id')::uuid;
  end if;
 end loop;
 return jsonb_build_object('duplicate',false,'id',entry);
end; $$;
revoke all on function public.append_linkedin_conversation_snapshot(uuid,uuid,text,bigint,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.append_linkedin_conversation_snapshot(uuid,uuid,text,bigint,uuid,jsonb,jsonb) to service_role;
commit;
