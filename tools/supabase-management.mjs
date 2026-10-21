import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
try {
  process.loadEnvFile();
} catch {}

export async function management(path, method = "GET", body) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token)
    throw new Error(
      "Configure SUPABASE_ACCESS_TOKEN in .env. Never put it in VITE_* variables.",
    );
  const response = await fetch(`https://api.supabase.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      `Supabase API HTTP ${response.status}: unexpected response (network gateway may be blocking access).`,
    );
  if (!response.ok)
    throw new Error(
      `Supabase API ${method} ${path}: HTTP ${response.status}. No response body logged to protect credentials.`,
    );
  return response.status === 204 ? null : response.json();
}
export async function saveEnvironment(values) {
  let text = await readFile(".env", "utf8").catch(() => "");
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key))
      throw new Error("Invalid environment key");
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text)
      ? text.replace(pattern, () => line)
      : text.trimEnd() + "\n" + line + "\n";
  }
  await writeFile(".env", text, { mode: 0o600 });
}
export async function freeProject() {
  const organizations = await management("organizations");
  const name = process.env.SUPABASE_ORGANIZATION || "Lharaz";
  const matches = organizations.filter(
    (o) => o.name.toLowerCase() === name.toLowerCase(),
  );
  if (matches.length !== 1)
    throw new Error(
      "Organization missing or ambiguous. Set SUPABASE_ORGANIZATION.",
    );
  const org = matches[0],
    slug = org.slug || org.id;
  const detail = await management(`organizations/${slug}`);
  if (detail.plan !== "free")
    throw new Error(
      "Refusing changes: organization is not confirmed on the Free plan.",
    );
  const projects = await management("projects");
  const projectName = process.env.SUPABASE_PROJECT_NAME || "Naruto Idle";
  const candidates = projects.filter(
    (p) =>
      (p.organization_id === org.id || p.organization_slug === slug) &&
      (process.env.SUPABASE_PROJECT_REF
        ? p.id === process.env.SUPABASE_PROJECT_REF ||
          p.ref === process.env.SUPABASE_PROJECT_REF
        : p.name.toLowerCase() === projectName.toLowerCase()),
  );
  if (candidates.length > 1)
    throw new Error("Ambiguous project. Set SUPABASE_PROJECT_REF.");
  let project = candidates[0];
  if (!project) {
    if (process.env.SUPABASE_PROJECT_REF)
      throw new Error(
        "Project reference does not belong to the selected organization.",
      );
    // An organization on Free cannot incur compute charges; never upgrade it,
    // create branches, purchase add-ons or change billing to make this succeed.
    const password = randomBytes(32).toString("base64url");
    await saveEnvironment({ SUPABASE_DB_PASSWORD: password });
    project = await management("projects", "POST", {
      name: projectName,
      organization_slug: slug,
      db_pass: password,
      region: process.env.SUPABASE_REGION || "sa-east-1",
      plan: "free",
    });
    await saveEnvironment({ SUPABASE_PROJECT_REF: project.ref || project.id });
    throw new Error(
      "Free project created; wait until its database is ready, then run db:setup again. Credentials saved locally.",
    );
  }
  if (project.status !== "ACTIVE_HEALTHY")
    throw new Error(
      "Project is not ACTIVE_HEALTHY. Wait/check dashboard; no automatic paid restore or upgrade.",
    );
  console.log(
    `Free organization: ${org.name}. Project: ${project.name} (${project.ref || project.id}).`,
  );
  return project.ref || project.id;
}
