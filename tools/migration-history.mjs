export function migrationIdentity(file) {
  const match = /^(\d{14})_([a-z_]+)\.sql$/.exec(file);
  if (!match) throw new Error("Migration filename must use YYYYMMDDHHMMSS_name.sql: " + file);
  return { version: match[1], name: match[2] };
}
export function assertMigrationHistory(files, history) {
  const versions = new Set(files.map(file => migrationIdentity(file).version));
  if (versions.size !== files.length) throw new Error("Duplicate local migration version");
  const missing = history.filter(row => !versions.has(row.version)).map(row => row.version);
  if (missing.length) throw new Error("Remote migration versions missing locally: " + missing.join(", ") + ". Align local files before applying SQL.");
}
export function appliedMigration(file, history) {
  const {version} = migrationIdentity(file);
  return history.find(row => row.version === version);
}
export function newlyAppliedFile(previous, current, name) {
  if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid migration name");
  const known = new Set(previous.map(row => row.version));
  const matches = current.filter(row => !known.has(row.version) && row.name === name);
  if (matches.length !== 1 || !/^\d{14}$/.test(matches[0].version))
    throw new Error("Cannot identify the applied migration. Fetch history before retrying; do not reapply SQL.");
  return matches[0].version + "_" + name + ".sql";
}
