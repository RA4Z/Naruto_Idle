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
    not has_function_privilege('anon','public.game_claim(uuid,jsonb)','EXECUTE') as no_guest_claim;`,
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
