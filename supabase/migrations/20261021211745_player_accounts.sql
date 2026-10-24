-- Usernames are canonical account identity, separate from editable Auth metadata.
begin;
create table public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  created_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;
revoke all on public.player_profiles from anon, authenticated;
grant select on public.player_profiles to authenticated;
create policy read_own_profile on public.player_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.game_username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(lower(trim(p_username)) ~ '^[a-z][a-z0-9_]{2,19}$', false)
    and not exists(select 1 from public.player_profiles where username = lower(trim(p_username)));
$$;

create function public.game_set_username(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); candidate text := lower(trim(p_username)); result text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if candidate is null or candidate !~ '^[a-z][a-z0-9_]{2,19}$' then raise exception 'USERNAME_INVALID'; end if;
  select username into result from public.player_profiles where user_id = uid;
  if found then return result; end if;
  begin
    insert into public.player_profiles(user_id, username) values (uid, candidate)
      on conflict (user_id) do nothing;
  exception when unique_violation then raise exception 'USERNAME_TAKEN';
  end;
  select username into result from public.player_profiles where user_id = uid;
  return result;
end $$;

create function public.game_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare candidate text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  -- Existing/admin accounts without metadata complete their profile after login.
  if candidate is not null then
    if candidate !~ '^[a-z][a-z0-9_]{2,19}$' then raise exception 'USERNAME_INVALID'; end if;
    insert into public.player_profiles(user_id, username) values (new.id, candidate);
  end if;
  return new;
end $$;
create trigger game_profile_on_signup after insert on auth.users
  for each row execute function public.game_create_profile();
revoke all on function public.game_create_profile() from public, anon, authenticated;
revoke all on function public.game_username_available(text), public.game_set_username(text) from public, anon, authenticated;
grant execute on function public.game_username_available(text) to anon, authenticated;
grant execute on function public.game_set_username(text) to authenticated;

create or replace function public.game_claim(p_lease uuid, p_snapshot jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.game_saves; stamp timestamptz := clock_timestamp(); uid uuid := auth.uid();
begin
  if uid is null or p_lease is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.player_profiles where user_id = uid) then raise exception 'PROFILE_REQUIRED'; end if;
  if p_snapshot is not null then
    insert into public.game_saves(user_id, snapshot)
    values (uid, jsonb_set(p_snapshot, '{lastSaved}', to_jsonb(floor(extract(epoch from stamp)*1000)::bigint)))
    on conflict (user_id) do nothing;
  end if;
  select * into s from public.game_saves where user_id = uid for update;
  if not found then raise exception 'SAVE_MISSING'; end if;
  if s.lease_id is not null and s.lease_id <> p_lease and s.lease_until > stamp then raise exception 'SESSION_BUSY'; end if;
  update public.game_saves set lease_id = p_lease, lease_until = stamp + interval '120 seconds'
    where user_id = uid returning * into s;
  return jsonb_build_object('snapshot', s.snapshot, 'revision', s.revision,
    'serverNow', floor(extract(epoch from stamp)*1000)::bigint, 'leaseUntil', floor(extract(epoch from s.lease_until)*1000)::bigint);
end $$;
commit;
