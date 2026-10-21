-- New accounts start from server-owned defaults, never an imported browser save.
begin;
create function public.game_open(p_lease uuid, p_character text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.game_saves; stamp timestamptz := clock_timestamp(); uid uuid := auth.uid(); initial jsonb; active_id text;
begin
  if uid is null or p_lease is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.player_profiles where user_id = uid) then raise exception 'PROFILE_REQUIRED'; end if;
  if p_character is not null then
    active_id := case p_character when 'naruto' then '11000101' when 'sasuke' then '11000211' when 'sakura' then '11000301' else null end;
    if active_id is null then raise exception 'INVALID_CHARACTER'; end if;
    initial := jsonb_build_object(
      'version',1,'character',p_character,'activeEntityId',active_id,
      'level',1,'xp',0,'coins',0,'inventory','{}'::jsonb,'area',0,'upgrades',0,'kills',0,'defeats',0,
      'lastSaved',floor(extract(epoch from stamp)*1000)::bigint,'sound',false,'paused',false,
      'location','10001','autoHunt',false,'partyIds','[]'::jsonb,'equipment','{}'::jsonb,
      'questClaims','[]'::jsonb,'visitedMaps','["10001"]'::jsonb,
      'collection','["11000101","11000211","11000301"]'::jsonb,
      'characterProgress',jsonb_build_object(
        '11000101','{"level":1,"xp":0,"upgrades":0,"equipment":{}}'::jsonb,
        '11000211','{"level":1,"xp":0,"upgrades":0,"equipment":{}}'::jsonb,
        '11000301','{"level":1,"xp":0,"upgrades":0,"equipment":{}}'::jsonb));
    insert into public.game_saves(user_id,snapshot) values(uid,initial) on conflict(user_id) do nothing;
  end if;
  select * into s from public.game_saves where user_id = uid for update;
  if not found then raise exception 'SAVE_MISSING'; end if;
  if s.lease_id is not null and s.lease_id <> p_lease and s.lease_until > stamp then raise exception 'SESSION_BUSY'; end if;
  update public.game_saves set lease_id=p_lease, lease_until=stamp+interval '120 seconds'
    where user_id=uid returning * into s;
  return jsonb_build_object('snapshot',s.snapshot,'revision',s.revision,
    'serverNow',floor(extract(epoch from stamp)*1000)::bigint,
    'leaseUntil',floor(extract(epoch from s.lease_until)*1000)::bigint);
end $$;
revoke all on function public.game_open(uuid,text) from public, anon;
grant execute on function public.game_open(uuid,text) to authenticated;

-- Old builds may still resume existing saves; importing arbitrary JSON is closed.
create or replace function public.game_claim(p_lease uuid, p_snapshot jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_snapshot is not null then raise exception 'IMPORT_DISABLED'; end if;
  return public.game_open(p_lease,null);
end $$;
commit;
