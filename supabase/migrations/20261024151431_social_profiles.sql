begin;
alter table public.player_profiles add column display_name text;
alter table public.player_profiles add column bio text not null default '';
alter table public.player_profiles add column avatar_id text not null default '11000101';
update public.player_profiles p set display_name =
  case when trim(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'username','')) ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'
    and lower(trim(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'username',''))) = p.username
  then trim(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'username'))
  else p.username end
from auth.users u where u.id=p.user_id;
alter table public.player_profiles alter column display_name set not null;
alter table public.player_profiles add constraint profile_display_name_valid
  check (display_name ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' and lower(display_name)=username);
alter table public.player_profiles add constraint profile_bio_valid check (char_length(bio)<=160);
alter table public.player_profiles add constraint profile_avatar_valid check (avatar_id ~ '^[0-9]{8}$');

create or replace function public.game_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare original text := trim(new.raw_user_meta_data->>'username'); candidate text := lower(original);
begin
  if candidate is not null then
    if original !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then raise exception 'USERNAME_INVALID'; end if;
    insert into public.player_profiles(user_id,username,display_name) values(new.id,candidate,original);
  end if;
  return new;
end $$;
create or replace function public.game_set_username(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); original text := trim(p_username); candidate text := lower(original); result text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if original is null or original !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then raise exception 'USERNAME_INVALID'; end if;
  select username into result from public.player_profiles where user_id=uid;
  if found then return result; end if;
  begin
    insert into public.player_profiles(user_id,username,display_name) values(uid,candidate,original)
      on conflict(user_id) do nothing;
  exception when unique_violation then raise exception 'USERNAME_TAKEN';
  end;
  select username into result from public.player_profiles where user_id=uid;
  return result;
end $$;

create table public.player_friendships (
  user_a uuid not null references public.player_profiles(user_id) on delete cascade,
  user_b uuid not null references public.player_profiles(user_id) on delete cascade,
  requester uuid not null references public.player_profiles(user_id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_a,user_b),
  check(user_a<user_b),
  check(requester=user_a or requester=user_b)
);
create index friendships_user_b_idx on public.player_friendships(user_b);
alter table public.player_friendships enable row level security;
revoke all on public.player_friendships from public,anon,authenticated;
grant select on public.player_friendships to authenticated;
create policy read_own_friendships on public.player_friendships for select to authenticated
  using ((select auth.uid())=user_a or (select auth.uid())=user_b);

create function public.social_profile(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); target uuid := coalesce(p_user,auth.uid()); p public.player_profiles; f public.player_friendships; relation text := 'none';
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.player_profiles where user_id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  select * into p from public.player_profiles where user_id=target;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if uid=target then relation:='self';
  else
    select * into f from public.player_friendships where user_a=least(uid,target) and user_b=greatest(uid,target);
    if found then relation:=case when f.status='accepted' then 'friends' when f.requester=uid then 'outgoing' else 'incoming' end; end if;
  end if;
  return jsonb_build_object('user_id',p.user_id,'username',p.username,'display_name',p.display_name,
    'bio',p.bio,'avatar_id',p.avatar_id,'created_at',p.created_at,'relationship',relation);
end $$;

create function public.social_search(p_username text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_username is null or trim(p_username) !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then raise exception 'USERNAME_INVALID'; end if;
  select user_id into target from public.player_profiles where username=lower(trim(p_username));
  if not found then return null; end if;
  return public.social_profile(target);
end $$;

create function public.social_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.player_profiles where user_id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  select jsonb_build_object(
    'friends',coalesce(jsonb_agg(public.social_profile(case when user_a=uid then user_b else user_a end) order by updated_at desc) filter(where status='accepted'),'[]'::jsonb),
    'incoming',coalesce(jsonb_agg(public.social_profile(requester) order by created_at desc) filter(where status='pending' and requester<>uid),'[]'::jsonb),
    'outgoing',coalesce(jsonb_agg(public.social_profile(case when user_a=uid then user_b else user_a end) order by created_at desc) filter(where status='pending' and requester=uid),'[]'::jsonb)
  ) into result from public.player_friendships where user_a=uid or user_b=uid;
  return result;
end $$;

create function public.social_friend_action(p_target uuid,p_action text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a uuid; b uuid; f public.player_friendships;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_target is null or p_target=uid then raise exception 'FRIEND_SELF'; end if;
  if p_action is null or p_action not in ('request','accept','decline','cancel','remove') then raise exception 'FRIEND_ACTION_INVALID'; end if;
  if not exists(select 1 from public.player_profiles where user_id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  if not exists(select 1 from public.player_profiles where user_id=p_target) then raise exception 'PLAYER_NOT_FOUND'; end if;
  a:=least(uid,p_target); b:=greatest(uid,p_target);
  if p_action='request' then
    if (select count(*) from public.player_friendships where user_a=uid or user_b=uid)>=200 then raise exception 'FRIEND_LIMIT'; end if;
    insert into public.player_friendships(user_a,user_b,requester) values(a,b,uid)
      on conflict(user_a,user_b) do nothing;
  end if;
  select * into f from public.player_friendships where user_a=a and user_b=b for update;
  if not found then
    if p_action in ('decline','cancel','remove') then return 'none'; end if;
    raise exception 'FRIEND_REQUEST_MISSING';
  end if;
  if p_action='request' then
    return case when f.status='accepted' then 'friends' when f.requester=uid then 'outgoing' else 'incoming' end;
  elsif p_action='accept' then
    if f.status='accepted' then return 'friends'; end if;
    if f.requester=uid then raise exception 'FRIEND_ACTION_DENIED'; end if;
    update public.player_friendships set status='accepted',updated_at=now() where user_a=a and user_b=b;
    return 'friends';
  elsif p_action='decline' then
    if f.status<>'pending' or f.requester=uid then raise exception 'FRIEND_ACTION_DENIED'; end if;
  elsif p_action='cancel' then
    if f.status<>'pending' or f.requester<>uid then raise exception 'FRIEND_ACTION_DENIED'; end if;
  elsif p_action='remove' then
    if f.status<>'accepted' then raise exception 'FRIEND_ACTION_DENIED'; end if;
  end if;
  delete from public.player_friendships where user_a=a and user_b=b;
  return 'none';
end $$;

create function public.social_update_profile(p_display_name text,p_bio text,p_avatar_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p public.player_profiles; original text := trim(p_display_name);
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into p from public.player_profiles where user_id=uid for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  if original is null or original !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' or lower(original)<>p.username then raise exception 'DISPLAY_NAME_INVALID'; end if;
  if p_bio is null or char_length(p_bio)>160 then raise exception 'BIO_INVALID'; end if;
  if p_avatar_id is null or p_avatar_id not in ('11000101','11000211','11000301') then raise exception 'AVATAR_INVALID'; end if;
  update public.player_profiles set display_name=original,bio=trim(p_bio),avatar_id=p_avatar_id where user_id=uid;
  return public.social_profile(uid);
end $$;

revoke all on function public.social_profile(uuid),public.social_search(text),public.social_list(),
  public.social_friend_action(uuid,text),public.social_update_profile(text,text,text) from public,anon,authenticated;
grant execute on function public.social_profile(uuid),public.social_search(text),public.social_list(),
  public.social_friend_action(uuid,text),public.social_update_profile(text,text,text) to authenticated;
commit;
