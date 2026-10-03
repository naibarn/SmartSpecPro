import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSpec224VerificationCommand, runSpec224Verification } from "./spec224-verification-runner.mjs";

const NOW = new Date("2026-10-03T00:00:00.000Z");
const RESOURCE = { availableMemoryMiB: 12_000, observedAt: NOW, cgroupOomKillDelta: 0 };

test("quick profile accepts only existing test files and runs Vitest serially", () => {
  const command = resolveSpec224VerificationCommand("quick", ["server/services/__tests__/spec224VerificationResourceControl.test.ts"]);
  assert.equal(command.state, "EXECUTABLE");
  assert.equal(command.requiredMemoryMiB, 512);
  assert.deepEqual(command.args.slice(0, 6), ["exec", "vitest", "run", "--pool=forks", "--maxWorkers=1", "--minWorkers=1"]);
  assert.throws(() => resolveSpec224VerificationCommand("quick", ["../../package.json"]), /SCOPE_INVALID/);
  assert.throws(() => resolveSpec224VerificationCommand("quick", []), /QUICK_SCOPE_REQUIRED/);
});

test("package profile raises memory admission for apps/web's configured 8 GiB TypeScript heap", () => {
  const command = resolveSpec224VerificationCommand("package", ["apps/web"]);
  assert.deepEqual(command.args, ["run", "check"]);
  assert.equal(command.requiredMemoryMiB, 10_240);
  assert.throws(() => resolveSpec224VerificationCommand("package", ["apps/cloudflare"]), /PACKAGE_UNSUPPORTED/);
});

test("integration profile selects the repository's bounded database integration script", () => {
  const command = resolveSpec224VerificationCommand("integration", []);
  assert.deepEqual(command.args, ["run", "test:db-integration", "--", "--pool=forks", "--maxWorkers=1", "--minWorkers=1"]);
  assert.equal(command.requiredMemoryMiB, 6_144);
});

test("full profile requires the canonical queue and never reaches admission or spawn locally", async () => {
  let spawned = false;
  let admitted = false;
  const result = await runSpec224Verification({
    profile: "full",
    admit: async () => { admitted = true; throw new Error("must not admit locally"); },
    spawnProcess: async () => { spawned = true; return { exitCode: 0, signal: null }; },
  });
  assert.equal(result.state, "QUEUE_REQUIRED");
  assert.equal(result.reason, "FULL_REQUIRES_CANONICAL_WORKER_QUEUE");
  assert.equal(spawned, false);
  assert.equal(admitted, false);
});

test("resource-blocked admission returns before the child process is spawned", async () => {
  let spawned = false;
  let admissionInput;
  const result = await runSpec224Verification({
    profile: "package",
    now: NOW,
    sampleResource: () => RESOURCE,
    admit: async input => {
      admissionInput = input;
      return { state: "QUEUED_RESOURCE", reason: "INSUFFICIENT_MEMORY_HEADROOM", requiredMemoryMiB: 10_240 };
    },
    spawnProcess: async () => { spawned = true; return { exitCode: 0, signal: null }; },
  });
  assert.equal(admissionInput.requiredMemoryMiB, 10_240);
  assert.equal(result.state, "QUEUED_RESOURCE");
  assert.equal(spawned, false);
});

test("admitted quick profile records exact scope and classifies its exit", async () => {
  const result = await runSpec224Verification({
    profile: "quick",
    scopes: ["server/services/__tests__/spec224VerificationResourceControl.test.ts"],
    repositoryRoot: "/repo",
    revision: "abc123",
    now: NOW,
    finishedAt: new Date(NOW.getTime() + 10_000),
    sampleResource: () => RESOURCE,
    admit: async input => ({
      state: "ADMITTED",
      profile: input.profile,
      repositoryKey: "repo:hash",
      lease: null,
      requiredMemoryMiB: input.requiredMemoryMiB,
    }),
    spawnProcess: async (executable, args) => {
      assert.equal(executable, "pnpm");
      assert.ok(args.includes("--maxWorkers=1"));
      return { exitCode: 0, signal: null };
    },
  });
  assert.equal(result.state, "COMPLETED");
  assert.equal(result.evidence.result, "PASSED");
  assert.deepEqual(result.evidence.scope, ["apps/web/server/services/__tests__/spec224VerificationResourceControl.test.ts"]);
});
