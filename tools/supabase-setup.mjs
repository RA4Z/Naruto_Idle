import { readFile, readdir, rename, access } from "node:fs/promises";
import { migrationIdentity, assertMigrationHistory, appliedMigration, newlyAppliedFile } from "./migration-history.mjs";
import {
  freeProject,
  management,
  saveEnvironment,
} from "./supabase-management.mjs";
try {
  const ref = await freeProject();
  let history = await management(`projects/${ref}/database/migrations`);
  const files = (await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort();
  assertMigrationHistory(files, history);
  for (const file of files) {
    const {name} = migrationIdentity(file);
    if (appliedMigration(file, history)) {
      console.log("Already applied:", file);
      continue;
    }
    const query = await readFile(`supabase/migrations/${file}`, "utf8");
    await management(`projects/${ref}/database/migrations`, "POST", {name, query});
    const current = await management(`projects/${ref}/database/migrations`);
    const canonical = newlyAppliedFile(history, current, name);
    if (canonical !== file) {
      const target = `supabase/migrations/${canonical}`;
      const exists = await access(target).then(() => true, () => false);
      if (exists) throw new Error("Applied migration filename already exists: " + canonical);
      await rename(`supabase/migrations/${file}`, target);
      console.log("Local file aligned to API version:", canonical, "(commit this filename)");
    }
    history = current;
    console.log("Applied migration:", canonical);
  }
  const keys = await management(`projects/${ref}/api-keys`);
  // Prefer modern publishable key; legacy anon is safe for a public browser too.
  const key =
    keys.find((k) => k.type === "publishable") ||
    keys.find((k) => k.name === "anon");
  if (!key?.api_key)
    throw new Error(
      "Public key not found. Set VITE_SUPABASE_PUBLISHABLE_KEY from the project dashboard.",
    );
  await saveEnvironment({
    SUPABASE_PROJECT_REF: ref,
    VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: key.api_key,
  });
  const auth = await management(`projects/${ref}/config/auth`);
  const site =
    process.env.SUPABASE_SITE_URL || "https://naruto-idle.vercel.app";
  const redirects = [
    ...new Set([
      ...(auth.uri_allow_list || "").split(",").filter(Boolean),
      site,
      "http://localhost:5178",
      "http://127.0.0.1:5178",
    ]),
  ];
  await management(`projects/${ref}/config/auth`, "PATCH", {
    site_url: site,
    uri_allow_list: redirects.join(","),
  });
  console.log(
    "Public configuration written to .env. Restart Vite/rebuild. No secret keys copied to the frontend.",
  );
  console.log(
    "Auth site/redirect URLs configured. Configure custom SMTP in the dashboard for public email registration/recovery. Confirmation settings were preserved.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
