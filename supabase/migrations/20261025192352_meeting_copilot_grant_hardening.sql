begin;
-- Remove hosted default grants only from the private Meeting Copilot objects.
revoke all on table public.meeting_copilot_sessions, public.meeting_copilot_usage from service_role;
grant select, insert, update on table public.meeting_copilot_sessions, public.meeting_copilot_usage to service_role;
revoke all on sequence public.meeting_copilot_usage_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.meeting_copilot_usage_id_seq to service_role;
commit;
