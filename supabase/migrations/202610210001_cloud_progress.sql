-- Beta cloud saves: deliberately unverified client progression, never ranked.
-- No service key is required in the browser or game backend.
begin;
create table public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  provenance text not null default 'client_unverified' check (provenance = 'client_unverified'),
  lease_id uuid,
  lease_until timestamptz,
  last_request_id uuid,
  last_request_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint snapshot_shape check (
    coalesce(jsonb_typeof(snapshot) = 'object' and snapshot->>'version' = '1'
    and snapshot->>'character' in ('naruto', 'sasuke', 'sakura')
    and jsonb_typeof(snapshot->'inventory') = 'object'
    and jsonb_typeof(snapshot->'level') = 'number'
    and jsonb_typeof(snapshot->'coins') = 'number'
    and octet_length(snapshot::text) <= 131072, false)
  )
);
alter table public.game_saves enable row level security;
revoke all on public.game_saves from anon, authenticated;
grant select on public.game_saves to authenticated;
create policy read_own_save on public.game_saves for select to authenticated using ((select auth.uid()) = user_id);

create function public.game_claim(p_lease uuid, p_snapshot jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.game_saves; stamp timestamptz := clock_timestamp(); uid uuid := auth.uid();
begin
  if uid is null or p_lease is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_snapshot is not null then
    -- Imports are create-only; never replace an existing cloud journey.
    insert into public.game_saves(user_id, snapshot)
    values (uid, jsonb_set(p_snapshot, '{lastSaved}', to_jsonb(floor(extract(epoch from stamp)*1000)::bigint)))
    on conflict (user_id) do nothing;
  end if;
  select * into s from public.game_saves where user_id = uid for update;
  if not found then raise exception 'SAVE_MISSING'; end if;
  if s.lease_id is not null and s.lease_id <> p_lease and s.lease_until > stamp then
    raise exception 'SESSION_BUSY';
  end if;
  update public.game_saves set lease_id = p_lease, lease_until = stamp + interval '120 seconds'
    where user_id = uid returning * into s;
  return jsonb_build_object('snapshot', s.snapshot, 'revision', s.revision,
    'serverNow', floor(extract(epoch from stamp)*1000)::bigint, 'leaseUntil', floor(extract(epoch from s.lease_until)*1000)::bigint);
end $$;

create function public.game_commit(p_lease uuid, p_revision bigint, p_request uuid, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.game_saves; stamp timestamptz := clock_timestamp(); uid uuid := auth.uid(); fingerprint text;
begin
  if uid is null or p_request is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into s from public.game_saves where user_id = uid for update;
  if not found then raise exception 'SAVE_MISSING'; end if;
  if p_lease is null or s.lease_id is distinct from p_lease or s.lease_until <= stamp then raise exception 'SESSION_LOST'; end if;
  fingerprint := md5(p_snapshot::text);
  if s.last_request_id = p_request then
    if s.last_request_hash is distinct from fingerprint then raise exception 'REQUEST_MISMATCH'; end if;
  else
    if s.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    update public.game_saves set snapshot = jsonb_set(p_snapshot, '{lastSaved}', to_jsonb(floor(extract(epoch from stamp)*1000)::bigint)),
      revision = revision + 1, updated_at = stamp, last_request_id = p_request, last_request_hash = fingerprint,
      lease_until = stamp + interval '120 seconds' where user_id = uid returning * into s;
  end if;
  return jsonb_build_object('revision', s.revision, 'serverNow', floor(extract(epoch from stamp)*1000)::bigint,
    'leaseUntil', floor(extract(epoch from s.lease_until)*1000)::bigint);
end $$;

create function public.game_heartbeat(p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); until_time timestamptz;
begin
  update public.game_saves set lease_until = stamp + interval '120 seconds'
    where user_id = auth.uid() and lease_id = p_lease and lease_until > stamp
    returning lease_until into until_time;
  if not found then raise exception 'SESSION_LOST'; end if;
  return jsonb_build_object('serverNow', floor(extract(epoch from stamp)*1000)::bigint,
    'leaseUntil', floor(extract(epoch from until_time)*1000)::bigint);
end $$;

create function public.game_release(p_lease uuid)
returns void language sql security definer set search_path = '' as $$
  update public.game_saves set lease_id = null, lease_until = null
    where user_id = auth.uid() and lease_id = p_lease;
$$;
revoke all on function public.game_claim(uuid,jsonb), public.game_commit(uuid,bigint,uuid,jsonb),
  public.game_heartbeat(uuid), public.game_release(uuid) from public, anon;
grant execute on function public.game_claim(uuid,jsonb), public.game_commit(uuid,bigint,uuid,jsonb),
  public.game_heartbeat(uuid), public.game_release(uuid) to authenticated;
comment on table public.game_saves is 'Unverified beta cloud snapshots. Excluded from authoritative economy, ranking and trades.';
commit;
