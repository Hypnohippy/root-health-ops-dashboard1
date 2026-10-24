begin;
set local lock_timeout='2s';
-- Empty policy deliberately denies access until a trusted administrator seeds it.
create schema root_ops_private;
revoke all on schema root_ops_private from public,anon,authenticated,service_role;
create function root_ops_private.normalize_founder_email(value text) returns text
language sql immutable strict set search_path='' as $$
 select case when btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)) collate "C"
 ~ '^[A-Za-z0-9_+-]+(\.[A-Za-z0-9_+-]+)*@[A-Za-z0-9]+(-[A-Za-z0-9]+)*(\.[A-Za-z0-9]+(-[A-Za-z0-9]+)*)+$'
 then translate(btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)),
 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') else null end
$$;
create table root_ops_private.founder_authorization_policy (
 singleton boolean primary key check(singleton), required_email text not null,
 revision bigint not null check(revision>0), created_at timestamptz not null,
 updated_at timestamptz not null,
 check(root_ops_private.normalize_founder_email(required_email) is not null
 and required_email=root_ops_private.normalize_founder_email(required_email))
);
create table root_ops_private.founder_actor_identity (
 user_id uuid primary key, normalized_email text, revision bigint not null check(revision>0),
 updated_at timestamptz not null,
 check(normalized_email is null or (root_ops_private.normalize_founder_email(normalized_email) is not null
 and normalized_email=root_ops_private.normalize_founder_email(normalized_email)))
);
-- A dedicated non-login owner has no managed Auth privileges. OLD/NEW suffice.
create role root_ops_founder_mirror_owner nologin noinherit;
grant root_ops_founder_mirror_owner to postgres;
grant usage,create on schema root_ops_private to root_ops_founder_mirror_owner;
alter table root_ops_private.founder_actor_identity owner to root_ops_founder_mirror_owner;
grant execute on function root_ops_private.normalize_founder_email(text) to root_ops_founder_mirror_owner;
create function root_ops_private.sync_founder_actor_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  delete from root_ops_private.founder_actor_identity where user_id=old.id;
  return old;
 end if;
 insert into root_ops_private.founder_actor_identity(user_id,normalized_email,revision,updated_at)
 values(new.id,root_ops_private.normalize_founder_email(new.email),1,clock_timestamp())
 on conflict(user_id) do update set normalized_email=excluded.normalized_email,
 revision=root_ops_private.founder_actor_identity.revision+1,updated_at=excluded.updated_at;
 return new;
end $$;
alter function root_ops_private.sync_founder_actor_identity() owner to root_ops_founder_mirror_owner;
revoke create on schema root_ops_private from root_ops_founder_mirror_owner;
-- Blocks concurrent Auth DML until trigger installation, backfill and verification finish.
lock table auth.users in share row exclusive mode;
-- Alphabetically precedes on_auth_user_created_create_org; neither depends on the other.
create trigger founder_actor_identity_sync after insert or update of email or delete on auth.users
 for each row execute function root_ops_private.sync_founder_actor_identity();
insert into root_ops_private.founder_actor_identity(user_id,normalized_email,revision,updated_at)
 select id,root_ops_private.normalize_founder_email(email),1,clock_timestamp() from auth.users;
do $$ begin
 if exists(select 1 from auth.users u full join root_ops_private.founder_actor_identity m on m.user_id=u.id
 where u.id is null or m.user_id is null or m.normalized_email is distinct from root_ops_private.normalize_founder_email(u.email))
 then raise exception 'Founder identity backfill failed';end if;
end $$;
create function root_ops_private.require_founder_authorization(p_org uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare required text; actual text; member_role text; plan_name text; plan_key text;
begin
 -- Caller holds 742 then 5805. These reads retain row locks through commit.
 select required_email into required from root_ops_private.founder_authorization_policy where singleton for share;
 if not found then raise exception 'Protected review unavailable' using errcode='42501';end if;
 select normalized_email into actual from root_ops_private.founder_actor_identity where user_id=p_actor for share;
 if not found then raise exception 'Protected review unavailable' using errcode='42501';end if;
 select role::text into member_role from public.organisation_members where organisation_id=p_org and user_id=p_actor for share;
 if not found then raise exception 'Protected review unavailable' using errcode='42501';end if;
 select p.plan,p.plan_key into plan_name,plan_key from public.organisation_plans p where organisation_id=p_org for share;
 if not found or actual is null or actual is distinct from required
 or root_ops_private.normalize_founder_email(actual) is distinct from actual
 or lower(member_role)<>'owner' or not (coalesce(lower(plan_name),'')='founder' or coalesce(lower(plan_key),'')='founder')
 then raise exception 'Protected review unavailable' using errcode='42501';end if;
end $$;
-- Server actor comes from the authenticated session, never a browser-provided email.
create function public.founder_authorization_allowed(p_org uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.set_config('lock_timeout','2s',true);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,742));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,5805));
 perform root_ops_private.require_founder_authorization(p_org,p_actor);
 return true;
exception when insufficient_privilege then return false;
end $$;
-- Administrative SQL only: not granted to service_role or exposed through an API.
create function root_ops_private.set_founder_authorization_policy(email text) returns void
language plpgsql security definer set search_path='' as $$
declare canonical text:=root_ops_private.normalize_founder_email(email);
begin
 if canonical is null then raise exception 'Unsupported Founder policy email';end if;
 insert into root_ops_private.founder_authorization_policy values(true,canonical,1,clock_timestamp(),clock_timestamp())
 on conflict(singleton) do update set required_email=excluded.required_email,
 revision=root_ops_private.founder_authorization_policy.revision+1,updated_at=excluded.updated_at;
end $$;
revoke all on all tables in schema root_ops_private from public,anon,authenticated,service_role;
revoke all on all functions in schema root_ops_private from public,anon,authenticated,service_role;
grant execute on function root_ops_private.normalize_founder_email(text) to root_ops_founder_mirror_owner;
revoke all on function public.founder_authorization_allowed(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.founder_authorization_allowed(uuid,uuid) to service_role;

-- Existing function body preserved except the pre-receipt authorization call.
create or replace function public.commit_reviewed_relationship_decision(p_org uuid,p_actor uuid,p_key uuid,p_snapshot text,p_payload jsonb)
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
 if (p_payload->>'action'='create' and p_payload->>'table'='founder_research_records') or p_payload->>'action'='save_research' then
  perform root_ops_private.require_founder_authorization(p_org,p_actor);
 end if;
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

commit;
