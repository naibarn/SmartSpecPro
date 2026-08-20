import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeArchiveListing,
  isSafeArchiveVerboseListing,
  runtimeArchiveCommands,
} from "../src/runtimeProvisioner.js";

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
  assert.equal(isSafeArchiveVerboseListing("Unix file attributes (120777 octal): lrwxrwxrwx"), false);
});

test("uses an archive tool that can actually read ZIP on each supported host", () => {
  const windows = runtimeArchiveCommands("win32");
  assert.equal(windows.list.file, "tar");
  assert.deepEqual(windows.extract.args("C:\\runtime.zip", "C:\\staging"), [
    "-xf", "C:\\runtime.zip", "-C", "C:\\staging",
  ]);

  const macos = runtimeArchiveCommands("darwin");
  assert.equal(macos.list.file, "unzip");
  assert.equal(macos.extract.file, "ditto");

  const linux = runtimeArchiveCommands("linux");
  assert.equal(linux.list.file, "unzip");
  assert.equal(linux.extract.file, "unzip");
});
