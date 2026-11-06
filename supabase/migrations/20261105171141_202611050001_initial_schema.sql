create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','member');
create type public.account_status as enum ('active','suspended','revoked');
create type public.tool_status as enum ('DRAFT','TESTING','PUBLISHED','DISABLED','ARCHIVED');
create type public.tool_audience as enum ('all_active_members','selected_members');
create type public.repair_result as enum ('SUCCESS','PARTIAL','FAILED','CANCELLED');

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  status public.account_status not null default 'active',
  display_name text,
  email text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_label text,
  app_version text not null,
  android_version text not null,
  android_api integer,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, id)
);

create table public.repair_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  category text not null,
  icon text not null default 'wrench',
  status public.tool_status not null default 'DRAFT',
  audience public.tool_audience not null default 'all_active_members',
  version integer not null default 0 check (version >= 0),
  draft_recipe jsonb not null,
  android_compatibility jsonb not null default '{"minApi":23}'::jsonb,
  minimum_app_version text not null default '1.0.0',
  estimated_seconds integer not null default 60 check (estimated_seconds between 1 and 3600),
  risk_classification text not null default 'read_only',
  repair_instructions jsonb not null default '[]'::jsonb,
  target_users jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.repair_tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.repair_tools(id) on delete restrict,
  version integer not null check (version > 0),
  payload jsonb not null,
  canonical_payload text not null,
  signature text not null,
  signature_algorithm text not null check (signature_algorithm = 'RSA-SHA256'),
  changelog text not null default '',
  published_by uuid not null references public.profiles(id),
  published_at timestamptz not null default now(),
  unique(tool_id, version)
);

create table public.repair_tool_access (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.repair_tools(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(tool_id, member_id)
);

create table public.device_tool_syncs (
  device_id uuid not null references public.devices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool_id uuid not null references public.repair_tools(id) on delete cascade,
  version integer not null check (version > 0),
  synced_at timestamptz not null default now(),
  primary key(device_id,tool_id)
);
create index device_tool_syncs_user_tool_idx on public.device_tool_syncs(user_id,tool_id);

create table public.repair_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete restrict,
  tool_id uuid not null references public.repair_tools(id) on delete restrict,
  tool_version integer not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  result public.repair_result not null,
  step_results jsonb not null default '[]'::jsonb,
  error_code text,
  app_version text not null,
  created_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at)
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.recipe_test_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  tool_id uuid references public.repair_tools(id) on delete set null,
  recipe_hash text not null,
  validation_status text not null check (validation_status in ('VALID','INVALID')),
  issues jsonb not null default '[]'::jsonb,
  simulated_step_count integer not null default 0 check (simulated_step_count between 0 and 50),
  tested_at timestamptz not null default now()
);
create index recipe_test_history_owner_tested_idx on public.recipe_test_history(owner_id,tested_at desc);

create table public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

create index devices_user_id_idx on public.devices(user_id);
create index repair_tools_status_idx on public.repair_tools(status);
create index repair_tool_versions_tool_version_idx on public.repair_tool_versions(tool_id, version desc);
create index repair_tool_access_member_idx on public.repair_tool_access(member_id);
create index repair_runs_started_at_idx on public.repair_runs(started_at desc);
create index repair_runs_user_idx on public.repair_runs(user_id, started_at desc);
create index repair_runs_tool_idx on public.repair_runs(tool_id, started_at desc);
create index admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);

create or replace function private.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger repair_tools_updated_at before update on public.repair_tools for each row execute function private.set_updated_at();

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, email, role, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''), new.email, 'member', 'active')
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.sync_user_email() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end; $$;
create trigger on_auth_user_email_updated after update of email on auth.users for each row
when (old.email is distinct from new.email) execute function private.sync_user_email();
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

create or replace function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.status = 'active');
$$;
create or replace function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;
create or replace function private.can_access_tool(p_tool_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.repair_tools t
    where t.id = p_tool_id and t.status = 'PUBLISHED'
      and private.is_active_member()
      and (t.audience = 'all_active_members' or exists (
        select 1 from public.repair_tool_access a where a.tool_id=t.id and a.member_id=auth.uid()
      ))
  );
$$;

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.repair_tools enable row level security;
alter table public.repair_tool_versions enable row level security;
alter table public.repair_tool_access enable row level security;
alter table public.repair_runs enable row level security;
alter table public.device_tool_syncs enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.recipe_test_history enable row level security;

-- Authenticated clients are deliberately read-only for all sensitive entities.
-- Every mutation goes through an authenticated Edge Function using service_role.
create policy "profiles self or owner read" on public.profiles for select to authenticated using (id = auth.uid() or private.is_owner());
create policy "devices owner or device owner read" on public.devices for select to authenticated using (user_id = auth.uid() or private.is_owner());
create policy "owners read repair tools" on public.repair_tools for select to authenticated using (private.is_owner());
create policy "members read accessible published tools" on public.repair_tools for select to authenticated using (private.can_access_tool(id));
create policy "owner reads versions" on public.repair_tool_versions for select to authenticated using (private.is_owner());
create policy "members read accessible versions" on public.repair_tool_versions for select to authenticated using (private.can_access_tool(tool_id));
create policy "owner reads assignments" on public.repair_tool_access for select to authenticated using (private.is_owner());
create policy "members read own assignments" on public.repair_tool_access for select to authenticated using (member_id = auth.uid());
create policy "owner reads runs" on public.repair_runs for select to authenticated using (private.is_owner());
create policy "owner reads device tool syncs" on public.device_tool_syncs for select to authenticated using (private.is_owner());
create policy "owner reads audit" on public.admin_audit_logs for select to authenticated using (private.is_owner());
create policy "owner reads recipe test history" on public.recipe_test_history for select to authenticated using (private.is_owner());
-- The Admin Panel uses its authenticated Supabase session for owner-only reads.
-- Supabase changed new-project defaults so table grants are opt-in; RLS alone does not
-- grant Data API access. These grants expose only SELECT and every row remains RLS-gated.
grant usage on schema public to authenticated, service_role;
grant select on table
  public.profiles,
  public.devices,
  public.repair_tools,
  public.repair_tool_versions,
  public.repair_tool_access,
  public.repair_runs,
  public.device_tool_syncs,
  public.admin_audit_logs,
  public.recipe_test_history
to authenticated;

-- Strip write grants as well as write policies from browser roles.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
-- No authenticated write policies are defined. Device writes, assignments, repair-run
-- writes, tool mutations, profile changes, audit and rate-limit state are service-role only.
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_owner() to authenticated, service_role;
grant execute on function private.is_active_member() to authenticated, service_role;
grant execute on function private.can_access_tool(uuid) to authenticated, service_role;

create or replace function public.commit_repair_tool_version(
  p_tool_id uuid, p_expected_version integer, p_payload jsonb, p_canonical_payload text,
  p_signature text, p_changelog text, p_published_by uuid
) returns integer language plpgsql security definer set search_path = '' as $$
declare current_version integer; next_version integer; current_status public.tool_status; current_slug text;
begin
  select version, status, slug into current_version, current_status, current_slug from public.repair_tools where id=p_tool_id for update;
  if current_version is null then raise exception 'TOOL_NOT_FOUND'; end if;
  if current_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if current_status in ('DISABLED','ARCHIVED') then raise exception 'TOOL_NOT_PUBLISHABLE'; end if;
  if p_payload->>'toolId' is distinct from current_slug or (p_payload->>'version')::integer is distinct from current_version + 1 or p_payload->>'schemaVersion' is distinct from '1' then raise exception 'INVALID_PUBLISHED_PAYLOAD'; end if;
  if length(coalesce(p_canonical_payload,''))=0 or length(coalesce(p_signature,''))=0 then raise exception 'MISSING_SIGNATURE'; end if;
  if not exists(select 1 from public.profiles where id=p_published_by and role='owner' and status='active') then raise exception 'OWNER_REQUIRED'; end if;
  next_version := current_version + 1;
  insert into public.repair_tool_versions(tool_id,version,payload,canonical_payload,signature,signature_algorithm,changelog,published_by)
  values(p_tool_id,next_version,p_payload,p_canonical_payload,p_signature,'RSA-SHA256',coalesce(p_changelog,''),p_published_by);
  update public.repair_tools set version=next_version,status='PUBLISHED' where id=p_tool_id;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
    values(p_published_by,'tool.published','repair_tool',p_tool_id::text,jsonb_build_object('version',next_version,'signature_algorithm','RSA-SHA256'));
  return next_version;
end; $$;
revoke all on function public.commit_repair_tool_version(uuid,integer,jsonb,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.commit_repair_tool_version(uuid,integer,jsonb,text,text,text,uuid) to service_role;

create or replace function public.consume_rate_limit(p_bucket_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare now_at timestamptz := now(); current_count integer;
begin
  insert into public.rate_limit_buckets(bucket_key,window_started_at,request_count)
  values(p_bucket_key,now_at,1)
  on conflict(bucket_key) do update set
    window_started_at = case when public.rate_limit_buckets.window_started_at < now_at - make_interval(secs=>p_window_seconds) then now_at else public.rate_limit_buckets.window_started_at end,
    request_count = case when public.rate_limit_buckets.window_started_at < now_at - make_interval(secs=>p_window_seconds) then 1 else public.rate_limit_buckets.request_count + 1 end;
  select request_count into current_count from public.rate_limit_buckets where bucket_key=p_bucket_key;
  return current_count <= p_limit;
end; $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;


create or replace function public.replace_repair_tool_access(
  p_tool_id uuid, p_member_ids uuid[], p_assigned_by uuid, p_audience public.tool_audience
) returns void language plpgsql security definer set search_path = '' as $$
declare invalid_count integer;
begin
  if not exists (select 1 from public.profiles where id=p_assigned_by and role='owner' and status='active') then
    raise exception 'OWNER_REQUIRED';
  end if;
  if not exists (select 1 from public.repair_tools where id=p_tool_id) then
    raise exception 'TOOL_NOT_FOUND';
  end if;
  if p_audience = 'selected_members' then
    if coalesce(cardinality(p_member_ids),0) = 0 then raise exception 'MEMBER_LIST_REQUIRED'; end if;
    select count(*) into invalid_count
      from (select distinct member_id from unnest(p_member_ids) as u(member_id)) selected
      left join public.profiles p on p.id=selected.member_id and p.role='member' and p.status='active'
      where p.id is null;
    if invalid_count > 0 then raise exception 'INVALID_OR_INACTIVE_MEMBER'; end if;
  end if;
  delete from public.repair_tool_access where tool_id=p_tool_id;
  if p_audience = 'selected_members' then
    insert into public.repair_tool_access(tool_id,member_id,assigned_by)
      select p_tool_id, member_id, p_assigned_by
      from (select distinct member_id from unnest(p_member_ids) as u(member_id)) selected;
  end if;
  update public.repair_tools set audience=p_audience where id=p_tool_id;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
    values(p_assigned_by,'tool.access.updated','repair_tool',p_tool_id::text,jsonb_build_object('audience',p_audience,'member_count',case when p_audience='all_active_members' then 'all' else cardinality(p_member_ids)::text end));
end; $$;
revoke all on function public.replace_repair_tool_access(uuid,uuid[],uuid,public.tool_audience) from public, anon, authenticated;
grant execute on function public.replace_repair_tool_access(uuid,uuid[],uuid,public.tool_audience) to service_role;


create or replace function public.get_admin_analytics() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total_runs', (select count(*) from public.repair_runs),
    'success', (select count(*) from public.repair_runs where result='SUCCESS'),
    'partial', (select count(*) from public.repair_runs where result='PARTIAL'),
    'failed', (select count(*) from public.repair_runs where result='FAILED'),
    'cancelled', (select count(*) from public.repair_runs where result='CANCELLED'),
    'active_members', (select count(*) from public.profiles where role='member' and status='active'),
    'published_tools', (select count(*) from public.repair_tools where status='PUBLISHED'),
    'most_used_tools', coalesce((
      select jsonb_agg(jsonb_build_object('tool_id',x.tool_id,'name',x.name,'runs',x.runs) order by x.runs desc)
      from (select r.tool_id,t.name,count(*) as runs from public.repair_runs r join public.repair_tools t on t.id=r.tool_id group by r.tool_id,t.name order by count(*) desc limit 5) x
    ), '[]'::jsonb),
    'common_failures', coalesce((
      select jsonb_agg(jsonb_build_object('error_code',x.error_code,'occurrences',x.occurrences) order by x.occurrences desc)
      from (select error_code,count(*) as occurrences from public.repair_runs where result in ('FAILED','PARTIAL') and error_code is not null group by error_code order by count(*) desc limit 5) x
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.get_admin_analytics() from public, anon, authenticated;
grant execute on function public.get_admin_analytics() to service_role;

-- Published version rows are append-only even for service_role through SQL triggers.
create or replace function private.reject_version_mutation() returns trigger language plpgsql as $$
begin raise exception 'PUBLISHED_VERSIONS_ARE_IMMUTABLE'; end; $$;
create trigger repair_tool_versions_immutable before update or delete on public.repair_tool_versions for each row execute function private.reject_version_mutation();

create or replace function private.reject_audit_mutation() returns trigger language plpgsql as $$
begin raise exception 'ADMIN_AUDIT_LOGS_ARE_APPEND_ONLY'; end; $$;
create trigger admin_audit_logs_append_only before update or delete on public.admin_audit_logs for each row execute function private.reject_audit_mutation();

-- Bootstrap owner manually only after creating the owner's Auth account:
-- update public.profiles set role='owner' where id=(select id from auth.users where email='YOUR_OWNER_EMAIL');
