import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSpec224VerificationResourceControl } from "./spec224VerificationResourceControl.ts";
import { buildSpec224FullVerificationJobDefinition } from "./spec224VerificationJob.ts";
import { POSTGRES_NODE_JOB_TYPES } from "../jobs/feature186JobTypes.ts";

test("assessment checks full-profile headroom without acquiring a lease", async () => {
  let acquireCalls = 0;
  const control = createSpec224VerificationResourceControl({
    async acquire() { acquireCalls += 1; return null; },
    async heartbeat() { return null; },
    async release() { return false; },
  });
  const now = new Date("2026-10-03T00:00:00.000Z");

  const result = await control.assess({
    repositoryIdentity: "repo-a",
    profile: "full",
    now,
    resource: { availableMemoryMiB: 12_000, observedAt: now },
  });

  assert.equal(result.state, "ADMITTED");
  assert.equal(result.lease, null);
  assert.equal(acquireCalls, 0);
});

test("assessment reports resource blocks without acquiring a lease", async () => {
  let acquireCalls = 0;
  const control = createSpec224VerificationResourceControl({
    async acquire() { acquireCalls += 1; return null; },
    async heartbeat() { return null; },
    async release() { return false; },
  });
  const now = new Date("2026-10-03T00:00:00.000Z");

  const result = await control.assess({
    repositoryIdentity: "repo-a",
    profile: "full",
    now,
    resource: { availableMemoryMiB: 1_024, observedAt: now },
  });

  assert.equal(result.state, "QUEUED_RESOURCE");
  assert.equal(result.reason, "INSUFFICIENT_MEMORY_HEADROOM");
  assert.equal(acquireCalls, 0);
});

test("admit still acquires the full-profile lease after a successful assessment", async () => {
  let acquireCalls = 0;
  const control = createSpec224VerificationResourceControl({
    async acquire(input) {
      acquireCalls += 1;
      return {
        repositoryKey: input.repositoryKey,
        ownerToken: input.ownerToken,
        fencingVersion: 1,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
      };
    },
    async heartbeat() { return null; },
    async release() { return false; },
  });
  const now = new Date("2026-10-03T00:00:00.000Z");
  const result = await control.admit({
    repositoryIdentity: "repo-a",
    ownerToken: "worker-1",
    profile: "full",
    now,
    leaseDurationMs: 30_000,
    resource: { availableMemoryMiB: 12_000, observedAt: now },
  });

  assert.equal(result.state, "ADMITTED");
  assert.equal(result.lease?.fencingVersion, 1);
  assert.equal(acquireCalls, 1);
});

test("full verification is registered in the canonical Node worker", () => {
  const registry = readFileSync(new URL("./jobExecutorRegistry.ts", import.meta.url), "utf8");
  assert.match(registry, /jobType:\s*SPEC224_FULL_VERIFICATION_JOB_TYPE[\s\S]*?executor:\s*executeSpec224FullVerification/);
  assert.equal(POSTGRES_NODE_JOB_TYPES.has("spec224.verification.full"), true);
});

test("the full-verification job builder emits a canonical-safe worker definition", () => {
  const definition = buildSpec224FullVerificationJobDefinition({
    tenantId: "tenant-acme",
    actorId: 42,
    runId: "run-224-is-a-stable-test-id",
    expectedRevision: 1,
    expectedFencingVersion: 0,
    admissionEventKey: `spec224-full:${"a".repeat(64)}`,
  });

  assert.ok(definition.contractVersion.length <= 40);
  assert.ok(definition.tenantId.length <= 36);
  assert.ok(definition.jobType.length <= 100);
  assert.equal(definition.executionClass, "long");
  assert.ok(definition.retryPolicy.deadlineMs > 0);
  assert.ok(definition.timeoutPolicy.hardTimeoutMs > 0);
  assert.equal(definition.jobType, "spec224.verification.full");
  assert.equal(definition.retryPolicy.maxAttempts, 1);
  assert.equal(definition.input.profile, "full");
  assert.equal("executable" in definition.input, false);
  assert.equal("args" in definition.input, false);
});
