-- Explicit journey entry transfers ownership atomically to this authenticated user.
-- Old leases can neither commit nor release the new owner's save.
begin;
create function public.game_takeover(p_lease uuid, p_character text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_lease is null then raise exception 'AUTH_REQUIRED'; end if;
  -- UPDATE locks the same row used by game_commit/game_open. The snapshot and
  -- revision returned below therefore include every commit accepted before us.
  update public.game_saves set lease_id = null, lease_until = null where user_id = uid;
  return public.game_open(p_lease, p_character);
end $$;
revoke all on function public.game_takeover(uuid,text) from public, anon;
grant execute on function public.game_takeover(uuid,text) to authenticated;
commit;
