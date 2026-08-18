import test from "node:test";
import assert from "node:assert/strict";
import { isSafeArchiveListing, isSafeArchiveVerboseListing } from "../src/runtimeProvisioner.js";

test("rejects absolute and traversal runtime archive entries", () => {
  assert.equal(isSafeArchiveListing("runtime-pack/remotion-sidecar/render.mjs\nruntime-pack/bin/ffmpeg"), true);
  assert.equal(isSafeArchiveListing("runtime-pack/../secrets.txt"), false);
  assert.equal(isSafeArchiveListing("C:/Users/Public/payload"), false);
  assert.equal(isSafeArchiveListing("/etc/passwd"), false);
});

test("rejects symbolic and hard links in runtime archives", () => {
  assert.equal(isSafeArchiveVerboseListing("-rw------- runtime-pack/manifest.json\ndrwx------ runtime-pack"), true);
  assert.equal(isSafeArchiveVerboseListing("lrwxrwxrwx runtime-pack/bin/node -> /usr/bin/node"), false);
  assert.equal(isSafeArchiveVerboseListing("hrw------- runtime-pack/bin/node link to runtime-pack/node"), false);
});
