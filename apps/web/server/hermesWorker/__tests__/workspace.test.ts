/**
 * Feature 135 — Hermes Grok media worker (section 07): `workspace.ts` unit
 * tests. Real filesystem via `mkdtemp` roots, injected clock/statfs — no
 * network/DB.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWorkspaceManager } from "../workspace";

describe("createWorkspaceManager", () => {
  let root: string;
  let currentTime: number;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-ws-"));
    currentTime = Date.now();
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function clock() {
    return new Date(currentTime);
  }

  it("creates the input/output/manifest/logs/tmp directory tree", async () => {
    const manager = createWorkspaceManager({ root, clock });
    const workspace = await manager.create("job-1");
    for (const dir of [workspace.inputDir, workspace.outputDir, workspace.manifestDir, workspace.logsDir, workspace.tmpDir]) {
      await expect(fs.access(dir)).resolves.toBeUndefined();
    }
  });

  it("settleCompleted deletes the workspace immediately", async () => {
    const manager = createWorkspaceManager({ root, clock });
    const workspace = await manager.create("job-2");
    await manager.settleCompleted("job-2");
    await expect(fs.access(workspace.root)).rejects.toThrow();
  });

  it("settleFailed retains the workspace, then sweep() evicts it after 72h", async () => {
    const manager = createWorkspaceManager({ root, clock, failedRetentionMs: 72 * 60 * 60 * 1000 });
    const workspace = await manager.create("job-3");
    await manager.settleFailed("job-3");
    await expect(fs.access(workspace.root)).resolves.toBeUndefined();

    // Not yet 72h — sweep must NOT evict.
    currentTime += 71 * 60 * 60 * 1000;
    await manager.sweep();
    await expect(fs.access(workspace.root)).resolves.toBeUndefined();

    // Past 72h — sweep evicts.
    currentTime += 2 * 60 * 60 * 1000;
    const result = await manager.sweep();
    expect(result.evictedFailed).toContain("job-3");
    await expect(fs.access(workspace.root)).rejects.toThrow();
  });

  it("rotates log files older than 14 days", async () => {
    const manager = createWorkspaceManager({ root, clock, logsRetentionMs: 14 * 24 * 60 * 60 * 1000 });
    const workspace = await manager.create("job-4");
    const staleLog = path.join(workspace.logsDir, "old.log");
    const freshLog = path.join(workspace.logsDir, "new.log");
    await fs.writeFile(staleLog, "old");
    await fs.writeFile(freshLog, "new");
    const staleTime = new Date(currentTime - 15 * 24 * 60 * 60 * 1000);
    await fs.utimes(staleLog, staleTime, staleTime);

    const result = await manager.sweep();
    expect(result.rotatedLogs).toContain(staleLog);
    await expect(fs.access(staleLog)).rejects.toThrow();
    await expect(fs.access(freshLog)).resolves.toBeUndefined();
  });

  it("evicts the oldest terminal (failed) workspace first under disk pressure, never touching active workspaces", async () => {
    let free = 10 * 1024 * 1024 * 1024; // plenty of room initially
    const statfsImpl = async () => ({ bavail: free, bsize: 1 });

    const manager = createWorkspaceManager({
      root,
      clock,
      diskPressureThresholdBytes: 5 * 1024 * 1024 * 1024,
      statfsImpl,
    });

    const active = await manager.create("job-active");
    const olderFailed = await manager.create("job-older-failed");
    currentTime += 1000;
    await manager.settleFailed("job-older-failed");
    const newerFailed = await manager.create("job-newer-failed");
    currentTime += 1000;
    await manager.settleFailed("job-newer-failed");

    // Now simulate disk pressure — below threshold, and (since this fake
    // probe doesn't model reclaimed space) it STAYS below threshold for the
    // rest of this sweep, so eviction proceeds through every terminal
    // candidate — oldest first, active never touched.
    free = 1 * 1024 * 1024 * 1024;

    const result = await manager.sweep();
    expect(result.evictedForDiskPressure).toEqual(["job-older-failed", "job-newer-failed"]);
    await expect(fs.access(olderFailed.root)).rejects.toThrow();
    await expect(fs.access(newerFailed.root)).rejects.toThrow();
    await expect(fs.access(active.root)).resolves.toBeUndefined();
  });

  it("exposes freeDiskBytes computed from the injected statfs probe", async () => {
    const manager = createWorkspaceManager({
      root,
      clock,
      statfsImpl: async () => ({ bavail: 1000, bsize: 4096 }),
    });
    expect(await manager.freeDiskBytes()).toBe(1000 * 4096);
  });
});
