begin;

alter table public.inbox_items
  add column if not exists linkedin_identity text,
  add column if not exists linkedin_message_url text;

create unique index if not exists inbox_items_tenant_linkedin_acceptance_unique
  on public.inbox_items(organisation_id, linkedin_identity);

commit;
