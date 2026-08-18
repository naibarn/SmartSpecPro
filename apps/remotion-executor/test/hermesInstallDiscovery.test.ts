import test from "node:test";
import assert from "node:assert/strict";
import { discoverHermesInstallations } from "../src/hermesInstallDiscovery.js";

test("discovery uses a closed registry and returns sanitized candidate fields", async () => {
  const candidates = await discoverHermesInstallations();
  assert.ok(Array.isArray(candidates));
  for (const candidate of candidates) {
    assert.ok(["hermes_cli", "hermes_one"].includes(candidate.source));
    assert.equal(candidate.provenance, "known_path");
    assert.equal(typeof candidate.root, "string");
  }
});
