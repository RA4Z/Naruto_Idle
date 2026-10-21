import { readdir, readFile } from "node:fs/promises";
try {
  process.loadEnvFile();
} catch {}
const secrets = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
]
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 8);
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(file);
    else if (/\.(js|html|json|map)$/.test(file)) {
      const value = await readFile(file, "utf8");
      if (
        secrets.some((secret) => value.includes(secret)) ||
        value.includes("http://127.0.0.1:5195")
      )
        throw new Error(
          `Private credential or local test configuration found in ${file}. Do not publish.`,
        );
    }
  }
}
await walk("dist");
console.log(
  "Bundle checked: no configured Supabase secrets or local cloud fixture URL.",
);
