import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { issueContinuationGrant } from "../spec224DeveloperFastLaneExecutor";

const temporaryRoots: string[] = [];

async function makeContinuationFixture(scopeExpiresAt: number, maxAttempts = 2) {
  const root = await mkdtemp(path.join(os.tmpdir(), "spec224-continuation-"));
  temporaryRoots.push(root);
  const runId = "12345678-90ab-cdef-1234-567890abcdef";
  const evidenceRoot = path.join(root, "evidence");
  const evidenceDir = path.join(evidenceRoot, runId);
  await mkdir(evidenceDir, { recursive: true });
  const binding = {
    contractVersion: "developer-fast-lane-v1" as const,
    runId,
    workerJobId: "job-1",
    tenantId: "tenant-1",
    actorId: 42,
    request: {
      developerLogin: "developer",
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      task: "Continue within the original scope",
      allowedFiles: ["src/main.py"],
      writableFiles: ["src/main.py"],
      tests: { runner: "pytest" as const, cwd: ".", paths: ["src/main.py"] },
      acceptanceCriteria: ["Retain the original source baseline"],
      budget: { maxAttempts, implementationMaxTurns: 2, planMaxTurns: 1, reviewMaxTurns: 1 },
      scopeTtlSeconds: 3600,
    },
  };
  const canonicalJobBinding = {
    jobId: binding.workerJobId,
    runId,
    tenantId: binding.tenantId,
    actorId: binding.actorId,
    attemptId: "attempt-2",
    fencingVersion: 7,
  };
  const receipt = {
    schema: "developer-local-workunit-authorization.v1",
    taskId: runId,
    workspaceId: "workspace-1",
    sourceSha: binding.request.sourceRevision,
    developerIdentity: { login: "developer", permission: "write" },
    allowedFiles: binding.request.allowedFiles,
    writableFiles: binding.request.writableFiles,
    allowedTools: ["list_files", "read_file", "read_range", "write_file", "patch_file", "run_focused_tests"],
    budget: binding.request.budget,
    scopeExpiresAt: scopeExpiresAt,
    productionAccess: false,
    runnerDispatch: false,
  };
  const receiptBytes = `${JSON.stringify(receipt)}\n`;
  await writeFile(path.join(evidenceDir, "authorization-receipt.json"), receiptBytes);
  await writeFile(path.join(evidenceDir, "contract.json"), JSON.stringify({
    taskId: runId,
    sourceRevision: binding.request.sourceRevision,
    requirementText: binding.request.task,
    workspace: path.resolve("."),
    workspaceId: receipt.workspaceId,
    allowedFiles: binding.request.allowedFiles,
    writableFiles: binding.request.writableFiles,
    patchableFiles: [],
    acceptanceCriteria: binding.request.acceptanceCriteria,
    tests: binding.request.tests,
    budget: binding.request.budget,
    allowedTools: receipt.allowedTools,
    authority: { productionAccess: false, sharedDatabaseWrite: false, runnerDispatch: false },
    scopeExpiresAt,
    canonicalJobBinding,
  }));
  return {
    binding,
    evidenceRoot,
    evidenceDir,
    repositoryRoot: path.resolve("../.."),
    lease: {
      jobId: binding.workerJobId,
      attemptId: canonicalJobBinding.attemptId,
      leaseToken: "test-lease",
      fencingVersion: canonicalJobBinding.fencingVersion,
      expiresAt: new Date("2026-10-16T00:00:00.000Z").toISOString(),
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("SPEC-224 bounded continuation grants", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");

  it("does not issue a grant while the original scope is active", async () => {
    const fixture = await makeContinuationFixture(now.getTime() / 1000 + 1);
    const authorize = vi.fn(async () => {});
    const grant = await issueContinuationGrant({ ...fixture, now, authorize });
    expect(grant).toBeNull();
    expect(authorize).not.toHaveBeenCalled();
  });

  it("issues an authorized bounded grant for an expired scope", async () => {
    const fixture = await makeContinuationFixture(now.getTime() / 1000 - 1);
    const authorize = vi.fn(async () => {});
    const grant = await issueContinuationGrant({ ...fixture, now, authorize });
    expect(grant).toMatchObject({ continuationOrdinal: 1, sourceRevision: fixture.binding.request.sourceRevision });
    expect(authorize).toHaveBeenCalledOnce();
  });

  it("treats the exact expiry boundary as expired", async () => {
    const fixture = await makeContinuationFixture(now.getTime() / 1000);
    const grant = await issueContinuationGrant({ ...fixture, now, authorize: async () => {} });
    expect(grant?.continuationOrdinal).toBe(1);
  });

  it("binds explicitly configured additional turns to the same original receipt and scope", async () => {
    const fixture = await makeContinuationFixture(now.getTime() / 1000 + 1);
    const receipt = await readFile(path.join(fixture.evidenceDir, "authorization-receipt.json"));
    const authorization = {
      jobId: fixture.binding.workerJobId, runId: fixture.binding.runId,
      tenantId: fixture.binding.tenantId, actorId: fixture.binding.actorId,
      workspaceId: "workspace-1", sourceRevision: fixture.binding.request.sourceRevision,
      originalAuthorizationReceiptSha256: createHash("sha256").update(receipt).digest("hex"),
      authorizationReference: "owner-explicit-completion-authorization", expiresAt: new Date(now.getTime() + 7_200_000).toISOString(),
      budget: { maxAttempts: 2, planMaxTurns: 8, implementationMaxTurns: 16, reviewMaxTurns: 8 },
    };
    const authorize = vi.fn(async () => {});
    const grant = await issueContinuationGrant({ ...fixture, now, authorize, budgetAuthorization: authorization });
    expect(authorize).toHaveBeenCalledOnce();
    expect(grant?.budgetAuthorization).toEqual(authorization);
    expect(Date.parse(grant!.scopeExpiresAt) - now.getTime()).toBe(3_600_000);
    expect(await readFile(path.join(fixture.evidenceDir, "authorization-receipt.json"))).toEqual(receipt);
    for (const invalid of [{ ...authorization, actorId: 999 }, { ...authorization, sourceRevision: "b".repeat(40) },
      { ...authorization, budget: { ...authorization.budget, planMaxTurns: 9 } },
      { ...authorization, expiresAt: now.toISOString() }]) {
      await expect(issueContinuationGrant({ ...fixture, now, authorize, budgetAuthorization: invalid }))
        .rejects.toThrow("DEVELOPER_CONTINUATION_BUDGET_AUTHORIZATION_INVALID");
    }
    await expect(issueContinuationGrant({ ...fixture, now, budgetAuthorization: authorization,
      authorize: async () => { throw new Error("DEVELOPER_CONTINUATION_PERMISSION_REQUIRED"); } }))
      .rejects.toThrow("DEVELOPER_CONTINUATION_PERMISSION_REQUIRED");
  });

  it("allows multiple continuations only up to the persisted attempt budget", async () => {
    const fixture = await makeContinuationFixture(now.getTime() / 1000 - 1, 2);
    const first = await issueContinuationGrant({ ...fixture, now, authorize: async () => {} });
    await writeFile(path.join(fixture.evidenceDir, "continuation-receipts.jsonl"), `${JSON.stringify({ continuationId: first?.continuationId })}\n`);
    const second = await issueContinuationGrant({ ...fixture, now, authorize: async () => {} });
    expect(second?.continuationOrdinal).toBe(2);
    await writeFile(path.join(fixture.evidenceDir, "continuation-receipts.jsonl"), `${JSON.stringify({ continuationId: first?.continuationId })}\n${JSON.stringify({ continuationId: second?.continuationId })}\n`);
    await expect(issueContinuationGrant({ ...fixture, now, authorize: async () => {} })).rejects.toThrow("DEVELOPER_CONTINUATION_ALLOWANCE_EXHAUSTED");
    expect((await readFile(path.join(fixture.evidenceDir, "authorization-receipt.json"), "utf8")).trim()).toContain("developer-local-workunit-authorization.v1");
  });
});
