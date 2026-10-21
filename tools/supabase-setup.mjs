import { readFile, readdir } from "node:fs/promises";
import {
  freeProject,
  management,
  saveEnvironment,
} from "./supabase-management.mjs";
try {
  const ref = await freeProject();
  const history = await management(`projects/${ref}/database/migrations`);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => /^\d+_[a-z_]+\.sql$/.test(f))
    .sort()) {
    const name = file.replace(/\.sql$/, "");
    if (
      history.some((m) => m.name === name || `${m.version}_${m.name}` === name)
    ) {
      console.log("Already applied:", name);
      continue;
    }
    const query = await readFile(`supabase/migrations/${file}`, "utf8");
    await management(`projects/${ref}/database/migrations`, "POST", {
      name,
      query,
    });
    console.log("Applied migration:", name);
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
