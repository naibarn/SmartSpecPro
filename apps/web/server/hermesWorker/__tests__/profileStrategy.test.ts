/**
 * Feature 135 — Hermes Grok media worker (section 07): `hermesInstallation.ts`
 * `ProfileStrategy` + isolation/flag-composition probe unit tests.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createNativeProfileStrategy,
  createPerConnectionHomeStrategy,
  provisionHermes,
  runHermesFlagCompositionProbe,
  runHermesProfileIsolationProbe,
  type HermesProbeSpawnResult,
} from "../hermesInstallation";
import { collectOutputs, HermesOutputError } from "../outputCollector";

describe("runHermesProfileIsolationProbe", () => {
  it("reports isolated=true when profile B never sees profile A's auth state", async () => {
    const spawnHermes = async (args: string[]): Promise<HermesProbeSpawnResult> => {
      if (args.includes("status")) return { exitCode: 0, stdout: "Status: not authenticated", stderr: "" };
      return { exitCode: 0, stdout: "Authorization approved.", stderr: "" };
    };
    const result = await runHermesProfileIsolationProbe({ spawnHermes });
    expect(result.isolated).toBe(true);
  });

  it("reports isolated=false when profile B leaks profile A's auth state", async () => {
    const spawnHermes = async (args: string[]): Promise<HermesProbeSpawnResult> => {
      if (args.includes("status")) return { exitCode: 0, stdout: "Status: authenticated\nAccount: leaked@example.com", stderr: "" };
      return { exitCode: 0, stdout: "Authorization approved.", stderr: "" };
    };
    const result = await runHermesProfileIsolationProbe({ spawnHermes });
    expect(result.isolated).toBe(false);
  });

  it("falls back when the installed Hermes CLI rejects the legacy global -p flag", async () => {
    const spawnHermes = async (): Promise<HermesProbeSpawnResult> => ({
      exitCode: 2,
      stdout: "",
      stderr: "hermes: error: argument command: invalid choice: '__probe_a'",
    });

    const result = await runHermesProfileIsolationProbe({ spawnHermes });

    expect(result.isolated).toBe(false);
  });
});

describe("runHermesFlagCompositionProbe", () => {
  it("selects print_mode when -z composes cleanly", async () => {
    const spawnHermes = async (): Promise<HermesProbeSpawnResult> => ({ exitCode: 0, stdout: "", stderr: "" });
    const result = await runHermesFlagCompositionProbe({ spawnHermes });
    expect(result.template).toBe("print_mode");
  });

  it("selects chat_fallback when -z does not compose with --provider/--toolsets/-p", async () => {
    const spawnHermes = async (): Promise<HermesProbeSpawnResult> => ({
      exitCode: 2,
      stdout: "",
      stderr: "error: unrecognized argument '-z'",
    });
    const result = await runHermesFlagCompositionProbe({ spawnHermes });
    expect(result.template).toBe("chat_fallback");
  });
});

describe("provisionHermes", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-install-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("selects the native profile strategy when isolation holds", async () => {
    const spawnHermes = async (args: string[]): Promise<HermesProbeSpawnResult> => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.18.2", stderr: "" };
      if (args.includes("status")) return { exitCode: 0, stdout: "Status: not authenticated", stderr: "" };
      return { exitCode: 0, stdout: "ok", stderr: "" };
    };
    const result = await provisionHermes({ hermesHomeRoot: root, expectedVersion: "0.18.2" }, { spawnHermes });
    expect(result.strategy.kind).toBe("native_profile");
    expect(result.doctorOk).toBe(true);
    expect(result.version).toBe("0.18.2");
  });

  it("falls back to the per-connection HERMES_HOME strategy when isolation fails", async () => {
    const spawnHermes = async (args: string[]): Promise<HermesProbeSpawnResult> => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.18.2", stderr: "" };
      if (args.includes("status")) return { exitCode: 0, stdout: "Status: authenticated", stderr: "" };
      return { exitCode: 0, stdout: "ok", stderr: "" };
    };
    const result = await provisionHermes({ hermesHomeRoot: root, expectedVersion: "0.18.2" }, { spawnHermes });
    expect(result.strategy.kind).toBe("per_connection_home");
  });

  it("uses per-connection HERMES_HOME with the real 0.18.2 invalid-choice response", async () => {
    const spawnHermes = async (args: string[]): Promise<HermesProbeSpawnResult> => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.18.2", stderr: "" };
      if (args[0] === "-p") {
        return {
          exitCode: 2,
          stdout: "",
          stderr: "hermes: error: argument command: invalid choice: '__probe_a'",
        };
      }
      return { exitCode: 1, stdout: "", stderr: "provider not configured" };
    };

    const result = await provisionHermes(
      { hermesHomeRoot: root, expectedVersion: "0.18.2" },
      { spawnHermes },
    );

    expect(result.strategy.kind).toBe("per_connection_home");
    expect(result.doctorOk).toBe(true);
  });
});

describe.each([
  ["native_profile", createNativeProfileStrategy],
  ["per_connection_home", createPerConnectionHomeStrategy],
] as const)("%s ProfileStrategy", (_label, factory) => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-profile-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("produces profile paths strictly under the root — no traversal", async () => {
    const strategy = factory({ root });
    const handle = await strategy.ensureProfile({ tenantId: "tenant1", connectionId: "conn1" });
    const resolvedRoot = path.resolve(root);
    expect(path.resolve(handle.homeDir).startsWith(resolvedRoot + path.sep)).toBe(true);
    expect(path.resolve(handle.locksDir).startsWith(resolvedRoot + path.sep)).toBe(true);
    expect(await fs.readFile(path.join(handle.homeDir, "config.yaml"), "utf-8")).toContain(
      "provider: xai",
    );
  });

  it("rejects a tenantId/connectionId containing path traversal characters", async () => {
    const strategy = factory({ root });
    await expect(strategy.ensureProfile({ tenantId: "../escape", connectionId: "conn1" })).rejects.toThrow();
    await expect(strategy.ensureProfile({ tenantId: "tenant1", connectionId: "../../etc" })).rejects.toThrow();
  });

  it("removeProfile deletes only within the root and never throws for a normal profile", async () => {
    const strategy = factory({ root });
    const handle = await strategy.ensureProfile({ tenantId: "tenant1", connectionId: "conn1" });
    await fs.access(handle.homeDir);
    await strategy.removeProfile({ tenantId: "tenant1", connectionId: "conn1" });
    await expect(fs.access(handle.homeDir)).rejects.toThrow();
  });
});

describe("workspace/profile disjointness guard", () => {
  it("keeps workspace and profile roots structurally disjoint by construction", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-disjoint-"));
    const profileRoot = path.join(base, "profiles");
    const workspaceRoot = path.join(base, "jobs");
    await fs.mkdir(profileRoot, { recursive: true });
    await fs.mkdir(workspaceRoot, { recursive: true });

    expect(profileRoot).not.toBe(workspaceRoot);
    expect(workspaceRoot.startsWith(profileRoot)).toBe(false);
    expect(profileRoot.startsWith(workspaceRoot)).toBe(false);

    await fs.rm(base, { recursive: true, force: true });
  });

  it("output-collection path confinement rejects a path under a DIFFERENT connection's profile directory", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-disjoint-"));
    const profileRoot = path.join(base, "profiles");
    const workspaceRoot = path.join(base, "jobs");
    await fs.mkdir(profileRoot, { recursive: true });
    await fs.mkdir(workspaceRoot, { recursive: true });

    const strategy = createNativeProfileStrategy({ root: profileRoot });
    // A different connection's profile than the one running this job.
    const otherConnectionProfile = await strategy.ensureProfile({ tenantId: "tenant1", connectionId: "other-conn" });
    const leaked = path.join(otherConnectionProfile.homeDir, "leaked.png");
    await fs.writeFile(leaked, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));

    const outputDir = path.join(workspaceRoot, "output");
    const tmpDir = path.join(workspaceRoot, "tmp");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const stdout = `SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["${leaked}"]} SMARTSPECPRO_RESULT_END`;

    await expect(
      collectOutputs({
        invocation: { stdout },
        workspace: { outputDir, tmpDir },
        cacheDirs: [],
        forbiddenRoots: [profileRoot],
        jobWindow: { startedAt: new Date(Date.now() - 1000), endedAt: new Date(Date.now() + 1000) },
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toThrow(HermesOutputError);

    await fs.rm(base, { recursive: true, force: true });
  });
});
