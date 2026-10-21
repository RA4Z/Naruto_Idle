import { management } from "./supabase-management.mjs";
const ref = process.env.SUPABASE_PROJECT_REF;
try {
  if (!ref || !/^[a-z]{20}$/.test(ref))
    throw new Error("Set SUPABASE_PROJECT_REF.");
  const project = await management(`projects/${ref}`);
  console.log(
    JSON.stringify({
      name: project.name,
      ref,
      status: project.status,
      region: project.region,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
