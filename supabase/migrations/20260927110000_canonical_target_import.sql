begin;
-- Email is already a canonical lifecycle identity; persist it for CSV targets too.
alter table public.growth_targets add column if not exists email text;
create function public.import_canonical_targets(p_organisation_id uuid, p_revision bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version bigint; row_data jsonb; inserted integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1000 then raise exception 'invalid_import'; end if;
  insert into public.lifecycle_revisions(organisation_id) values(p_organisation_id) on conflict do nothing;
  select revision into version from public.lifecycle_revisions where organisation_id=p_organisation_id for update;
  if version is distinct from p_revision then return jsonb_build_object('stale',true); end if;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    if row_data - array['target_name','company','role_title','linkedin_url','linkedin_identity','email','notes','stage','status','lead_quality','source_type'] <> '{}'::jsonb
      or nullif(trim(row_data->>'target_name'),'') is null then raise exception 'invalid_target'; end if;
    insert into public.growth_targets(organisation_id,target_name,company,role_title,linkedin_url,linkedin_identity,email,notes,stage,status,lead_quality,source_type)
      values(p_organisation_id,row_data->>'target_name',row_data->>'company',row_data->>'role_title',row_data->>'linkedin_url',row_data->>'linkedin_identity',row_data->>'email',row_data->>'notes','connection','active','unreviewed','csv_import');
    inserted := inserted + 1;
  end loop;
  return jsonb_build_object('inserted',inserted,'stale',false);
end; $$;
revoke all on function public.import_canonical_targets(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.import_canonical_targets(uuid,bigint,jsonb) to service_role;
commit;
