// Local production-rendering fixture. Output is ignored and MUST NOT be deployed.
import { build } from "vite";
import { writeFile } from "node:fs/promises";
process.env.VITE_SUPABASE_URL = "http://127.0.0.1:5195";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
await build({
  configLoader: "runner",
  build: { outDir: "assets-extraidos/qa-prod-delivery", copyPublicDir: false, emptyOutDir: false },
});
await writeFile("assets-extraidos/qa-prod-delivery/local-fixture.txt", "LOCAL TEST ONLY\n");
