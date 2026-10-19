-- Proposed Phase 1 migration. No ownership backfill and no existing request edits.
alter table public.proposal_requests add column if not exists organisation_id uuid references public.organisations(id);
alter table public.proposal_requests add column if not exists submission_payload jsonb;
create unique index if not exists proposal_requests_tenant_id on public.proposal_requests(organisation_id, id);
alter table public.proposal_requests enable row level security;
revoke all on public.proposal_requests from public, anon, authenticated;
grant select, insert, update, delete on public.proposal_requests to service_role;

create table public.solution_briefs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  source_request_id uuid not null,
  source_snapshot jsonb not null,
  recommendation jsonb not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  generation_token uuid,
  generation_started_at timestamptz,
  presentation_resource_id uuid unique references public.resource_library(id) on delete restrict,
  unique (organisation_id, source_request_id),
  unique (organisation_id, id),
  foreign key (organisation_id, source_request_id) references public.proposal_requests(organisation_id, id) on delete restrict,
  check ((status = 'draft' and approved_at is null and approved_by is null) or (status = 'approved' and approved_at is not null and approved_by is not null))
);
alter table public.solution_briefs enable row level security;
revoke all on public.solution_briefs from public, anon, authenticated;
grant select, insert, update on public.solution_briefs to service_role;
alter table public.resource_library add column if not exists source_solution_brief_id uuid unique;
alter table public.resource_library add constraint resource_solution_brief_tenant_fk
  foreign key (organisation_id, source_solution_brief_id) references public.solution_briefs(organisation_id, id) on delete restrict;
-- Browser access goes through tenant-authorized routes, including legacy resources.
alter table public.resource_library enable row level security;
revoke all on public.resource_library from public, anon, authenticated;
grant select, insert, update, delete on public.resource_library to service_role;

create function public.preserve_solution_brief_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.source_snapshot is distinct from old.source_snapshot or new.source_request_id is distinct from old.source_request_id
    or new.organisation_id is distinct from old.organisation_id or new.created_by is distinct from old.created_by then
    raise exception 'Solution Brief source evidence is immutable';
  end if;
  return new;
end $$;
revoke all on function public.preserve_solution_brief_source() from public, anon, authenticated;
create trigger preserve_solution_brief_source before update on public.solution_briefs
  for each row execute function public.preserve_solution_brief_source();

create function public.create_solution_brief(p_org uuid, p_request uuid, p_user uuid, p_recommendation jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare source_row public.proposal_requests; result public.solution_briefs;
begin
  select * into source_row from public.proposal_requests where id = p_request and organisation_id = p_org for share;
  if not found then raise exception 'Request not found in this organisation'; end if;
  insert into public.solution_briefs(organisation_id, source_request_id, source_snapshot, recommendation, created_by)
    values(p_org, p_request, to_jsonb(source_row), p_recommendation, p_user)
    on conflict (organisation_id, source_request_id) do nothing;
  select * into result from public.solution_briefs where organisation_id = p_org and source_request_id = p_request;
  return to_jsonb(result);
end $$;

create function public.complete_solution_presentation(p_org uuid, p_brief uuid, p_token uuid, p_content jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare brief public.solution_briefs; resource_id uuid;
begin
  select * into brief from public.solution_briefs where id = p_brief and organisation_id = p_org for update;
  if not found then raise exception 'Brief not found'; end if;
  if brief.presentation_resource_id is not null then return brief.presentation_resource_id; end if;
  if brief.status <> 'approved' or brief.generation_token is distinct from p_token or p_token is null then raise exception 'Generation claim no longer valid'; end if;
  insert into public.resource_library(organisation_id, title, resource_type, content, source_solution_brief_id)
    values(p_org, brief.recommendation->>'intervention', 'presentation', p_content, brief.id) returning id into resource_id;
  update public.solution_briefs set presentation_resource_id = resource_id, generation_token = null, generation_started_at = null, version = version + 1 where id = brief.id;
  return resource_id;
end $$;
create function public.claim_solution_presentation(p_org uuid, p_brief uuid, p_version integer, p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.solution_briefs set generation_token = p_token, generation_started_at = now()
    where id = p_brief and organisation_id = p_org and version = p_version and status = 'approved'
      and presentation_resource_id is null and (generation_token is null or generation_started_at < now() - interval '10 minutes');
  return found;
end $$;
revoke all on function public.create_solution_brief(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.complete_solution_presentation(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_solution_brief(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.complete_solution_presentation(uuid,uuid,uuid,jsonb) to service_role;
revoke all on function public.claim_solution_presentation(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.claim_solution_presentation(uuid,uuid,integer,uuid) to service_role;
