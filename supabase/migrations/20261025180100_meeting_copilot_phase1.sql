begin;
-- PROPOSED ONLY: private meeting workflow metadata; canonical memory remains relationship_activity_events.
create table public.meeting_copilot_sessions (
 id uuid primary key, organisation_id uuid not null references public.organisations(id), user_id uuid not null references auth.users(id),
 appointment_id text not null, relationship_id text not null, context jsonb not null check(jsonb_typeof(context)='object'),
 status text not null default 'draft' check(status in ('draft','live','review','approved')), version integer not null default 1,
 started_at timestamptz not null default clock_timestamp(), ended_at timestamptz, approved_at timestamptz,
 result jsonb, retained_transcript jsonb, unique(organisation_id,user_id,id)
);
create unique index meeting_copilot_one_live_user on public.meeting_copilot_sessions(user_id) where status='live';
create table public.meeting_copilot_usage (
 id bigint generated always as identity primary key, organisation_id uuid not null,user_id uuid not null,session_id uuid not null,
 sequence integer not null check(sequence>=0), seconds integer not null check(seconds between 0 and 10),
 reasoning_tokens integer not null default 0 check(reasoning_tokens>=0), transcription_tokens integer check(transcription_tokens>=0),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(organisation_id,user_id,session_id) references public.meeting_copilot_sessions(organisation_id,user_id,id), unique(session_id,sequence)
);
create index meeting_copilot_month on public.meeting_copilot_usage(user_id,created_at);
alter table public.meeting_copilot_sessions enable row level security;
alter table public.meeting_copilot_usage enable row level security;
revoke all on public.meeting_copilot_sessions,public.meeting_copilot_usage from public,anon,authenticated;
grant select,insert,update on public.meeting_copilot_sessions,public.meeting_copilot_usage to service_role;
grant usage,select on sequence public.meeting_copilot_usage_id_seq to service_role;
create function public.meeting_copilot_command(p_org uuid,p_actor uuid,p_id uuid,p_command text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.meeting_copilot_sessions; used integer; total integer; dur integer;
begin
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role) in ('owner','admin','manager')) then raise exception 'Meeting access unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,8351));
 if p_command='start' then
  if nullif(p_data->>'appointmentId','') is null or nullif(p_data->>'relationshipId','') is null or jsonb_typeof(p_data->'context') is distinct from 'object' then raise exception 'Exact appointment required';end if;
  update public.meeting_copilot_sessions set status='review',ended_at=clock_timestamp(),version=version+1 where user_id=p_actor and status='live' and started_at<clock_timestamp()-interval '90 minutes';
  if exists(select 1 from public.meeting_copilot_sessions where user_id=p_actor and status='live') then raise exception 'End your existing meeting first';end if;
  select coalesce(sum(seconds),0) into used from public.meeting_copilot_usage where user_id=p_actor and created_at>=date_trunc('month',clock_timestamp());
  if used>=36000 then raise exception 'Monthly meeting allowance reached';end if;
  insert into public.meeting_copilot_sessions(id,organisation_id,user_id,appointment_id,relationship_id,context,status) values(p_id,p_org,p_actor,p_data->>'appointmentId',p_data->>'relationshipId',p_data->'context','live') returning * into s;
 else
  select * into s from public.meeting_copilot_sessions where organisation_id=p_org and user_id=p_actor and id=p_id for update;
  if not found then raise exception 'Meeting unavailable';end if;
  if p_command='reserve' then
   dur:=(p_data->>'seconds')::integer;
   if s.status<>'live' or clock_timestamp()>s.started_at+interval '90 minutes' or dur not between 1 and 10 then raise exception 'Meeting capture ended';end if;
   select coalesce(sum(seconds),0) into used from public.meeting_copilot_usage where user_id=p_actor and created_at>=date_trunc('month',clock_timestamp());
   select coalesce(sum(seconds),0) into total from public.meeting_copilot_usage where session_id=p_id;
   if used+dur>36000 or total+dur>extract(epoch from clock_timestamp()-s.started_at)+15 then raise exception 'Meeting allowance reached';end if;
   insert into public.meeting_copilot_usage(organisation_id,user_id,session_id,sequence,seconds) values(p_org,p_actor,p_id,(p_data->>'sequence')::integer,dur);
  elsif p_command='review_claim' then
   if s.status<>'review' or not exists(select 1 from public.meeting_copilot_usage where session_id=p_id and seconds>0) then raise exception 'Recorded capture required';end if;
   if (select count(*) from public.meeting_copilot_usage where user_id=p_actor and sequence=2147483647 and created_at>=date_trunc('month',clock_timestamp()))>=120 then raise exception 'Review allowance reached';end if;
   insert into public.meeting_copilot_usage(organisation_id,user_id,session_id,sequence,seconds) values(p_org,p_actor,p_id,2147483647,0);
  elsif p_command='end' then
   if s.status='live' then update public.meeting_copilot_sessions set status='review',ended_at=clock_timestamp(),version=version+1 where id=s.id returning * into s;end if;
  else raise exception 'Unsupported meeting operation';end if;
 end if;
 return to_jsonb(s);
end;$$;
revoke all on function public.meeting_copilot_command(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.meeting_copilot_command(uuid,uuid,uuid,text,jsonb) to service_role;
-- Atomic approval bridge: source revision and session ownership are checked in the same transaction as the existing canonical writer.
create function public.meeting_copilot_promote(p_org uuid,p_actor uuid,p_id uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.meeting_copilot_sessions; v bigint; c jsonb; outcome jsonb; details jsonb; kind text; key uuid;
begin
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role) in ('owner','admin','manager')) then raise exception 'Meeting access unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,8351));
 select revision into v from public.lifecycle_revisions where organisation_id=p_org for update;
 if v is null or v is distinct from (p_data->>'lifecycleRevision')::bigint then raise exception 'Meeting evidence changed';end if;
 select * into s from public.meeting_copilot_sessions where id=p_id and organisation_id=p_org and user_id=p_actor for update;
 if not found or p_data->>'confirmed' is distinct from 'true' then raise exception 'Meeting approval required';end if;
 c:=p_data->'context';
 if ((c->'attachment')-'locator'-'title') is distinct from ((s.context->'attachment')-'locator'-'title') then raise exception 'Appointment linkage changed';end if;
 if p_data->>'operation'='note' then
  if s.status<>'review' or s.version is distinct from (p_data->>'version')::integer or nullif(btrim(p_data->>'summary'),'') is null or length(p_data->>'summary')>12000 then raise exception 'Meeting review changed';end if;
  kind:='note';key:=s.id;details:=jsonb_build_object('noteType','Meeting note','message',p_data->>'summary','occurredAt',s.started_at,'timeChoice','actual','source','Meeting Copilot - user-approved','meetingSessionId',s.id,'appointmentId',s.appointment_id,'relationshipId',s.relationship_id);
 elsif p_data->>'operation'='task' then
  if s.status<>'approved' or nullif(btrim(p_data->>'task'),'') is null or length(p_data->>'task')>1000 then raise exception 'Approved task required';end if;
  kind:='task_created';key:=(p_data->>'key')::uuid;details:=jsonb_build_object('task',p_data->>'task','owner',p_actor,'source','Meeting Copilot approved task; session '||s.id::text);
 else raise exception 'Unsupported promotion';end if;
 outcome:=public.apply_relationship_workspace_action(p_org,p_actor,c->'refs',c->>'kind',coalesce((c->>'canFounder')::boolean,false),nullif(c->>'workspaceId','')::uuid,nullif(c->>'revision','')::bigint,key,kind,details,jsonb_build_object('source','meeting_copilot','sessionId',s.id,'appointmentId',s.appointment_id));
 if kind='note' then update public.meeting_copilot_sessions set status='approved',approved_at=clock_timestamp(),version=version+1,result=outcome||jsonb_build_object('approvedSummary',p_data->>'summary'),retained_transcript=case when p_data->>'retainTranscript'='true' then p_data->'transcript' else null end where id=s.id;end if;
 return outcome;
end;$$;
revoke all on function public.meeting_copilot_promote(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.meeting_copilot_promote(uuid,uuid,uuid,jsonb) to service_role;
commit;
