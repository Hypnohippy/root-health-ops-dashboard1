# Exact attempt-five indentation differences

Definitions are pg_get_functiondef catalog strings, with one-based definition line numbers. SP = U+0020 / UTF-8 0x20. No tabs, CR bytes, trailing-whitespace differences, or non-whitespace differences occur. This is a rendered catalog capture, not a raw hosted prosrc export.

## public.commit_reviewed_relationship_decision(p_org uuid, p_actor uuid, p_key uuid, p_snapshot text, p_payload jsonb)

| Definition line | Expected prefix bytes | Captured prefix bytes | Identical suffix |
|---|---|---|---|
| 19 | 2 × 20 | 1 × 20 | `if prior.actor<>p_actor or prior.payload_hash is distinct from encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') then raise exception 'Review receipt differs';end if;` |
| 20 | 2 × 20 | 1 × 20 | `return prior.result&#124;&#124;jsonb_build_object('duplicate',true);` |
| 23 | 2 × 20 | 1 × 20 | `public.relationship_workspaces,public.relationship_source_links,public.relationship_identity_decisions in share row exclusive mode;` |
| 27 | 2 × 20 | 1 × 20 | `if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin')) then raise exception 'Reviewer required';end if;` |
| 28 | 2 × 20 | 1 × 20 | `if jsonb_typeof(p_payload->'refs')<>'array' or jsonb_array_length(p_payload->'refs') not between 1 and 1000 then raise exception 'Exact sources required';end if;` |
| 29 | 2 × 20 | 1 × 20 | `for ref in select value from jsonb_array_elements(p_payload->'refs') loop` |
| 30 | 3 × 20 | 1 × 20 | `if ref->>'table' not in ('acquisition_items','inbox_items','growth_targets','founder_research_records') then raise exception 'Invalid source';end if;` |
| 31 | 3 × 20 | 1 × 20 | `execute format('select to_jsonb(r) from public.%I r where organisation_id=$1 and id=$2',ref->>'table') into r using p_org,(ref->>'id')::uuid;` |
| 32 | 3 × 20 | 1 × 20 | `if r is null then raise exception 'Review unavailable';end if;` |
| 33 | 3 × 20 | 1 × 20 | `private:=private or ref->>'table'='founder_research_records';` |
| 34 | 2 × 20 | 1 × 20 | `end loop;` |
| 40 | 2 × 20 | 1 × 20 | `if jsonb_array_length(p_payload->'refs')<>2 then raise exception 'Exact pair required';end if;` |
| 41 | 2 × 20 | 1 × 20 | `a:=p_payload->'refs'->0;b:=p_payload->'refs'->1;` |
| 42 | 2 × 20 | 1 × 20 | `versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);` |
| 43 | 2 × 20 | 1 × 20 | `select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;` |
| 44 | 2 × 20 | 1 × 20 | `select id into previous from public.relationship_identity_decisions where organisation_id=p_org and source_ref_a=a and source_ref_b=b order by revision desc limit 1;` |
| 45 | 2 × 20 | 1 × 20 | `rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')&#124;&#124;':'&#124;&#124;(a->>'id'),(b->>'table')&#124;&#124;':'&#124;&#124;(b->>'id')],` |
| 46 | 4 × 20 | 1 × 20 | `'Explicit reviewed separation; source records unchanged',p_snapshot,p_payload->'aliases',null,p_key,head,previous,versions,private);` |
| 47 | 2 × 20 | 1 × 20 | `result:=jsonb_build_object('decisionId',rec.id,'duplicate',false);` |
| 49 | 2 × 20 | 1 × 20 | `if t not in ('acquisition_items','inbox_items','founder_research_records') or action='save_research' and t<>'founder_research_records' then raise exception 'Invalid source';end if;` |
| 50 | 2 × 20 | 1 × 20 | `r:=p_payload->'row';sid:=(r->>'id')::uuid;` |
| 51 | 2 × 20 | 1 × 20 | `if r->>'organisation_id' is distinct from p_org::text then raise exception 'Review unavailable';end if;` |
| 52 | 2 × 20 | 1 × 20 | `if p_payload->>'kind' not in ('person','company') then raise exception 'Entity kind required';end if;` |
| 53 | 2 × 20 | 1 × 20 | `if action='save_research' then` |
| 54 | 3 × 20 | 1 × 20 | `select array_agg(distinct l.workspace_id) into ids from public.relationship_source_links l` |
| 55 | 4 × 20 | 1 × 20 | `where l.organisation_id=p_org and exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'=l.source_table and (x->>'id')::uuid=l.source_id);` |
| 56 | 3 × 20 | 1 × 20 | `if cardinality(ids)>1 then raise exception 'Workspace conflict';end if;` |
| 57 | 3 × 20 | 1 × 20 | `wid:=ids[1];` |
| 58 | 3 × 20 | 1 × 20 | `if wid is distinct from (p_payload->>'workspaceId')::uuid then raise exception 'Destination changed';end if;` |
| 59 | 3 × 20 | 1 × 20 | `if wid is not null then` |
| 60 | 4 × 20 | 1 × 20 | `select * into w from public.relationship_workspaces where organisation_id=p_org and id=wid for update;` |
| 61 | 4 × 20 | 1 × 20 | `if w.revision is distinct from (p_payload->>'workspaceRevision')::bigint then raise exception 'Destination changed';end if;` |
| 62 | 3 × 20 | 1 × 20 | `end if;` |
| 63 | 2 × 20 | 1 × 20 | `end if;` |
| 64 | 2 × 20 | 1 × 20 | `-- Insert supplied allowlisted domain columns, preserving database defaults for` |
| 65 | 2 × 20 | 1 × 20 | `-- omitted columns. The app signs/revalidates this server-built payload.` |
| 66 | 2 × 20 | 1 × 20 | `if wid is null then` |
| 67 | 3 × 20 | 1 × 20 | `insert into public.relationship_workspaces(organisation_id,entity_kind,founder_only,created_by)` |
| 68 | 4 × 20 | 1 × 20 | `values(p_org,p_payload->>'kind',case when action='create' then t='founder_research_records' else not exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'<>'founder_research_records') end,p_actor) returning id into wid;` |
| 69 | 2 × 20 | 1 × 20 | `else` |
| 70 | 3 × 20 | 1 × 20 | `update public.relationship_workspaces set revision=revision+1,updated_at=clock_timestamp() where organisation_id=p_org and id=wid;` |
| 71 | 2 × 20 | 1 × 20 | `end if;` |
| 72 | 2 × 20 | 1 × 20 | `if action='save_research' then` |
| 73 | 3 × 20 | 1 × 20 | `r:=r&#124;&#124;jsonb_build_object('linked_relationship_workspace_id',wid);` |
| 74 | 3 × 20 | 1 × 20 | `r:=jsonb_set(r,'{research_snapshot,phase2d,approvedAt}',to_jsonb(clock_timestamp()));` |
| 75 | 3 × 20 | 1 × 20 | `for ref in select value from jsonb_array_elements(p_payload->'refs') loop` |
| 76 | 4 × 20 | 1 × 20 | `insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by)` |
| 77 | 5 × 20 | 1 × 20 | `values(p_org,wid,ref->>'table',(ref->>'id')::uuid,p_actor) on conflict(organisation_id,source_table,source_id) do nothing;` |
| 78 | 3 × 20 | 1 × 20 | `end loop;` |
| 79 | 2 × 20 | 1 × 20 | `end if;` |
| 80 | 2 × 20 | 1 × 20 | `select string_agg(format('%I',k),',' order by k),string_agg(format('v.%I',k),',' order by k) into cols,vals from jsonb_object_keys(r) k;` |
| 81 | 2 × 20 | 1 × 20 | `execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) v',t,cols,vals,t) using r;` |
| 82 | 2 × 20 | 1 × 20 | `if action='create' then` |
| 83 | 3 × 20 | 1 × 20 | `insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by) values(p_org,wid,t,sid,p_actor);` |
| 84 | 3 × 20 | 1 × 20 | `if jsonb_array_length(coalesce(p_payload->'separations','[]'))>20 then raise exception 'Review pair limit';end if;` |
| 85 | 3 × 20 | 1 × 20 | `for ref in select value from jsonb_array_elements(coalesce(p_payload->'separations','[]')) loop` |
| 86 | 4 × 20 | 1 × 20 | `a:=jsonb_build_object('table',t,'id',sid);b:=ref->'ref';` |
| 87 | 4 × 20 | 1 × 20 | `private:=t='founder_research_records' or b->>'table'='founder_research_records';` |
| 88 | 4 × 20 | 1 × 20 | `if (a->>'table')&#124;&#124;':'&#124;&#124;(a->>'id') > (b->>'table')&#124;&#124;':'&#124;&#124;(b->>'id') then` |
| 89 | 5 × 20 | 1 × 20 | `a:=ref->'ref';b:=jsonb_build_object('table',t,'id',sid);` |
| 90 | 5 × 20 | 1 × 20 | `r:=jsonb_build_object('a',ref->'aliases','b',p_payload->'createdAliases');` |
| 91 | 4 × 20 | 1 × 20 | `else r:=jsonb_build_object('a',p_payload->'createdAliases','b',ref->'aliases');end if;` |
| 92 | 4 × 20 | 1 × 20 | `versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);` |
| 93 | 4 × 20 | 1 × 20 | `select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;` |
| 94 | 4 × 20 | 1 × 20 | `rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')&#124;&#124;':'&#124;&#124;(a->>'id'),(b->>'table')&#124;&#124;':'&#124;&#124;(b->>'id')],` |
| 95 | 5 × 20 | 1 × 20 | `'Explicit reviewed distinct-source creation',p_snapshot,r,null,gen_random_uuid(),head,null,versions,private);` |
| 96 | 3 × 20 | 1 × 20 | `end loop;` |
| 97 | 2 × 20 | 1 × 20 | `end if;` |
| 98 | 2 × 20 | 1 × 20 | `result:=jsonb_build_object('id',sid,'workspaceId',wid,'duplicate',false);` |

Minimal diff (`·` denotes one SP; all omitted lines are equal):

```diff
@@ definition line 19 @@
-··if prior.actor<>p_actor or prior.payload_hash is distinct from encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') then raise exception 'Review receipt differs';end if;
+·if prior.actor<>p_actor or prior.payload_hash is distinct from encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') then raise exception 'Review receipt differs';end if;
@@ definition line 20 @@
-··return prior.result||jsonb_build_object('duplicate',true);
+·return prior.result||jsonb_build_object('duplicate',true);
@@ definition line 23 @@
-··public.relationship_workspaces,public.relationship_source_links,public.relationship_identity_decisions in share row exclusive mode;
+·public.relationship_workspaces,public.relationship_source_links,public.relationship_identity_decisions in share row exclusive mode;
@@ definition line 27 @@
-··if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin')) then raise exception 'Reviewer required';end if;
+·if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_actor and lower(role::text) in ('owner','admin')) then raise exception 'Reviewer required';end if;
@@ definition line 28 @@
-··if jsonb_typeof(p_payload->'refs')<>'array' or jsonb_array_length(p_payload->'refs') not between 1 and 1000 then raise exception 'Exact sources required';end if;
+·if jsonb_typeof(p_payload->'refs')<>'array' or jsonb_array_length(p_payload->'refs') not between 1 and 1000 then raise exception 'Exact sources required';end if;
@@ definition line 29 @@
-··for ref in select value from jsonb_array_elements(p_payload->'refs') loop
+·for ref in select value from jsonb_array_elements(p_payload->'refs') loop
@@ definition line 30 @@
-···if ref->>'table' not in ('acquisition_items','inbox_items','growth_targets','founder_research_records') then raise exception 'Invalid source';end if;
+·if ref->>'table' not in ('acquisition_items','inbox_items','growth_targets','founder_research_records') then raise exception 'Invalid source';end if;
@@ definition line 31 @@
-···execute format('select to_jsonb(r) from public.%I r where organisation_id=$1 and id=$2',ref->>'table') into r using p_org,(ref->>'id')::uuid;
+·execute format('select to_jsonb(r) from public.%I r where organisation_id=$1 and id=$2',ref->>'table') into r using p_org,(ref->>'id')::uuid;
@@ definition line 32 @@
-···if r is null then raise exception 'Review unavailable';end if;
+·if r is null then raise exception 'Review unavailable';end if;
@@ definition line 33 @@
-···private:=private or ref->>'table'='founder_research_records';
+·private:=private or ref->>'table'='founder_research_records';
@@ definition line 34 @@
-··end loop;
+·end loop;
@@ definition line 40 @@
-··if jsonb_array_length(p_payload->'refs')<>2 then raise exception 'Exact pair required';end if;
+·if jsonb_array_length(p_payload->'refs')<>2 then raise exception 'Exact pair required';end if;
@@ definition line 41 @@
-··a:=p_payload->'refs'->0;b:=p_payload->'refs'->1;
+·a:=p_payload->'refs'->0;b:=p_payload->'refs'->1;
@@ definition line 42 @@
-··versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);
+·versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);
@@ definition line 43 @@
-··select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;
+·select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;
@@ definition line 44 @@
-··select id into previous from public.relationship_identity_decisions where organisation_id=p_org and source_ref_a=a and source_ref_b=b order by revision desc limit 1;
+·select id into previous from public.relationship_identity_decisions where organisation_id=p_org and source_ref_a=a and source_ref_b=b order by revision desc limit 1;
@@ definition line 45 @@
-··rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')||':'||(a->>'id'),(b->>'table')||':'||(b->>'id')],
+·rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')||':'||(a->>'id'),(b->>'table')||':'||(b->>'id')],
@@ definition line 46 @@
-····'Explicit reviewed separation; source records unchanged',p_snapshot,p_payload->'aliases',null,p_key,head,previous,versions,private);
+·'Explicit reviewed separation; source records unchanged',p_snapshot,p_payload->'aliases',null,p_key,head,previous,versions,private);
@@ definition line 47 @@
-··result:=jsonb_build_object('decisionId',rec.id,'duplicate',false);
+·result:=jsonb_build_object('decisionId',rec.id,'duplicate',false);
@@ definition line 49 @@
-··if t not in ('acquisition_items','inbox_items','founder_research_records') or action='save_research' and t<>'founder_research_records' then raise exception 'Invalid source';end if;
+·if t not in ('acquisition_items','inbox_items','founder_research_records') or action='save_research' and t<>'founder_research_records' then raise exception 'Invalid source';end if;
@@ definition line 50 @@
-··r:=p_payload->'row';sid:=(r->>'id')::uuid;
+·r:=p_payload->'row';sid:=(r->>'id')::uuid;
@@ definition line 51 @@
-··if r->>'organisation_id' is distinct from p_org::text then raise exception 'Review unavailable';end if;
+·if r->>'organisation_id' is distinct from p_org::text then raise exception 'Review unavailable';end if;
@@ definition line 52 @@
-··if p_payload->>'kind' not in ('person','company') then raise exception 'Entity kind required';end if;
+·if p_payload->>'kind' not in ('person','company') then raise exception 'Entity kind required';end if;
@@ definition line 53 @@
-··if action='save_research' then
+·if action='save_research' then
@@ definition line 54 @@
-···select array_agg(distinct l.workspace_id) into ids from public.relationship_source_links l
+·select array_agg(distinct l.workspace_id) into ids from public.relationship_source_links l
@@ definition line 55 @@
-····where l.organisation_id=p_org and exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'=l.source_table and (x->>'id')::uuid=l.source_id);
+·where l.organisation_id=p_org and exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'=l.source_table and (x->>'id')::uuid=l.source_id);
@@ definition line 56 @@
-···if cardinality(ids)>1 then raise exception 'Workspace conflict';end if;
+·if cardinality(ids)>1 then raise exception 'Workspace conflict';end if;
@@ definition line 57 @@
-···wid:=ids[1];
+·wid:=ids[1];
@@ definition line 58 @@
-···if wid is distinct from (p_payload->>'workspaceId')::uuid then raise exception 'Destination changed';end if;
+·if wid is distinct from (p_payload->>'workspaceId')::uuid then raise exception 'Destination changed';end if;
@@ definition line 59 @@
-···if wid is not null then
+·if wid is not null then
@@ definition line 60 @@
-····select * into w from public.relationship_workspaces where organisation_id=p_org and id=wid for update;
+·select * into w from public.relationship_workspaces where organisation_id=p_org and id=wid for update;
@@ definition line 61 @@
-····if w.revision is distinct from (p_payload->>'workspaceRevision')::bigint then raise exception 'Destination changed';end if;
+·if w.revision is distinct from (p_payload->>'workspaceRevision')::bigint then raise exception 'Destination changed';end if;
@@ definition line 62 @@
-···end if;
+·end if;
@@ definition line 63 @@
-··end if;
+·end if;
@@ definition line 64 @@
-··-- Insert supplied allowlisted domain columns, preserving database defaults for
+·-- Insert supplied allowlisted domain columns, preserving database defaults for
@@ definition line 65 @@
-··-- omitted columns. The app signs/revalidates this server-built payload.
+·-- omitted columns. The app signs/revalidates this server-built payload.
@@ definition line 66 @@
-··if wid is null then
+·if wid is null then
@@ definition line 67 @@
-···insert into public.relationship_workspaces(organisation_id,entity_kind,founder_only,created_by)
+·insert into public.relationship_workspaces(organisation_id,entity_kind,founder_only,created_by)
@@ definition line 68 @@
-····values(p_org,p_payload->>'kind',case when action='create' then t='founder_research_records' else not exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'<>'founder_research_records') end,p_actor) returning id into wid;
+·values(p_org,p_payload->>'kind',case when action='create' then t='founder_research_records' else not exists(select 1 from jsonb_array_elements(p_payload->'refs') x where x->>'table'<>'founder_research_records') end,p_actor) returning id into wid;
@@ definition line 69 @@
-··else
+·else
@@ definition line 70 @@
-···update public.relationship_workspaces set revision=revision+1,updated_at=clock_timestamp() where organisation_id=p_org and id=wid;
+·update public.relationship_workspaces set revision=revision+1,updated_at=clock_timestamp() where organisation_id=p_org and id=wid;
@@ definition line 71 @@
-··end if;
+·end if;
@@ definition line 72 @@
-··if action='save_research' then
+·if action='save_research' then
@@ definition line 73 @@
-···r:=r||jsonb_build_object('linked_relationship_workspace_id',wid);
+·r:=r||jsonb_build_object('linked_relationship_workspace_id',wid);
@@ definition line 74 @@
-···r:=jsonb_set(r,'{research_snapshot,phase2d,approvedAt}',to_jsonb(clock_timestamp()));
+·r:=jsonb_set(r,'{research_snapshot,phase2d,approvedAt}',to_jsonb(clock_timestamp()));
@@ definition line 75 @@
-···for ref in select value from jsonb_array_elements(p_payload->'refs') loop
+·for ref in select value from jsonb_array_elements(p_payload->'refs') loop
@@ definition line 76 @@
-····insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by)
+·insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by)
@@ definition line 77 @@
-·····values(p_org,wid,ref->>'table',(ref->>'id')::uuid,p_actor) on conflict(organisation_id,source_table,source_id) do nothing;
+·values(p_org,wid,ref->>'table',(ref->>'id')::uuid,p_actor) on conflict(organisation_id,source_table,source_id) do nothing;
@@ definition line 78 @@
-···end loop;
+·end loop;
@@ definition line 79 @@
-··end if;
+·end if;
@@ definition line 80 @@
-··select string_agg(format('%I',k),',' order by k),string_agg(format('v.%I',k),',' order by k) into cols,vals from jsonb_object_keys(r) k;
+·select string_agg(format('%I',k),',' order by k),string_agg(format('v.%I',k),',' order by k) into cols,vals from jsonb_object_keys(r) k;
@@ definition line 81 @@
-··execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) v',t,cols,vals,t) using r;
+·execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) v',t,cols,vals,t) using r;
@@ definition line 82 @@
-··if action='create' then
+·if action='create' then
@@ definition line 83 @@
-···insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by) values(p_org,wid,t,sid,p_actor);
+·insert into public.relationship_source_links(organisation_id,workspace_id,source_table,source_id,linked_by) values(p_org,wid,t,sid,p_actor);
@@ definition line 84 @@
-···if jsonb_array_length(coalesce(p_payload->'separations','[]'))>20 then raise exception 'Review pair limit';end if;
+·if jsonb_array_length(coalesce(p_payload->'separations','[]'))>20 then raise exception 'Review pair limit';end if;
@@ definition line 85 @@
-···for ref in select value from jsonb_array_elements(coalesce(p_payload->'separations','[]')) loop
+·for ref in select value from jsonb_array_elements(coalesce(p_payload->'separations','[]')) loop
@@ definition line 86 @@
-····a:=jsonb_build_object('table',t,'id',sid);b:=ref->'ref';
+·a:=jsonb_build_object('table',t,'id',sid);b:=ref->'ref';
@@ definition line 87 @@
-····private:=t='founder_research_records' or b->>'table'='founder_research_records';
+·private:=t='founder_research_records' or b->>'table'='founder_research_records';
@@ definition line 88 @@
-····if (a->>'table')||':'||(a->>'id') > (b->>'table')||':'||(b->>'id') then
+·if (a->>'table')||':'||(a->>'id') > (b->>'table')||':'||(b->>'id') then
@@ definition line 89 @@
-·····a:=ref->'ref';b:=jsonb_build_object('table',t,'id',sid);
+·a:=ref->'ref';b:=jsonb_build_object('table',t,'id',sid);
@@ definition line 90 @@
-·····r:=jsonb_build_object('a',ref->'aliases','b',p_payload->'createdAliases');
+·r:=jsonb_build_object('a',ref->'aliases','b',p_payload->'createdAliases');
@@ definition line 91 @@
-····else r:=jsonb_build_object('a',p_payload->'createdAliases','b',ref->'aliases');end if;
+·else r:=jsonb_build_object('a',p_payload->'createdAliases','b',ref->'aliases');end if;
@@ definition line 92 @@
-····versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);
+·versions:=public.identity_decision_source_versions(p_org,p_actor,a,b,private);
@@ definition line 93 @@
-····select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;
+·select id into head from public.relationship_identity_decisions where organisation_id=p_org order by sequence desc limit 1;
@@ definition line 94 @@
-····rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')||':'||(a->>'id'),(b->>'table')||':'||(b->>'id')],
+·rec:=public.append_relationship_identity_decision(p_org,p_actor,a,b,'keep_separate',array[(a->>'table')||':'||(a->>'id'),(b->>'table')||':'||(b->>'id')],
@@ definition line 95 @@
-·····'Explicit reviewed distinct-source creation',p_snapshot,r,null,gen_random_uuid(),head,null,versions,private);
+·'Explicit reviewed distinct-source creation',p_snapshot,r,null,gen_random_uuid(),head,null,versions,private);
@@ definition line 96 @@
-···end loop;
+·end loop;
@@ definition line 97 @@
-··end if;
+·end if;
@@ definition line 98 @@
-··result:=jsonb_build_object('id',sid,'workspaceId',wid,'duplicate',false);
+·result:=jsonb_build_object('id',sid,'workspaceId',wid,'duplicate',false);
```

## public.relationship_review_snapshot(p_org uuid, p_actor uuid)

| Definition line | Expected prefix bytes | Captured prefix bytes | Identical suffix |
|---|---|---|---|
| 11 | 2 × 20 | 1 × 20 | `execute format('select coalesce(string_agg(to_jsonb(r)::text,''&#124;'' order by to_jsonb(r)::text),'''') from public.%I r where organisation_id=$1',t) into part using p_org;` |
| 12 | 2 × 20 | 1 × 20 | `pieces:=pieces&#124;&#124;t&#124;&#124;':'&#124;&#124;encode(sha256(convert_to(part,'UTF8')),'hex')&#124;&#124;';';` |

Minimal diff (`·` denotes one SP; all omitted lines are equal):

```diff
@@ definition line 11 @@
-··execute format('select coalesce(string_agg(to_jsonb(r)::text,''|'' order by to_jsonb(r)::text),'''') from public.%I r where organisation_id=$1',t) into part using p_org;
+·execute format('select coalesce(string_agg(to_jsonb(r)::text,''|'' order by to_jsonb(r)::text),'''') from public.%I r where organisation_id=$1',t) into part using p_org;
@@ definition line 12 @@
-··pieces:=pieces||t||':'||encode(sha256(convert_to(part,'UTF8')),'hex')||';';
+·pieces:=pieces||t||':'||encode(sha256(convert_to(part,'UTF8')),'hex')||';';
```
