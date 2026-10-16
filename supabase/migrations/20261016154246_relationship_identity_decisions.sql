begin;
-- Additive schema only. No source updates, seeds, decisions or backfill.
create table public.relationship_identity_decisions (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 source_ref_a jsonb not null, source_ref_b jsonb not null,
 pair_key text generated always as ((source_ref_a->>'table')||':'||(source_ref_a->>'id')||'|'||(source_ref_b->>'table')||':'||(source_ref_b->>'id')) stored,
 decision text not null check(decision in ('same_relationship','keep_separate','review_later')),
 reviewed_evidence_ids text[] not null check(cardinality(reviewed_evidence_ids) between 2 and 100),
 evidence_summary text not null check(length(evidence_summary) between 1 and 4000), actor_user_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), decided_at timestamptz not null default clock_timestamp(),
 revision bigint not null check(revision>0), note text check(length(note)<=1000), supersedes_decision_id uuid,
 candidate_revision text not null check(length(candidate_revision) between 1 and 256000),
 alias_bindings jsonb not null check(jsonb_typeof(alias_bindings)='object'), founder_only boolean not null default false,
 idempotency_key uuid not null, sequence bigint generated always as identity,
 unique(organisation_id,id), unique(organisation_id,pair_key,id), unique(organisation_id,pair_key,revision),unique(organisation_id,idempotency_key),
 foreign key(organisation_id,pair_key,supersedes_decision_id) references public.relationship_identity_decisions(organisation_id,pair_key,id),
 check((revision=1 and supersedes_decision_id is null) or (revision>1 and supersedes_decision_id is not null)),
 check(jsonb_typeof(source_ref_a)='object' and jsonb_typeof(source_ref_b)='object'),
 check(source_ref_a ?& array['table','id'] and source_ref_b ?& array['table','id']),
 check(source_ref_a - array['table','id']='{}'::jsonb and source_ref_b - array['table','id']='{}'::jsonb),
 check(source_ref_a->>'table' in ('inbox_items','growth_targets','acquisition_items','founder_research_records') and source_ref_b->>'table' in ('inbox_items','growth_targets','acquisition_items','founder_research_records')),
 check((source_ref_a->>'table')||':'||(source_ref_a->>'id') < (source_ref_b->>'table')||':'||(source_ref_b->>'id'))
);
create index identity_decision_tenant_history on public.relationship_identity_decisions(organisation_id,sequence);
alter table public.relationship_identity_decisions enable row level security;
revoke all on public.relationship_identity_decisions from public,anon,authenticated,service_role;
grant select on public.relationship_identity_decisions to service_role;
revoke all on sequence public.relationship_identity_decisions_sequence_seq from public,anon,authenticated,service_role;
create function public.guard_identity_decision_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Identity decision history is append-only';end $$;
create trigger identity_decision_immutable before update or delete on public.relationship_identity_decisions for each row execute function public.guard_identity_decision_history();
create trigger identity_decision_no_truncate before truncate on public.relationship_identity_decisions for each statement execute function public.guard_identity_decision_history();
create function public.identity_decision_source_versions(p_org uuid,p_actor uuid,p_a jsonb,p_b jsonb,p_founder boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare ref jsonb; row_data jsonb; result jsonb:='{}';
begin
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin')) then raise exception 'Authorised reviewer required';end if;
 for ref in select value from jsonb_array_elements(jsonb_build_array(p_a,p_b)) loop
  if ref->>'table' not in ('inbox_items','growth_targets','acquisition_items','founder_research_records') then raise exception 'Invalid source';end if;
  if ref->>'table'='founder_research_records' and (not p_founder or not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text)='owner')) then raise exception 'Protected evidence unavailable';end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and organisation_id=$2',ref->>'table') into row_data using (ref->>'id')::uuid,p_org;
  if row_data is null then raise exception 'Source outside tenant';end if;
  result:=result||jsonb_build_object((ref->>'table')||':'||(ref->>'id'),md5(row_data::text));
 end loop;return result;
end $$;
create function public.append_relationship_identity_decision(p_org uuid,p_actor uuid,p_a jsonb,p_b jsonb,p_decision text,p_evidence text[],p_summary text,p_candidate text,p_aliases jsonb,p_note text,p_request uuid,p_expected_head uuid,p_previous uuid,p_versions jsonb,p_founder boolean default false)
returns public.relationship_identity_decisions language plpgsql security definer set search_path='' as $$
declare prior public.relationship_identity_decisions; result public.relationship_identity_decisions; head uuid; ref jsonb; found_org uuid; private boolean:=false; pair text;
begin
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin')) then raise exception 'Authorised reviewer required';end if;
 if p_founder and not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text)='owner') then raise exception 'Protected reviewer required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,5805));
 select * into result from public.relationship_identity_decisions where organisation_id=p_org and idempotency_key=p_request;
 if found then
  if result.actor_user_id<>p_actor or result.source_ref_a<>p_a or result.source_ref_b<>p_b or result.decision<>p_decision or result.candidate_revision<>p_candidate or result.note is distinct from p_note then raise exception 'Receipt payload mismatch';end if;
  return result;
 end if;
 select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;
 if head is distinct from p_expected_head then raise exception 'Identity history changed; refresh';end if;
 -- Lock the exact reviewed sources through append; the hash contains no exposed source text.
 for ref in select value from jsonb_array_elements(jsonb_build_array(p_a,p_b)) loop
  if ref->>'table' not in ('inbox_items','growth_targets','acquisition_items','founder_research_records') then raise exception 'Invalid source';end if;
  execute format('select organisation_id from public.%I where id=$1 for share',ref->>'table') into found_org using (ref->>'id')::uuid;
  if found_org is distinct from p_org then raise exception 'Source outside tenant';end if;
 end loop;
 if p_versions is null or p_versions is distinct from public.identity_decision_source_versions(p_org,p_actor,p_a,p_b,p_founder) then raise exception 'Source evidence changed; refresh';end if;
 pair:=(p_a->>'table')||':'||(p_a->>'id')||'|'||(p_b->>'table')||':'||(p_b->>'id');
 if not (p_evidence @> array[(p_a->>'table')||':'||(p_a->>'id'),(p_b->>'table')||':'||(p_b->>'id')]) then raise exception 'Reviewed source evidence required';end if;
 select * into prior from public.relationship_identity_decisions where organisation_id=p_org and pair_key=pair order by revision desc limit 1;
 if prior.id is distinct from p_previous then raise exception 'Decision revision changed; refresh';end if;
 for ref in select value from jsonb_array_elements(jsonb_build_array(p_a,p_b)) loop
  if ref->>'table' not in ('inbox_items','growth_targets','acquisition_items','founder_research_records') then raise exception 'Invalid source';end if;
  execute format('select organisation_id from public.%I where id=$1',ref->>'table') into found_org using (ref->>'id')::uuid;
  if found_org is distinct from p_org then raise exception 'Source outside tenant';end if;
  if ref->>'table'='founder_research_records' then private:=true;end if;
 end loop;
 private:=private or coalesce(prior.founder_only,false) or p_founder;
 if private and not p_founder then raise exception 'Protected evidence unavailable';end if;
 insert into public.relationship_identity_decisions(organisation_id,source_ref_a,source_ref_b,decision,reviewed_evidence_ids,evidence_summary,actor_user_id,revision,note,supersedes_decision_id,candidate_revision,alias_bindings,founder_only,idempotency_key)
 values(p_org,p_a,p_b,p_decision,p_evidence,p_summary,p_actor,coalesce(prior.revision,0)+1,p_note,prior.id,p_candidate,p_aliases,private,p_request) returning * into result;
 return result;
end $$;
revoke all on function public.guard_identity_decision_history() from public,anon,authenticated,service_role;
revoke all on function public.identity_decision_source_versions(uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.identity_decision_source_versions(uuid,uuid,jsonb,jsonb,boolean) to service_role;
revoke all on function public.append_relationship_identity_decision(uuid,uuid,jsonb,jsonb,text,text[],text,text,jsonb,text,uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.append_relationship_identity_decision(uuid,uuid,jsonb,jsonb,text,text[],text,text,jsonb,text,uuid,uuid,uuid,jsonb,boolean) to service_role;
commit;
