import test from "node:test";
import assert from "node:assert/strict";
import {migrationIdentity,assertMigrationHistory,appliedMigration,newlyAppliedFile} from "../tools/migration-history.mjs";
const remote = [{version:"20261021205949",name:"202610210001_cloud_progress"}];
test("applied migration is matched by version despite legacy remote name",()=>{
  assert.equal(appliedMigration("20261021205949_cloud_progress.sql",remote),remote[0]);
  assert.doesNotThrow(()=>assertMigrationHistory(["20261021205949_cloud_progress.sql"],remote));
});
test("remote history mismatch fails closed before applying SQL",()=>{
  assert.throws(()=>assertMigrationHistory(["20261021000100_cloud_progress.sql"],remote),/missing locally/);
  assert.equal(appliedMigration("20261021000100_cloud_progress.sql",remote),undefined);
});
test("filenames must have CLI-compatible timestamps and unique versions",()=>{
  assert.throws(()=>migrationIdentity("202610210001_cloud_progress.sql"),/YYYYMMDDHHMMSS/);
  assert.throws(()=>migrationIdentity("../20261021205949_cloud_progress.sql"));
  assert.throws(()=>assertMigrationHistory(["20261021205949_a.sql","20261021205949_b.sql"],[]),/Duplicate/);
});
test("Management API generated timestamp becomes the local filename",()=>{
  const next=[...remote,{version:"20261024120000",name:"new_feature"}];
  assert.equal(newlyAppliedFile(remote,next,"new_feature"),"20261024120000_new_feature.sql");
  assert.throws(()=>newlyAppliedFile(remote,remote,"new_feature"),/Cannot identify/);
  assert.throws(()=>newlyAppliedFile(remote,[...next,{version:"20261024120001",name:"new_feature"}],"new_feature"),/Cannot identify/);
});
