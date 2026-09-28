import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createSpec224ExecutionProfile,
  serializeSpec224ExecutionProfile,
  SPEC224_RECOVERY_RUNNER_PROFILE,
  verifySpec224ExecutionProfile,
} from "../spec224ExecutionProfile";

describe("Spec 224 execution profile", () => {
  it("pins the non-production Recovery/Runner workload to an exact source revision", () => {
    expect(verifySpec224ExecutionProfile(SPEC224_RECOVERY_RUNNER_PROFILE)).toBe(true);
    expect(SPEC224_RECOVERY_RUNNER_PROFILE.profileDigest).toBe("704f47ce8c9b85bf9314c31dd080750745d7441104accfa54e03a6750f24b52f");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE.repository).toEqual({
      sourceCommit: "08895596129d3168bb944387d76bf86b4a9b180c",
      gitTree: "ac3ee49fae33d5fba2c54aa81396950710afb88c",
    });
    expect(SPEC224_RECOVERY_RUNNER_PROFILE.storageClass).toBe("non-production-immutable-test-fixture");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE.dynamicImports.unresolvedBehavior).toBe("fail-closed");
  });

  it("serializes object keys deterministically without changing ordered lists", () => {
    const { profileDigest: _digest, ...base } = SPEC224_RECOVERY_RUNNER_PROFILE;
    const reordered = {
      protectedOperations: [...base.protectedOperations],
      ...Object.fromEntries(Object.entries(base).reverse()),
    } as typeof base;
    const serialized = serializeSpec224ExecutionProfile(SPEC224_RECOVERY_RUNNER_PROFILE);
    expect(createSpec224ExecutionProfile(reordered).profileDigest).toBe(SPEC224_RECOVERY_RUNNER_PROFILE.profileDigest);
    expect(serialized).toContain(`"profileDigest":"${SPEC224_RECOVERY_RUNNER_PROFILE.profileDigest}"`);
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("matches the checked-in immutable profile manifest", async () => {
    const manifest = await readFile(
      join(process.cwd(), "server/services/profiles/spec224-recovery-registered-runner-nonprod.v1.json"),
      "utf8",
    );
    expect(manifest).toBe(serializeSpec224ExecutionProfile(SPEC224_RECOVERY_RUNNER_PROFILE));
  });

  it("rejects mutation after the profile digest is frozen", () => {
    const tampered = {
      ...SPEC224_RECOVERY_RUNNER_PROFILE,
      runtime: { ...SPEC224_RECOVERY_RUNNER_PROFILE.runtime, python: "3.14.0" },
    };
    expect(verifySpec224ExecutionProfile(tampered)).toBe(false);
    expect(() => serializeSpec224ExecutionProfile(tampered)).toThrow("SPEC224_EXECUTION_PROFILE_DIGEST_MISMATCH");
  });

  it("rejects incomplete runtime profile inputs", () => {
    const { profileDigest: _digest, ...base } = SPEC224_RECOVERY_RUNNER_PROFILE;
    expect(() => createSpec224ExecutionProfile({
      ...base,
      entrypoints: { node: [], python: [], rust: [] },
    })).toThrow("SPEC224_EXECUTION_PROFILE_INVALID:entrypoints");
  });
});
