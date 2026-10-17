import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createSpec224ExecutionProfile,
  matchesSpec224WindowsRunnerTarget,
  getSpec224ExecutionProfileTemplate,
  SPEC224_WINDOWS_CODEX_PROFILE_TEMPLATE,
  bindSpec224ExecutionProfileToSource,
  serializeSpec224ExecutionProfile,
  SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE,
  verifySpec224ExecutionProfile,
} from "../spec224ExecutionProfile";

describe("Spec 224 execution profile", () => {

  it("separates Windows Codex execution from Linux backend dependencies", () => {
    const profile = SPEC224_WINDOWS_CODEX_PROFILE_TEMPLATE;
    expect(verifySpec224ExecutionProfile(profile)).toBe(true);
    expect(profile.version).toBe(1);
    expect(profile.supersedes).toBeUndefined();
    expect(profile.runtimeRole).toBe("control-plane");
    expect(profile.runtime.platform).toBe("linux");
    expect(profile.runnerTarget).toEqual({
      platform: "windows", architecture: "x86_64", cargoTarget: "x86_64-pc-windows-msvc",
      adapterId: "codex.v1", minimumEngineVersion: "0.2.31", requiredTools: ["git", "codex"],
      workspacePaths: "windows-native", processContainment: "windows-job-object",
    });
    expect(profile.entrypoints.rust).toEqual([]);
    expect(profile.storageClass).toBe("restricted-object-store");
    expect(profile.environment.some(item => item.name === "SPEC224_TEST_RUNNER_TOKEN")).toBe(false);
    expect(profile.externalArtifacts.some(path => path.includes("resolve-linux-x86_64-runtime"))).toBe(false);
    expect(profile.requiredRunnerCapabilities).toEqual(["agent.external_task"]);
    expect(profile).not.toHaveProperty("certified");
    expect(profile).not.toHaveProperty("grantId");
  });

  it("selects only the declared profile without a Linux fallback or shared mutation", () => {
    const windows = getSpec224ExecutionProfileTemplate(SPEC224_WINDOWS_CODEX_PROFILE_TEMPLATE.profileId);
    expect(windows.profileDigest).not.toBe(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.profileDigest);
    expect(getSpec224ExecutionProfileTemplate(SPEC224_RECOVERY_RUNNER_PROFILE_TEMPLATE.profileId).version).toBe(6);
    windows.runtime.python = "modified";
    expect(getSpec224ExecutionProfileTemplate(windows.profileId).runtime.python).toBe("3.12.12");
    expect(() => getSpec224ExecutionProfileTemplate("unreviewed-platform")).toThrow("SPEC224_EXECUTION_PROFILE_UNKNOWN");
    const bound = bindSpec224ExecutionProfileToSource(SPEC224_WINDOWS_CODEX_PROFILE_TEMPLATE, "a".repeat(40), "b".repeat(40));
    expect(bound.runnerTarget?.platform).toBe("windows");
    expect(bound.profileDigest).not.toBe(SPEC224_WINDOWS_CODEX_PROFILE_TEMPLATE.profileDigest);
  });

  it("rejects a mixed desktop/control-plane target or a required unrelated adapter", () => {
    const { profileDigest: _digest, ...base } = SPEC224_WINDOWS_CODEX_PROFILE_TEMPLATE;
    expect(() => createSpec224ExecutionProfile({ ...base, runtimeRole: undefined })).toThrow("runnerTarget");
    expect(() => createSpec224ExecutionProfile({ ...base, entrypoints: { ...base.entrypoints, rust: ["main.rs"] } })).toThrow("runnerTarget");
    expect(() => createSpec224ExecutionProfile({ ...base, runnerTarget: { ...base.runnerTarget!, requiredTools: ["git", "browser"] as any } })).toThrow("runnerTarget");
  });

  it("admits only an observed Windows Codex target and source-bound owned workspace", () => {
    // TEST_ONLY observation; this predicate never certifies a live Runner.
    const expected = { sourceCommit: "a".repeat(40), workspaceRef: "ws-owned" };
    const now = Date.parse("2026-10-17T12:00:00Z");
    const snapshot = {
      platform: { os: "windows", architecture: "x86_64", target: "x86_64-pc-windows-msvc" },
      runnerVersion: "0.2.31", observedAt: "2026-10-17T11:59:00Z", expiresAt: "2026-10-17T12:04:00Z",
      toolInventory: [{ adapterId: "codex.v1", installState: "installed", configurationState: "configured",
        authState: "authenticated", healthState: "healthy", trustState: "ready", availabilityState: "available",
        authorizationEvidenceRef: "TEST_ONLY_REDACTED_REFERENCE" }],
      workspaces: [{ workspaceId: "ws-owned", gitHead: expected.sourceCommit, dirty: false,
        projectId: "TEST_ONLY_PROJECT", repositoryId: "github.com/example/test-only" }],
    };
    expect(matchesSpec224WindowsRunnerTarget(snapshot, expected, now)).toBe(true);
    expect(matchesSpec224WindowsRunnerTarget({ ...snapshot, runnerVersion: "0.10.0" }, expected, now)).toBe(true);
    for (const patch of [
      { runnerVersion: "0.2.30" }, { runnerVersion: "0.1.999" }, { runnerVersion: "unknown" },
      { platform: { ...snapshot.platform, os: "linux" } },
      { platform: { ...snapshot.platform, architecture: "arm64" } },
      { platform: { ...snapshot.platform, target: "x86_64-unknown-linux-gnu" } },
      { observedAt: "2026-10-18T00:00:00Z" }, { expiresAt: "2026-10-17T12:00:00Z" },
      { toolInventory: [{ ...snapshot.toolInventory[0], authorizationEvidenceRef: "" }] },
      { toolInventory: [{ ...snapshot.toolInventory[0], authState: "auth_required" }] },
      { workspaces: [{ ...snapshot.workspaces[0], dirty: true }] },
      { workspaces: [{ ...snapshot.workspaces[0], gitHead: null }] },
      { workspaces: [{ ...snapshot.workspaces[0], repositoryId: null }] },
      { workspaces: [{ ...snapshot.workspaces[0], projectId: "" }] },
    ]) expect(matchesSpec224WindowsRunnerTarget({ ...snapshot, ...patch }, expected, now)).toBe(false);
    expect(matchesSpec224WindowsRunnerTarget(snapshot, { ...expected, workspaceRef: "another-workspace" }, now)).toBe(false);
    expect(matchesSpec224WindowsRunnerTarget(snapshot, { ...expected, sourceCommit: "b".repeat(40) }, now)).toBe(false);
    expect(matchesSpec224WindowsRunnerTarget(null, expected, now)).toBe(false);
  });

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
