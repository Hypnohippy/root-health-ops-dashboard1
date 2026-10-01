begin;

create table if not exists public.email_conversation_messages (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null
    references public.organisations(id) on delete cascade,

  gmail_thread_id text not null,
  gmail_message_id text not null,

  direction text not null
    check (direction in ('inbound', 'outbound')),

  sender_email text,
  recipient_email text,

  subject text not null default '',
  body text not null default '',

  sent_at timestamptz not null,

  source text not null
    check (source in ('gmail_engine', 'ops')),

  inbox_item_id uuid
    references public.inbox_items(id) on delete set null,

  created_at timestamptz not null default now(),

  unique (organisation_id, gmail_message_id)
);

create index if not exists
  email_conversation_messages_thread_idx
on public.email_conversation_messages (
  organisation_id,
  gmail_thread_id,
  sent_at asc
);

alter table public.email_conversation_messages
  enable row level security;

revoke all on public.email_conversation_messages
  from anon, authenticated;

grant all on public.email_conversation_messages
  to service_role;

commit;
