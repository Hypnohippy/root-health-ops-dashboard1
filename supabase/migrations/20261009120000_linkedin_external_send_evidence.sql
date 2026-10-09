begin;
-- Explicit external send evidence; service-only, tenant/revision locked and idempotent.
create or replace function public.record_linkedin_send_evidence(p_organisation_id uuid, p_actor uuid, p_table text, p_id uuid, p_revision bigint, p_key uuid, p_details jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version bigint; previous jsonb; receipt jsonb; sent timestamptz; confirmed timestamptz := clock_timestamp(); next_stage text; sent_stage text; target public.growth_targets%rowtype; item public.inbox_items%rowtype; correction boolean := coalesce((p_details->>'correction')::boolean,false);
begin
 if p_actor is null or p_key is null or p_table not in ('growth_targets','inbox_items') or nullif(trim(p_details->>'message'),'') is null or length(p_details->>'message')>50000 or p_details->>'choice' not in ('now','today','historical','unknown','conversation') then raise exception 'invalid_send_evidence'; end if;
 sent := case when p_details->>'choice'='unknown' or p_details->>'choice'='conversation' and p_details->>'status'='unknown' then null when p_details->>'choice'='now' then coalesce((p_details->>'sentAt')::timestamptz,confirmed) else (p_details->>'sentAt')::timestamptz end;
 if not (p_details->>'choice'='unknown' or p_details->>'choice'='conversation' and p_details->>'status'='unknown') and (sent is null or sent>confirmed) then raise exception 'invalid_external_send_date'; end if;
 if p_details->>'choice'='conversation' and sent is not null and p_details->>'earliestOutboundConfirmed' is distinct from 'true' then raise exception 'earliest_outbound_confirmation_required'; end if;
 insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
 select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id for update;
 if p_table='growth_targets' then
  select * into target from public.growth_targets where organisation_id=p_organisation_id and id=p_id for update;
  if not found then raise exception 'record_not_found'; end if;
  previous:=target.manual_completion;
  if previous is null and target.source_type='lifecycle_connection_accepted' and target.stage<>'connection' then
   select manual_completion into previous from public.inbox_items where organisation_id=p_organisation_id and id::text=target.source_record_id and platform='linkedin' and kind='connection_accepted' and manual_completion->>'historical_send_date_status'='verified' and manual_completion->>'stage'='connection';
  end if;
 else
  select * into item from public.inbox_items where organisation_id=p_organisation_id and id=p_id for update;
  if not found or item.platform is distinct from 'linkedin' or item.kind is distinct from 'connection_accepted' then raise exception 'verified_acceptance_required'; end if;
  previous:=item.manual_completion;
 end if;
 if previous->>'key'=p_key::text or exists(select 1 from jsonb_array_elements(coalesce(previous->'history','[]')) r where r->>'key'=p_key::text) then return jsonb_build_object('duplicate',true); end if;
 if version is distinct from p_revision then raise exception 'stale_send_plan'; end if;
 if correction then
  if previous is null or nullif(trim(previous->>'key'),'') is null or nullif(trim(previous->>'actor'),'') is null or nullif(trim(previous->>'evidence'),'') is null or previous->>'message' is distinct from p_details->>'message' then raise exception 'original_receipt_required'; end if;
  if previous->>'stage' is distinct from 'connection' and (previous ? 'stage' or jsonb_array_length(coalesce(previous->'history','[]'))<>0) then raise exception 'first_send_classification_only'; end if;
  if p_table='growth_targets' and target.stage not in ('connection','day3_dm','day3_followup') then raise exception 'later_cadence_requires_review'; end if;
 else
  if p_table='inbox_items' and (previous is not null or item.status in ('replied','archived')) then raise exception 'already_contacted'; end if;
  if p_table='growth_targets' and target.stage='connection' and (previous is not null or target.last_action_at is not null) then raise exception 'already_contacted'; end if;
 end if;
 if p_table='growth_targets' and (target.status not in ('active','waiting') or target.replied_at is not null or coalesce(target.reply_status,'') not in ('','no_reply') or target.deal_stage in ('meeting','nurture','lost','closed','converted','won','engaged','opportunity')) then raise exception 'stronger_state'; end if;
 sent_stage:=case when correction or p_table='inbox_items' then 'connection' else p_details->>'sentStage' end;
 next_stage:=case sent_stage when 'connection' then 'day3_followup' when 'day3_followup' then 'day7_parity' when 'day7_parity' then 'day14_insight' when 'day14_insight' then 'day28_relevance' when 'day28_relevance' then 'day42_close' when 'day42_close' then 'parked' else null end;
 if next_stage is null then raise exception 'invalid_cadence_stage'; end if;
 if sent_stage='connection' and sent is not null then
  next_stage:=case when sent<=confirmed-interval '42 days' then 'day42_close' when sent<=confirmed-interval '28 days' then 'day28_relevance' when sent<=confirmed-interval '14 days' then 'day14_insight' when sent<=confirmed-interval '7 days' then 'day7_parity' else 'day3_followup' end;
 end if;
 receipt:=jsonb_build_object('key',p_key,'actor',p_actor,'completed_at',confirmed,'confirmed_at',confirmed,'recorded_at',confirmed,'sent_at',sent,'stage',sent_stage,'message',p_details->>'message','source',p_details->>'source','content_kind',case when p_details->>'choice'='conversation' then 'conversation_history_pasted' else 'single_outbound_message' end,'earliest_verified_outbound_at',case when p_details->>'choice'='conversation' then sent else null end,'date_basis',case when p_details->>'choice'='conversation' then 'User explicitly confirmed earliest outbound date; no dates inferred from pasted text' else 'User confirmed external send date' end,'evidence',case when p_details->>'choice'='conversation' then 'User explicitly confirmed pasted LinkedIn conversation history and earliest outbound date status; no individual message dates inferred.' else 'User explicitly confirmed the exact message and external LinkedIn send classification.' end,'correction_type',case when correction then 'first_send_classification' else 'manual_send_confirmation' end,'historical_send_date_status',case when sent is null then 'unknown' else 'verified' end,'timezone',p_details->>'timezone','sent_time_precision',p_details->>'precision','history',coalesce(previous->'history','[]') || case when previous is null then '[]'::jsonb else jsonb_build_array(previous-'history') end);
 if p_table='growth_targets' then
  update public.growth_targets set manual_completion=receipt,stage=next_stage,status=case when next_stage='parked' then 'parked' else 'active' end,last_action_at=sent,last_reply_text=p_details->>'message',first_outbound_at=case when sent_stage='connection' then sent else first_outbound_at end,first_outbound_text=case when sent_stage='connection' then p_details->>'message' else first_outbound_text end where organisation_id=p_organisation_id and id=p_id;
 else
  update public.inbox_items set manual_completion=receipt,status='replied',response_state='waiting_for_human',contacted_at=sent,last_replied_at=sent,last_reply_text=p_details->>'message',follow_up_at=null where organisation_id=p_organisation_id and id=p_id;
 end if;
 return jsonb_build_object('duplicate',false,'sentAt',sent,'confirmedAt',confirmed);
end; $$;
revoke all on function public.record_linkedin_send_evidence(uuid,uuid,text,uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_linkedin_send_evidence(uuid,uuid,text,uuid,bigint,uuid,jsonb) to service_role;
commit;
