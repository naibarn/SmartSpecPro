import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createSpec224ExecutionProfile,
  bindSpec224ExecutionProfileToSource,
  serializeSpec224ExecutionProfile,
  SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE,
  verifySpec224ExecutionProfile,
} from "../spec224ExecutionProfile";

describe("Spec 224 execution profile", () => {
  it("defines the reconciled non-production Recovery/Runner profile template", () => {
    expect(verifySpec224ExecutionProfile(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE)).toBe(true);
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.version).toBe(6);
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.supersedes).toEqual({
      profileId: "spec224-recovery-registered-runner-nonprod",
      version: 5,
      profileDigest: "99c3b6631bda784fd5997203477a887986725f9346c287ecf92a9c143cef9835",
    });
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.runtime.python).toBe("3.12.12");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.runtime.cargo).toBe("cargo 1.94.1");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.rustCompileTimeEnvironment).toEqual({
      CARGO_PKG_VERSION: "0.1.0",
      SAH_RUNNER_BUILD_VERSION: null,
    });
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.npmRegistryUrl).toBe("https://registry.npmjs.org/");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.generatedArtifacts).toHaveLength(2);
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.repository.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.sourceInputs).toContain("apps/web/server/services/jobOutboxPublisher.ts");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.sourceInputs).not.toContain("apps/web/server/services/workerJobOutboxPublisher.ts");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.sourceInputs).not.toContain("python-backend/app/services");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.pythonDependencySelections["python-backend/requirements.txt"]?.test)
      .toEqual([]);
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.externalArtifacts).toContain(
      "python-backend/spec224-admission/uv.lock:resolve-python-3.12-linux-x86_64-artifacts",
    );
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.storageClass).toBe("non-production-immutable-test-fixture");
    expect(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.dynamicImports.unresolvedBehavior).toBe("fail-closed");
  });

  it("serializes object keys deterministically without changing ordered lists", () => {
    const { profileDigest: _digest, ...base } = SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE;
    const reordered = {
      protectedOperations: [...base.protectedOperations],
      ...Object.fromEntries(Object.entries(base).reverse()),
    } as typeof base;
    const serialized = serializeSpec224ExecutionProfile(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE);
    expect(createSpec224ExecutionProfile(reordered).profileDigest).toBe(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.profileDigest);
    expect(serialized).toContain(`"profileDigest":"${SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.profileDigest}"`);
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("retains the original profile manifest as historical evidence", async () => {
    const manifest = await readFile(
      join(process.cwd(), "server/services/profiles/spec224-recovery-registered-runner-nonprod.v1.json"),
      "utf8",
    );
    const historical = JSON.parse(manifest);
    expect(historical.version).toBe(1);
    expect(historical.profileDigest).toBe("704f47ce8c9b85bf9314c31dd080750745d7441104accfa54e03a6750f24b52f");
    expect(historical.repository.sourceCommit).toBe("08895596129d3168bb944387d76bf86b4a9b180c");
  });

  it("recomputes the digest when bound to a frozen source identity", () => {
    const bound = bindSpec224ExecutionProfileToSource(
      SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE,
      "a".repeat(40),
      "b".repeat(40),
    );
    expect(bound.repository).toEqual({ sourceCommit: "a".repeat(40), gitTree: "b".repeat(40) });
    expect(bound.profileDigest).not.toBe(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.profileDigest);
    expect(verifySpec224ExecutionProfile(bound)).toBe(true);
  });

  it("rejects mutation after the profile digest is frozen", () => {
    const tampered = {
      ...SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE,
      runtime: { ...SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.runtime, python: "3.14.0" },
    };
    expect(verifySpec224ExecutionProfile(tampered)).toBe(false);
    expect(() => serializeSpec224ExecutionProfile(tampered)).toThrow("SPEC224_EXECUTION_PROFILE_DIGEST_MISMATCH");
  });

  it("rejects incomplete runtime profile inputs", () => {
    const { profileDigest: _digest, ...base } = SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE;
    expect(() => createSpec224ExecutionProfile({
      ...base,
      entrypoints: { node: [], python: [], rust: [] },
    })).toThrow("SPEC224_EXECUTION_PROFILE_INVALID:entrypoints");
  });

  it("rejects an invalid supersedes reference", () => {
    const { profileDigest: _digest, ...base } = SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE;
    expect(() => createSpec224ExecutionProfile({
      ...base,
      supersedes: { ...base.supersedes!, version: base.version, profileDigest: "x" },
    })).toThrow("SPEC224_EXECUTION_PROFILE_INVALID:supersedes");
  });
});
