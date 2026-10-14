begin;
-- Additive workspace metadata only. No lifecycle/source updates, seeds or backfill.
create table public.relationship_workspaces (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 entity_kind text not null check(entity_kind in ('person','company')), founder_only boolean not null default false,
 retention text not null default 'active' check(retention in ('active','archived','stale')), owner_user_id uuid,
 related_company_id uuid, created_by uuid not null, revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organisation_id,id), foreign key(organisation_id,related_company_id) references public.relationship_workspaces(organisation_id,id), check(related_company_id is null or related_company_id<>id)
);
create table public.relationship_source_links (
 organisation_id uuid not null, workspace_id uuid not null, source_table text not null check(source_table in ('inbox_items','growth_targets','acquisition_items','founder_research_records')), source_id uuid not null,
 linked_by uuid not null, linked_at timestamptz not null default clock_timestamp(),
 primary key(organisation_id,source_table,source_id), foreign key(organisation_id,workspace_id) references public.relationship_workspaces(organisation_id,id)
);
create index relationship_links_workspace on public.relationship_source_links(organisation_id,workspace_id);
create table public.relationship_activity_events (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, workspace_id uuid not null, actor uuid not null,
 activity_type text not null check(activity_type in ('note','activity','retention','value','task_created','task_state','company_link')),
 note_type text check(note_type in ('Observation','Strategic thought','Meeting note','Commitment','Reminder','Idea')),
 message text, occurred_at timestamptz, recorded_at timestamptz not null default clock_timestamp(),
 idempotency_key uuid not null, request jsonb not null check(jsonb_typeof(request)='object'), details jsonb not null check(jsonb_typeof(details)='object'),
 foreign key(organisation_id,workspace_id) references public.relationship_workspaces(organisation_id,id), unique(organisation_id,idempotency_key), unique(organisation_id,id),
 check(occurred_at is null or occurred_at<=recorded_at), check(activity_type<>'note' or (note_type is not null and length(btrim(message))>0)), check(length(message)<=500000)
);
create index relationship_events_timeline on public.relationship_activity_events(organisation_id,workspace_id,recorded_at,id);
create table public.relationship_tasks (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, workspace_id uuid not null, task text not null check(length(btrim(task)) between 1 and 2000),
 due_at timestamptz, owner_user_id uuid not null, status text not null default 'open' check(status in ('open','done','cancelled')), source text not null,
 created_by uuid not null, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organisation_id,id), foreign key(organisation_id,workspace_id) references public.relationship_workspaces(organisation_id,id)
);
create index relationship_tasks_workspace on public.relationship_tasks(organisation_id,workspace_id,due_at);
create table public.relationship_pricing_models (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), version bigint not null check(version>0),
 is_default boolean not null default true, config jsonb not null check(jsonb_typeof(config)='object'), created_by uuid not null, created_at timestamptz not null default clock_timestamp(),
 unique(organisation_id,id),unique(organisation_id,version)
);
create unique index relationship_pricing_default on public.relationship_pricing_models(organisation_id) where is_default;
create table public.relationship_value_assessments (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, workspace_id uuid not null, pricing_model_id uuid,
 calculation_version integer not null default 1 check(calculation_version=1), input jsonb not null check(jsonb_typeof(input)='object'), result jsonb not null check(jsonb_typeof(result)='object'),
 actor uuid not null, recorded_at timestamptz not null default clock_timestamp(), event_id uuid not null,
 foreign key(organisation_id,workspace_id) references public.relationship_workspaces(organisation_id,id), foreign key(organisation_id,pricing_model_id) references public.relationship_pricing_models(organisation_id,id), foreign key(organisation_id,event_id) references public.relationship_activity_events(organisation_id,id), unique(event_id)
);
create index relationship_values_latest on public.relationship_value_assessments(organisation_id,workspace_id,recorded_at desc,id);
create index relationship_workspaces_tenant on public.relationship_workspaces(organisation_id,retention,updated_at desc);
-- Server-only access. All mutations go through the single scoped, atomic RPC.
do $$ declare t text; begin foreach t in array array['relationship_workspaces','relationship_source_links','relationship_activity_events','relationship_tasks','relationship_pricing_models','relationship_value_assessments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to service_role',t);
 end loop; end $$;
create function public.guard_relationship_source() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare valid boolean; private boolean; begin
 if tg_op='UPDATE' then raise exception 'Relationship source links are immutable'; end if;
 if new.source_table not in ('inbox_items','growth_targets','acquisition_items','founder_research_records') then raise exception 'Unsupported source';end if;
 execute format('select exists(select 1 from public.%I where organisation_id=$1 and id=$2)',new.source_table) into valid using new.organisation_id,new.source_id;
 if not valid then raise exception 'Source does not belong to tenant';end if;
 select founder_only into private from public.relationship_workspaces where organisation_id=new.organisation_id and id=new.workspace_id;
 if new.source_table='founder_research_records' and not coalesce(private,false) then raise exception 'Founder evidence requires protected workspace';end if;
 return new;end $$;
create trigger relationship_source_guard before insert or update on public.relationship_source_links for each row execute function public.guard_relationship_source();
create function public.guard_relationship_workspace() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.organisation_id<>old.organisation_id or new.entity_kind<>old.entity_kind or new.created_by<>old.created_by or old.founder_only and not new.founder_only) then raise exception 'Relationship ownership is immutable';end if;
 if new.related_company_id is not null and (new.entity_kind<>'person' or not exists(select 1 from public.relationship_workspaces where organisation_id=new.organisation_id and id=new.related_company_id and entity_kind='company' and (not founder_only or new.founder_only))) then raise exception 'Invalid company relationship';end if;
 return new;end $$;
create trigger relationship_workspace_guard before insert or update on public.relationship_workspaces for each row execute function public.guard_relationship_workspace();
revoke all on function public.guard_relationship_source(),public.guard_relationship_workspace() from public,anon,authenticated,service_role;
create function public.apply_relationship_workspace_action(p_org uuid,p_actor uuid,p_refs jsonb,p_kind text,p_founder boolean,p_workspace uuid,p_revision bigint,p_key uuid,p_action text,p_details jsonb,p_request jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.relationship_workspaces; prior public.relationship_activity_events; ref jsonb; ids uuid[]; valid boolean; private boolean; stamp timestamptz:=clock_timestamp(); ev uuid; model uuid; version_no bigint; task_id uuid; actual timestamptz;begin
 -- Serialize only workspace metadata writes within this tenant, including lazy creation.
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,742));
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin','manager')) then raise exception 'Workspace actor is not authorised for tenant';end if;
 if p_actor is null or p_key is null or p_request is null or jsonb_typeof(p_request)<>'object' or p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid action';end if;
 if p_refs is null or jsonb_typeof(p_refs)<>'array' or jsonb_array_length(p_refs)=0 or jsonb_array_length(p_refs)>1000 then raise exception 'Existing relationship evidence required';end if;
 select * into prior from public.relationship_activity_events where organisation_id=p_org and idempotency_key=p_key;
 if found then
  if prior.actor<>p_actor or prior.request is distinct from p_request then raise exception 'idempotency_key_reused';end if;
  if exists(select 1 from public.relationship_workspaces where id=prior.workspace_id and organisation_id=p_org and founder_only) and not p_founder then raise exception 'Founder access required';end if;
  return jsonb_build_object('workspaceId',prior.workspace_id,'duplicate',true);
 end if;
 private:=false;
 for ref in select * from jsonb_array_elements(p_refs) loop
  if ref->>'table' not in ('inbox_items','growth_targets','acquisition_items','founder_research_records') then raise exception 'Unsupported source';end if;
  execute format('select exists(select 1 from public.%I where organisation_id=$1 and id=$2)',ref->>'table') into valid using p_org,(ref->>'id')::uuid;
  if not valid then raise exception 'Source does not belong to tenant';end if;
  if ref->>'table'='founder_research_records' then private:=true;end if;
 end loop;
 if private and not p_founder then raise exception 'Founder access required';end if;
 select array_agg(distinct l.workspace_id) into ids from public.relationship_source_links l where l.organisation_id=p_org and exists(select 1 from jsonb_array_elements(p_refs) r where r->>'table'=l.source_table and (r->>'id')::uuid=l.source_id);
 if coalesce(cardinality(ids),0)>1 then raise exception 'Duplicate relationship workspaces require explicit review';end if;
 if p_workspace is not null and cardinality(ids)=1 and p_workspace<>ids[1] then raise exception 'Relationship changed';end if;
 if cardinality(ids)=1 or p_workspace is not null then
  select * into w from public.relationship_workspaces where organisation_id=p_org and id=coalesce(p_workspace,ids[1]) for update;
  if not found then raise exception 'Relationship not found';end if;
  if w.founder_only and not p_founder then raise exception 'Founder access required';end if;
  if w.entity_kind<>p_kind then raise exception 'Person/company identity conflict';end if;
  if p_revision is null or w.revision<>p_revision then raise exception 'Relationship changed; reload';end if;
 else
  if p_revision is not null then raise exception 'Relationship changed';end if;
  insert into public.relationship_workspaces(organisation_id,entity_kind,founder_only,created_by) values(p_org,p_kind,private,p_actor) returning * into w;
 end if;
 if private and not w.founder_only then update public.relationship_workspaces set founder_only=true where id=w.id;end if;
 for ref in select * from jsonb_array_elements(p_refs) loop
  insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by) values(p_org,w.id,ref->>'table',(ref->>'id')::uuid,p_actor) on conflict do nothing;
 end loop;
 actual:=case when p_details->>'timeChoice'='now' then stamp else nullif(p_details->>'occurredAt','')::timestamptz end;
 if actual>stamp then raise exception 'Activity time cannot be in the future';end if;
 if p_action='note' then
  if p_details->>'noteType' is null or p_details->>'noteType' not in ('Observation','Strategic thought','Meeting note','Commitment','Reminder','Idea') or nullif(btrim(p_details->>'message'),'') is null then raise exception 'Typed note required';end if;
 elsif p_action='activity' then
  if p_details->>'activityType' is null or p_details->>'activityType' not in ('emailed','linkedin_contacted','called','meeting','note') or p_details->>'confirmed'<>'true' then raise exception 'Confirm manual activity';end if;
 elsif p_action='retention' then
  if p_details->>'retention' is null or p_details->>'retention' not in ('active','archived','stale') then raise exception 'Invalid retention';end if;
  update public.relationship_workspaces set retention=p_details->>'retention' where id=w.id;
 elsif p_action='company_link' then
  update public.relationship_workspaces set related_company_id=(p_details->>'companyId')::uuid where organisation_id=p_org and id=w.id;
 elsif p_action='task_created' then
  if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=(p_details->>'owner')::uuid) then raise exception 'Task owner must belong to tenant';end if;
  insert into public.relationship_tasks(organisation_id,workspace_id,task,due_at,owner_user_id,source,created_by) values(p_org,w.id,p_details->>'task',nullif(p_details->>'dueAt','')::timestamptz,(p_details->>'owner')::uuid,coalesce(nullif(p_details->>'source',''),'User-created relationship task'),p_actor) returning id into task_id;
 elsif p_action='task_state' then
  if p_details->>'status' is null or p_details->>'status' not in ('open','done','cancelled') then raise exception 'Invalid task state';end if;
  update public.relationship_tasks set status=p_details->>'status',updated_at=stamp where organisation_id=p_org and workspace_id=w.id and id=(p_details->>'taskId')::uuid returning id into task_id;
  if task_id is null then raise exception 'Task not found';end if;
 elsif p_action='value' then
  if jsonb_typeof(p_details->'calculation') is distinct from 'object' then raise exception 'Calculation required';end if;
 else raise exception 'Unsupported relationship action';end if;
 insert into public.relationship_activity_events(organisation_id,workspace_id,actor,activity_type,note_type,message,occurred_at,idempotency_key,request,details)
 values(p_org,w.id,p_actor,p_action,case when p_action='note' then p_details->>'noteType' end,p_details->>'message',case when p_action in ('note','activity') then actual else stamp end,p_key,p_request,p_details||jsonb_build_object('taskId',task_id,'previousRetention',w.retention)) returning id into ev;
 if p_action='value' then
  model:=nullif(p_details->'calculation'->'input'->>'pricingModelId','')::uuid;
  if coalesce((p_details->>'saveTenantDefault')::boolean,false) then
   if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin')) then raise exception 'Only owner/admin may change tenant pricing';end if;
   select coalesce(max(version),0)+1 into version_no from public.relationship_pricing_models where organisation_id=p_org;
   update public.relationship_pricing_models set is_default=false where organisation_id=p_org and is_default;
   insert into public.relationship_pricing_models(organisation_id,version,config,created_by) values(p_org,version_no,(p_details->'calculation'->'input')-array['totalEmployees','eligibleEmployees','expectedQuantity','expectedRate','revenueBasis','potentialManual','expectedManual','oneOffPotential','oneOffExpected','services','basis','quantitySource','pricingModelId','pricingVersion'],p_actor) returning id into model;
  end if;
  insert into public.relationship_value_assessments(organisation_id,workspace_id,pricing_model_id,input,result,actor,event_id) values(p_org,w.id,model,(p_details->'calculation'->'input')||case when version_no is not null then jsonb_build_object('pricingModelId',model,'pricingVersion',version_no) else '{}'::jsonb end,jsonb_set(p_details->'calculation','{input}',(p_details->'calculation'->'input')||case when version_no is not null then jsonb_build_object('pricingModelId',model,'pricingVersion',version_no) else '{}'::jsonb end),p_actor,ev);
 end if;
 update public.relationship_workspaces set revision=revision+1,updated_at=stamp where organisation_id=p_org and id=w.id;
 return jsonb_build_object('workspaceId',w.id,'duplicate',false);
end $$;
revoke all on function public.apply_relationship_workspace_action(uuid,uuid,jsonb,text,boolean,uuid,bigint,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.apply_relationship_workspace_action(uuid,uuid,jsonb,text,boolean,uuid,bigint,uuid,text,jsonb,jsonb) to service_role;
commit;
