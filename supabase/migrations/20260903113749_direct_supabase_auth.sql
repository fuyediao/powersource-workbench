drop function if exists public.work_activate_invitation(text, text, text, timestamptz);
drop table if exists public.work_sessions cascade;
drop table if exists public.work_invitations cascade;
drop table if exists public.work_users cascade;

create table public.work_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  display_name text not null default '',
  role text not null default 'member'
    check (role in ('super_admin', 'system_admin', 'member')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.work_invitations (
  id uuid primary key default gen_random_uuid(),
  username text not null
    check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  display_name text not null default '',
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index work_invitations_pending_username_key
  on public.work_invitations (username)
  where accepted_at is null and revoked_at is null;

create unique index work_profiles_one_super_admin
  on public.work_profiles (role)
  where role = 'super_admin';

alter table public.work_profiles enable row level security;
alter table public.work_invitations enable row level security;

revoke all on table public.work_profiles from public, anon, authenticated;
revoke all on table public.work_invitations from public, anon, authenticated;

grant select on table public.work_profiles to authenticated;
grant select, insert, update, delete on table public.work_profiles to service_role;
grant select, insert, update, delete on table public.work_invitations to service_role;

create policy work_profiles_select_own
  on public.work_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

comment on table public.work_profiles is 'Supabase Auth-backed PowerSource Workbench profiles.';
comment on table public.work_invitations is 'One-time Workbench account invitations managed by Edge Functions.';

-- Attach the existing GeoCRM super-admin Auth user. Do not create a second
-- password; Workbench signs in with the same GoTrue credentials.
do $$
declare
  v_user_id uuid;
  v_username text := 'contact';
begin
  select id into v_user_id
  from auth.users
  where lower(email) = 'contact@geocrm.org'
  limit 1;
  if v_user_id is null then
    return;
  end if;

  insert into public.work_profiles (id, username, display_name, role, status)
  values (v_user_id, v_username, 'Super Administrator', 'super_admin', 'active')
  on conflict (id) do update
    set role = 'super_admin',
        username = excluded.username,
        status = 'active',
        updated_at = now();

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'super_admin',
    'username', v_username,
    'display_name', 'Super Administrator'
  )
  where id = v_user_id;
end $$;

notify pgrst, 'reload schema';
