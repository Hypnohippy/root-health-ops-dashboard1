begin;
create table public.acquisition_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  source_engine text not null check (length(source_engine) between 1 and 100),
  source_record_id text not null check (length(source_record_id) between 1 and 250),
  record_type text not null check (record_type in ('b2b_lead','personal_opportunity','partner_opportunity','social_opportunity')),
  source_url text, evidence text, entity text, person text, company text,
  reason text, signal text, suggested_action text,
  status text not null default 'new' check (status in ('new','reviewing','accepted','dismissed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (organisation_id, source_engine, source_record_id)
);
create index acquisition_items_queue_idx on public.acquisition_items(organisation_id, created_at desc, id);
alter table public.acquisition_items enable row level security;
revoke all on public.acquisition_items from anon, authenticated;
grant all on public.acquisition_items to service_role;
commit;
