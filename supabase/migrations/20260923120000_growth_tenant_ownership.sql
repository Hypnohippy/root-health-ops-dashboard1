begin;

-- Older single-business rows have no provable owner. Leave them unassigned and
-- inaccessible until an operator explicitly verifies and assigns ownership.
alter table public.growth_targets add column if not exists organisation_id uuid references public.organisations(id);
alter table public.growth_plans add column if not exists organisation_id uuid references public.organisations(id);
alter table public.hook_patterns add column if not exists organisation_id uuid references public.organisations(id);

create index if not exists growth_targets_organisation_idx on public.growth_targets(organisation_id);
create index if not exists growth_plans_organisation_idx on public.growth_plans(organisation_id);
create index if not exists hook_patterns_organisation_idx on public.hook_patterns(organisation_id);

-- These tables are accessed only through authenticated server routes/actions.
alter table public.growth_targets enable row level security;
alter table public.growth_plans enable row level security;
alter table public.hook_patterns enable row level security;
revoke all on public.growth_targets, public.growth_plans, public.hook_patterns from anon, authenticated;
grant all on public.growth_targets, public.growth_plans, public.hook_patterns to service_role;

commit;
