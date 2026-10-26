import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({ job: null as any, intent: null as any, checkpoint: null as any }));
vi.mock("./crypto", () => ({ decrypt: (value: string) => value }));
import { readCompensatedHttpRuntime } from "./cloudflareHttpRuntimeContinuation";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest } from "./cloudflareApplicationDatabaseRole";
import { HTTP_RUNTIME_CONTRACT, HTTP_RUNTIME_JOB } from "./cloudflareHttpRuntimeContract";
const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17 };
const candidateJobId = "22222222-2222-4222-8222-222222222222", id = "11111111-1111-4111-8111-111111111111";
function db() { let read = 0; return { select: () => ({ from: () => ({ where: () => {
  const rows = ++read === 1 ? state.job ? [state.job] : [] : read === 2 ? [state.intent] : [state.checkpoint];
  return { orderBy: () => ({ limit: async () => rows }), limit: async () => rows };
} }) }) } as any; }
beforeEach(() => {
  const rolePlan = { ...scope, databaseName: "fixture", tables: ["users"], sequences: [], connectionLimit: 10 as const,
    expiresAt: "2026-01-01T00:00:00Z" }; delete (rolePlan as any).actorUserId;
  const plan = { candidateJobId, candidate: { imageSourceSha: "a".repeat(40), versionId: candidateJobId },
    workerSourceSha: "b".repeat(40), relations: { tables: rolePlan.tables, sequences: [] } };
  const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  state.job = { id, ...scope, requestedByUserId: 17, jobType: HTTP_RUNTIME_JOB, contractVersion: HTTP_RUNTIME_CONTRACT,
    status: "failed", finishedAt: new Date(), leaseExpiresAt: null, operatorReviewRequired: false, inputJson: { candidateJobId, planDigest } };
  state.intent = { updatedBy: 17, valueJson: { ...scope, submissionId: id, plan, planDigest, expiresAt: "2026-01-01T00:00:00Z",
    authority: "existing-candidate-bounded-runtime-test-v1", revokedAt: null, trafficMutation: false, dnsMutation: false,
    imagePublication: false, applicationCreation: false, fixtureCreation: false } };
  state.checkpoint = { updatedBy: 17, isSensitive: true, value: JSON.stringify({ ...scope, jobId: id, planDigest, stage: "FAILED", rolePrepared: true,
    rolePlan, roleSecret: { role: applicationDatabaseRoleName(scope), password: "never-expose-prior-password", planDigest: applicationDatabaseRolePlanDigest(rolePlan) },
    cleanup: { nodeStopped: true, pythonStopped: true, candidateRestored: true, roleLoginRevoked: true, m2Preserved: true,
      candidateDeploymentId: candidateJobId, candidateVersionId: candidateJobId } }) };
});
describe("read-only compensated Candidate continuation evidence", () => {
  it("returns exact historical baseline without renewing an expired intent or exposing the old password", async () => {
    const result = await readCompensatedHttpRuntime(db(), scope, candidateJobId);
    expect(result).toMatchObject({ jobId: id, restoredBaseline: { versionId: candidateJobId } });
    expect(JSON.stringify(result)).not.toMatch(/password|authority|grant|expiresAt.*2099/);
  });
  it.each(["running", "lease", "review", "unfinished", "wrong-candidate", "foreign-owner", "foreign-tenant", "bad-digest", "missing-checkpoint", "uncertain-cleanup", "wrong-role", "wrong-relations"])("rejects %s", async mode => {
    if (mode === "running") state.job.status = "running";
    if (mode === "lease") state.job.leaseExpiresAt = new Date();
    if (mode === "review") state.job.operatorReviewRequired = true;
    if (mode === "unfinished") state.job.finishedAt = null;
    if (mode === "wrong-candidate") state.job.inputJson.candidateJobId = id;
    if (mode === "foreign-owner") state.intent.updatedBy = 18;
    if (mode === "foreign-tenant") state.intent.valueJson.tenantId = "foreign";
    if (mode === "bad-digest") state.intent.valueJson.plan.workerSourceSha = "f".repeat(40);
    if (mode === "missing-checkpoint") state.checkpoint.value = null;
    if (["uncertain-cleanup", "wrong-role", "wrong-relations"].includes(mode)) {
      const value = JSON.parse(state.checkpoint.value);
      if (mode === "uncertain-cleanup") value.cleanup.nodeStopped = false;
      if (mode === "wrong-role") value.roleSecret.role = "foreign";
      if (mode === "wrong-relations") value.rolePlan.tables.push("tenants");
      state.checkpoint.value = JSON.stringify(value);
    }
    await expect(readCompensatedHttpRuntime(db(), scope, candidateJobId)).rejects.toThrow("RECONCILE_REQUIRED");
  });
});
