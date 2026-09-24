begin;

alter table public.growth_targets
  add column if not exists linkedin_identity text,
  add column if not exists source_type text,
  add column if not exists source_record_id text,
  add column if not exists acquisition_item_id uuid references public.acquisition_items(id) on delete set null,
  add column if not exists owner_user_id uuid;

create unique index if not exists growth_targets_tenant_linkedin_identity_unique
  on public.growth_targets(organisation_id, linkedin_identity) where linkedin_identity is not null;
create unique index if not exists growth_targets_tenant_source_unique
  on public.growth_targets(organisation_id, source_type, source_record_id) where source_type is not null and source_record_id is not null;

commit;
