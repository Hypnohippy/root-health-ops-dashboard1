begin;
-- Research is attached as evidence, not promoted to a canonical identity source.
alter table public.founder_research_records add column linked_relationship_workspace_id uuid;
alter table public.founder_research_records add constraint founder_research_relationship_tenant
 foreign key(organisation_id,linked_relationship_workspace_id) references public.relationship_workspaces(organisation_id,id);
create index founder_research_relationship on public.founder_research_records(organisation_id,linked_relationship_workspace_id)
 where linked_relationship_workspace_id is not null;
-- Review receipts are transport/idempotency evidence, not another identity store.
create table public.relationship_review_receipts (
 organisation_id uuid not null references public.organisations(id), request_id uuid not null,
 actor uuid not null, payload_hash text not null, result jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(), primary key(organisation_id,request_id)
);
alter table public.relationship_review_receipts enable row level security;
revoke all on public.relationship_review_receipts from public,anon,authenticated,service_role;
grant select on public.relationship_review_receipts to service_role;
create trigger relationship_review_receipt_immutable before update or delete on public.relationship_review_receipts
 for each row execute function public.guard_identity_decision_history();
create trigger relationship_review_receipt_no_truncate before truncate on public.relationship_review_receipts
 for each statement execute function public.guard_identity_decision_history();

-- Tenant-scoped snapshot includes every input to canonical identity/intake and
-- workspace revision. Return only a digest; never return protected source rows.
create function public.relationship_review_snapshot(p_org uuid,p_actor uuid) returns text
language plpgsql security definer set search_path='' as $$
declare t text; part text; pieces text:='';
begin
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin','manager')) then raise exception 'Review unavailable';end if;
 foreach t in array array['acquisition_items','inbox_items','growth_targets','founder_research_records','relationship_workspaces','relationship_source_links','relationship_identity_decisions'] loop
  execute format('select coalesce(string_agg(to_jsonb(r)::text,''|'' order by to_jsonb(r)::text),'''') from public.%I r where organisation_id=$1',t) into part using p_org;
  pieces:=pieces||t||':'||encode(sha256(convert_to(part,'UTF8')),'hex')||';';
 end loop;
 return encode(sha256(convert_to(pieces,'UTF8')),'hex');
end $$;

create function public.commit_reviewed_relationship_decision(p_org uuid,p_actor uuid,p_key uuid,p_snapshot text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.relationship_review_receipts; w public.relationship_workspaces; ref jsonb; r jsonb;
 action text:=p_payload->>'action'; t text; sid uuid; wid uuid; cols text; vals text; result jsonb;
 ids uuid[]; private boolean:=false; versions jsonb; a jsonb; b jsonb; head uuid; previous uuid; rec public.relationship_identity_decisions;
begin
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin','manager')) then raise exception 'Review unavailable';end if;
 -- Same lock ordering as existing workspace/ledger writers. Source table locks
 -- close insertion phantoms from legacy writers which do not take these locks.
 perform pg_catalog.set_config('lock_timeout','2s',true);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,742));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,5805));
 select * into prior from public.relationship_review_receipts where organisation_id=p_org and request_id=p_key;
 if found then
  if prior.actor<>p_actor or prior.payload_hash is distinct from encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') then raise exception 'Review receipt differs';end if;
  return prior.result||jsonb_build_object('duplicate',true);
 end if;
 lock table public.acquisition_items,public.inbox_items,public.growth_targets,public.founder_research_records,
  public.relationship_workspaces,public.relationship_source_links,public.relationship_identity_decisions in share row exclusive mode;
 if p_snapshot is null or p_snapshot is distinct from public.relationship_review_snapshot(p_org,p_actor) then raise exception 'Review changed; reload and review again';end if;
 if action not in ('create','keep_separate','save_research') or p_key is null then raise exception 'Invalid reviewed action';end if;
 if action in ('keep_separate','save_research') then
  if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin')) then raise exception 'Reviewer required';end if;
  if jsonb_typeof(p_payload->'refs')<>'array' or jsonb_array_length(p_payload->'refs') not between 1 and 1000 then raise exception 'Exact sources required';end if;
  for ref in select value from jsonb_array_elements(p_payload->'refs') loop
   if ref->>'table' not in ('acquisition_items','inbox_items','growth_targets','founder_research_records') then raise exception 'Invalid source';end if;
   execute format('select to_jsonb(r) from public.%I r where organisation_id=$1 and id=$2',ref->>'table') into r using p_org,(ref->>'id')::uuid;
   if r is null then raise exception 'Review unavailable';end if;
   private:=private or ref->>'table'='founder_research_records';
  end loop;
 end if;
 t:=p_payload->>'table';
 private:=private or coalesce(t='founder_research_records',false) or action='save_research';
 if private and not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text)='owner') then raise exception 'Protected review unavailable';end if;
 if action='keep_separate' then
  if jsonb_array_length(p_payload->'refs')<>2 then raise exception 'Exact pair required';end if;
  a:=p_payload->'refs'->0;b:=p_payload->'refs'->1;
  versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);
  select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;
  select id into previous from public.relationship_identity_decisions where organisation_id=p_org and source_ref_a=a and source_ref_b=b order by revision desc limit 1;
  rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')||':'||(a->>'id'),(b->>'table')||':'||(b->>'id')],
    'Explicit reviewed separation; source records unchanged',p_snapshot,p_payload->'aliases',null,p_key,head,previous,versions,private);
  result:=jsonb_build_object('decisionId',rec.id,'duplicate',false);
 else
  if t not in ('acquisition_items','inbox_items','founder_research_records') or action='save_research' and t<>'founder_research_records' then raise exception 'Invalid source';end if;
  r:=p_payload->'row';sid:=(r->>'id')::uuid;
  if r->>'organisation_id' is distinct from p_org::text then raise exception 'Review unavailable';end if;
  if p_payload->>'kind' not in ('person','company') then raise exception 'Entity kind required';end if;
  if action='save_research' then
   select array_agg(distinct l.workspace_id) into ids from public.relationship_source_links l
    where l.organisation_id=p_org and exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'=l.source_table and (x->>'id')::uuid=l.source_id);
   if cardinality(ids)>1 then raise exception 'Workspace conflict';end if;
   wid:=ids[1];
   if wid is distinct from (p_payload->>'workspaceId')::uuid then raise exception 'Destination changed';end if;
   if wid is not null then
    select * into w from public.relationship_workspaces where organisation_id=p_org and id=wid for update;
    if w.revision is distinct from (p_payload->>'workspaceRevision')::bigint then raise exception 'Destination changed';end if;
   end if;
  end if;
  -- Insert supplied allowlisted domain columns, preserving database defaults for
  -- omitted columns. The app signs/revalidates this server-built payload.
  if wid is null then
   insert into public.relationship_workspaces(organisation_id,entity_kind,founder_only,created_by)
    values(p_org,p_payload->>'kind',case when action='create' then t='founder_research_records' else not exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'<>'founder_research_records') end,p_actor) returning id into wid;
  else
   update public.relationship_workspaces set revision=revision+1,updated_at=clock_timestamp() where organisation_id=p_org and id=wid;
  end if;
  if action='save_research' then
   r:=r||jsonb_build_object('linked_relationship_workspace_id',wid);
   r:=jsonb_set(r,'{research_snapshot,phase2d,approvedAt}',to_jsonb(clock_timestamp()));
   for ref in select value from jsonb_array_elements(p_payload->'refs') loop
    insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by)
     values(p_org,wid,ref->>'table',(ref->>'id')::uuid,p_actor) on conflict(organisation_id,source_table,source_id) do nothing;
   end loop;
  end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('v.%I',k),',' order by k) into cols,vals from jsonb_object_keys(r) k;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) v',t,cols,vals,t) using r;
  if action='create' then
   insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by) values(p_org,wid,t,sid,p_actor);
   if jsonb_array_length(coalesce(p_payload->'separations','[]'))>20 then raise exception 'Review pair limit';end if;
   for ref in select value from jsonb_array_elements(coalesce(p_payload->'separations','[]')) loop
    a:=jsonb_build_object('table',t,'id',sid);b:=ref->'ref';
    private:=t='founder_research_records' or b->>'table'='founder_research_records';
    if (a->>'table')||':'||(a->>'id') > (b->>'table')||':'||(b->>'id') then
     a:=ref->'ref';b:=jsonb_build_object('table',t,'id',sid);
     r:=jsonb_build_object('a',ref->'aliases','b',p_payload->'createdAliases');
    else r:=jsonb_build_object('a',p_payload->'createdAliases','b',ref->'aliases');end if;
    versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);
    select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;
    rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')||':'||(a->>'id'),(b->>'table')||':'||(b->>'id')],
     'Explicit reviewed distinct-source creation',p_snapshot,r,null,gen_random_uuid(),head,null,versions,private);
   end loop;
  end if;
  result:=jsonb_build_object('id',sid,'workspaceId',wid,'duplicate',false);
 end if;
 insert into public.relationship_review_receipts(organisation_id,request_id,actor,payload_hash,result) values(p_org,p_key,p_actor,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'),result);
 return result;
end $$;
revoke all on function public.relationship_review_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.commit_reviewed_relationship_decision(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.relationship_review_snapshot(uuid,uuid),public.commit_reviewed_relationship_decision(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
