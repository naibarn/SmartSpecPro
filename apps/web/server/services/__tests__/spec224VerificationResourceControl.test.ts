import { beforeEach, describe, expect, it } from "vitest";

import {
  buildSpec224VerificationEvidence,
  classifySpec224VerificationExit,
  createSpec224VerificationResourceControl,
  createSpec224VerificationResourceSampler,
  type Spec224VerificationLease,
  type Spec224VerificationLeaseStore,
} from "../spec224VerificationResourceControl";

function memoryLeaseStore(): Spec224VerificationLeaseStore {
  const leases = new Map<string, Spec224VerificationLease>();
  return {
    async acquire(input) {
      const previous = leases.get(input.repositoryKey);
      if (previous && previous.expiresAt > input.now) return null;
      const lease: Spec224VerificationLease = {
        repositoryKey: input.repositoryKey,
        ownerToken: input.ownerToken,
        fencingVersion: (previous?.fencingVersion ?? 0) + 1,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
      };
      leases.set(input.repositoryKey, lease);
      return structuredClone(lease);
    },
    async heartbeat(input) {
      const current = leases.get(input.repositoryKey);
      if (
        !current ||
        current.ownerToken !== input.ownerToken ||
        current.fencingVersion !== input.fencingVersion ||
        current.expiresAt <= input.now
      ) {
        return null;
      }
      const updated = {
        ...current,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
      };
      leases.set(input.repositoryKey, updated);
      return structuredClone(updated);
    },
    async release(input) {
      const current = leases.get(input.repositoryKey);
      if (
        !current ||
        current.ownerToken !== input.ownerToken ||
        current.fencingVersion !== input.fencingVersion
      ) {
        return false;
      }
      leases.set(input.repositoryKey, { ...current, expiresAt: input.now });
      return true;
    },
  };
}

describe("Spec 224 resource-aware verification", () => {
  let store: Spec224VerificationLeaseStore;

  beforeEach(() => {
    store = memoryLeaseStore();
  });

  it("samples cgroup headroom and reports OOM kills since the prior sample", () => {
    let oomKillCount = 2;
    const sample = createSpec224VerificationResourceSampler({
      freeMemoryBytes: () => 8 * 1024 * 1024 * 1024,
      readText(path) {
        if (path.endsWith("memory.current")) return String(6 * 1024 * 1024 * 1024);
        if (path.endsWith("memory.max")) return String(7 * 1024 * 1024 * 1024);
        if (path.endsWith("memory.events")) return `oom_kill ${oomKillCount}`;
        throw new Error("missing cgroup file");
      },
    });
    const now = new Date("2026-10-03T01:00:00.000Z");
    expect(sample(now)).toMatchObject({ availableMemoryMiB: 1024, observedAt: now });
    oomKillCount += 1;
    expect(sample(new Date(now.getTime() + 1000))).toMatchObject({
      availableMemoryMiB: 1024,
      cgroupOomKillDelta: 1,
    });
  });

  it.each([
    [{ exitCode: 137 }, "RESOURCE_BLOCKED"],
    [{ signal: "SIGKILL" }, "RESOURCE_BLOCKED"],
    [{ exitCode: 1, stderr: "FATAL ERROR: Reached heap limit Allocation failed" }, "RESOURCE_BLOCKED"],
    [{ exitCode: 1, oomKillDelta: 1 }, "RESOURCE_BLOCKED"],
    [{ exitCode: 1, stderr: "Expected assertion did not match" }, "CODE_FAILED"],
    [{ exitCode: 1, scope: "baseline" }, "BASELINE_FAILED"],
    [{ exitCode: 0 }, "PASSED"],
  ] as const)("classifies %j as %s", (input, expected) => {
    expect(classifySpec224VerificationExit(input)).toBe(expected);
  });

  it("admits only one concurrent full verification for the same repository", async () => {
    const control = createSpec224VerificationResourceControl(store);
    const now = new Date("2026-10-03T01:00:00.000Z");
    const resource = { availableMemoryMiB: 16_000, observedAt: now };
    const results = await Promise.all([
      control.admit({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-a",
        profile: "full",
        now,
        leaseDurationMs: 60_000,
        resource,
      }),
      control.admit({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-b",
        profile: "full",
        now,
        leaseDurationMs: 60_000,
        resource,
      }),
    ]);

    expect(results.map(result => result.state).sort()).toEqual([
      "ADMITTED",
      "QUEUED_RESOURCE",
    ]);
  });

  it("reclaims an expired full-verification lease and fences its former owner", async () => {
    const control = createSpec224VerificationResourceControl(store);
    const now = new Date("2026-10-03T01:00:00.000Z");
    const resource = { availableMemoryMiB: 16_000, observedAt: now };
    const first = await control.admit({
      repositoryIdentity: "git:smartspecpro",
      ownerToken: "owner-old",
      profile: "full",
      now,
      leaseDurationMs: 1000,
      resource,
    });
    const reclaimed = await control.admit({
      repositoryIdentity: "git:smartspecpro",
      ownerToken: "owner-new",
      profile: "full",
      now: new Date(now.getTime() + 1001),
      leaseDurationMs: 1000,
      resource: {
        availableMemoryMiB: 16_000,
        observedAt: new Date(now.getTime() + 1001),
      },
    });

    expect(first.state).toBe("ADMITTED");
    expect(reclaimed.state).toBe("ADMITTED");
    if (first.state !== "ADMITTED" || reclaimed.state !== "ADMITTED") return;
    expect(reclaimed.lease.fencingVersion).toBe(
      first.lease.fencingVersion + 1
    );
    await expect(
      control.heartbeat({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-old",
        fencingVersion: first.lease.fencingVersion,
        now: new Date(now.getTime() + 1100),
        leaseDurationMs: 1000,
      })
    ).resolves.toBeNull();
    await expect(
      control.release({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-old",
        fencingVersion: first.lease.fencingVersion,
        now: new Date(now.getTime() + 1100),
      })
    ).resolves.toBe(false);
  });

  it("does not let a full-verification lease block an unrelated scoped check", async () => {
    const control = createSpec224VerificationResourceControl(store);
    const now = new Date("2026-10-03T01:00:00.000Z");
    const resource = { availableMemoryMiB: 16_000, observedAt: now };
    await control.admit({
      repositoryIdentity: "git:smartspecpro",
      ownerToken: "owner-full",
      profile: "full",
      now,
      leaseDurationMs: 60_000,
      resource,
    });

    await expect(
      control.admit({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-package",
        profile: "package",
        now,
        leaseDurationMs: 60_000,
        resource,
      })
    ).resolves.toMatchObject({ state: "ADMITTED", lease: null });
  });

  it("queues full verification when measured headroom is insufficient", async () => {
    const control = createSpec224VerificationResourceControl(store);
    const now = new Date("2026-10-03T01:00:00.000Z");
    await expect(
      control.admit({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-a",
        profile: "full",
        now,
        leaseDurationMs: 60_000,
        resource: { availableMemoryMiB: 2048, observedAt: now },
      })
    ).resolves.toMatchObject({
      state: "QUEUED_RESOURCE",
      reason: "INSUFFICIENT_MEMORY_HEADROOM",
    });
  });

  it("fails closed for stale or missing samples on memory-heavy profiles", async () => {
    const control = createSpec224VerificationResourceControl(store);
    const now = new Date("2026-10-03T01:00:00.000Z");
    await expect(
      control.admit({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-a",
        profile: "package",
        now,
        leaseDurationMs: 60_000,
        resource: { availableMemoryMiB: 16_000, observedAt: new Date(now.getTime() - 60_001) },
      })
    ).resolves.toMatchObject({ state: "QUEUED_RESOURCE", reason: "RESOURCE_SAMPLE_UNAVAILABLE" });
    await expect(
      control.admit({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-b",
        profile: "integration",
        now,
        leaseDurationMs: 60_000,
        resource: { availableMemoryMiB: null, observedAt: now },
      })
    ).resolves.toMatchObject({ state: "QUEUED_RESOURCE", reason: "RESOURCE_SAMPLE_UNAVAILABLE" });
  });

  it("queues a memory-heavy profile after a cgroup OOM kill", async () => {
    const control = createSpec224VerificationResourceControl(store);
    const now = new Date("2026-10-03T01:00:00.000Z");
    await expect(
      control.admit({
        repositoryIdentity: "git:smartspecpro",
        ownerToken: "owner-a",
        profile: "integration",
        now,
        leaseDurationMs: 60_000,
        resource: { availableMemoryMiB: 16_000, observedAt: now, cgroupOomKillDelta: 1 },
      })
    ).resolves.toMatchObject({ state: "QUEUED_RESOURCE", reason: "RECENT_OOM_KILL" });
  });

  it("builds a reproducible evidence bundle without including raw secrets", () => {
    const bundle = buildSpec224VerificationEvidence({
      repositoryIdentity: "git:smartspecpro",
      revision: "a".repeat(40),
      profile: "package",
      command: {
        executable: "pnpm",
        args: ["--filter", "@smartspec/web", "test", "--api-key=secret-value", "--token", "another-secret"],
      },
      scope: ["apps/web/server/services/spec224VerificationResourceControl.ts"],
      startedAt: "2026-10-03T01:00:00.000Z",
      finishedAt: "2026-10-03T01:00:01.000Z",
      result: "CODE_FAILED",
      exitCode: 1,
      resource: { availableMemoryMiB: 8192, observedAt: "2026-10-03T01:00:00.000Z" },
    });
    expect(bundle).toMatchObject({
      schemaVersion: "spec224.verification-evidence.v1",
      result: "CODE_FAILED",
      command: { executable: "pnpm" },
    });
    expect(JSON.stringify(bundle)).not.toContain("secret-value");
    expect(JSON.stringify(bundle)).not.toContain("another-secret");
    expect(bundle.command.args).toContain("--token");
    expect(bundle.command.args.at(-1)).toBe("[REDACTED]");
  });
});
