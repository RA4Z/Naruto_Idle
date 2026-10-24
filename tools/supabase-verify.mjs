// Read-only deployed-schema inspection. Never fetch player snapshots or auth users.
import assert from "node:assert/strict";
import { management } from "./supabase-management.mjs";
try {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref))
    throw new Error("Set SUPABASE_PROJECT_REF.");
  const checks = await management(`projects/${ref}/database/query`, "POST", {
    query: `select
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='game_saves' and c.relrowsecurity) as rls,
    has_table_privilege('authenticated','public.game_saves','SELECT') as own_read,
    not has_table_privilege('authenticated','public.game_saves','UPDATE') as no_direct_update,
    not has_table_privilege('anon','public.game_saves','SELECT') as no_guest_read,
    has_function_privilege('authenticated','public.game_claim(uuid,jsonb)','EXECUTE') as claim_allowed,
    not has_function_privilege('anon','public.game_claim(uuid,jsonb)','EXECUTE') as no_guest_claim,
    has_function_privilege('authenticated','public.game_open(uuid,text)','EXECUTE') as open_allowed,
    not has_function_privilege('anon','public.game_open(uuid,text)','EXECUTE') as no_guest_open,
    has_function_privilege('authenticated','public.game_takeover(uuid,text)','EXECUTE') as takeover_allowed,
    not has_function_privilege('anon','public.game_takeover(uuid,text)','EXECUTE') as no_guest_takeover,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='player_profiles' and c.relrowsecurity) as profile_rls,
    has_table_privilege('authenticated','public.player_profiles','SELECT') as own_profile_read,
    not has_table_privilege('anon','public.player_profiles','SELECT') as no_guest_profile_read,
    not has_table_privilege('authenticated','public.player_profiles','INSERT') as no_direct_profile_insert,
    not has_table_privilege('authenticated','public.player_profiles','UPDATE') as no_direct_profile_update,
    not has_table_privilege('authenticated','public.player_profiles','DELETE') as no_direct_profile_delete,
    has_function_privilege('authenticated','public.game_set_username(text)','EXECUTE') as profile_claim_allowed,
    not has_function_privilege('anon','public.game_set_username(text)','EXECUTE') as no_guest_profile_claim,
    has_function_privilege('anon','public.game_username_available(text)','EXECUTE') as username_availability,
    not has_function_privilege('authenticated','public.game_create_profile()','EXECUTE') as no_direct_trigger,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='player_profiles' and column_name='display_name') as display_name_column,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='player_friendships' and c.relrowsecurity) as friendship_rls,
    not has_table_privilege('anon','public.player_friendships','SELECT') as no_guest_friendships,
    not has_table_privilege('authenticated','public.player_friendships','INSERT') as no_direct_friend_insert,
    not has_table_privilege('authenticated','public.player_friendships','UPDATE') as no_direct_friend_update,
    not has_table_privilege('authenticated','public.player_friendships','DELETE') as no_direct_friend_delete,
    has_function_privilege('authenticated','public.social_profile(uuid)','EXECUTE') as social_profile_allowed,
    not has_function_privilege('anon','public.social_profile(uuid)','EXECUTE') as no_guest_social_profile,
    has_function_privilege('authenticated','public.social_friend_action(uuid,text)','EXECUTE') as friend_action_allowed,
    not has_function_privilege('anon','public.social_friend_action(uuid,text)','EXECUTE') as no_guest_friend_action,
    has_function_privilege('authenticated','public.social_update_profile(text,text,text)','EXECUTE') as edit_profile_allowed,
    not has_function_privilege('anon','public.social_update_profile(text,text,text)','EXECUTE') as no_guest_profile_edit,
    has_function_privilege('authenticated','public.social_inspect_player(uuid)','EXECUTE') as inspection_allowed,
    not has_function_privilege('anon','public.social_inspect_player(uuid)','EXECUTE') as no_guest_inspection;`,
  });
  assert.ok(
    checks.length === 1 && Object.values(checks[0]).every((v) => v === true),
    "Schema permissions do not match expected migration.",
  );
  console.log(
    "Deployed cloud schema: RLS and role permissions verified. No player data read.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
