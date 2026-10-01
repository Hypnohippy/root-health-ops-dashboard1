begin;

alter table public.email_send_requests
  drop constraint if exists email_send_requests_organisation_id_inbox_item_id_key;

create index if not exists
  email_send_requests_inbox_item_idx
on public.email_send_requests (
  organisation_id,
  inbox_item_id,
  created_at desc
);

commit;
