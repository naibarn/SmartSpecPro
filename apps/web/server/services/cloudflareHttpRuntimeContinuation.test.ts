import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ job: null as any, intent: null as any, checkpoint: null as any, whereClauses: [] as any[] }));
vi.mock("./crypto", () => ({ decrypt: (value: string) => value }));
import { readCompensatedHttpApplicationAcceptance, readCompensatedHttpRuntime } from "./cloudflareHttpRuntimeContinuation";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest } from "./cloudflareApplicationDatabaseRole";
import { HTTP_RUNTIME_CONTRACT, HTTP_RUNTIME_JOB } from "./cloudflareHttpRuntimeContract";
const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 17 };
const candidateJobId = "22222222-2222-4222-8222-222222222222", id = "11111111-1111-4111-8111-111111111111";
function db() { let read = 0; return { select: () => ({ from: () => ({ where: (condition: any) => {
  state.whereClauses.push(condition);
  const rows = ++read === 1 ? state.job ? [state.job] : [] : read === 2 ? [state.intent] : [state.checkpoint];
  return { orderBy: () => ({ limit: async () => rows }), limit: async () => rows };
} }) }) } as any; }
beforeEach(() => {
  state.whereClauses = [];
  const rolePlan = { ...scope, databaseName: "fixture", tables: ["users"], sequences: [], connectionLimit: 10 as const,
    expiresAt: "2026-01-01T00:00:00Z" }; delete (rolePlan as any).actorUserId;
  const plan = { candidateJobId, candidate: { imageSourceSha: "a".repeat(40), versionId: candidateJobId },
    workerSourceSha: "b".repeat(40), relations: { tables: rolePlan.tables, sequences: [] } };
  const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  state.job = { id, ...scope, requestedByUserId: 17, jobType: HTTP_RUNTIME_JOB, contractVersion: HTTP_RUNTIME_CONTRACT,
    status: "succeeded", attempt: 1, maxAttempts: 1, finishedAt: new Date(), leaseExpiresAt: null, leaseOwnerToken: null,
    operatorReviewRequired: false, inputJson: { ...scope, candidateJobId, planDigest },
    outputJson: { jobId: id, candidateJobId, imageReferencesVerified: true, runtimeBootVerified: true,
      trafficMutation: false, dnsMutation: false, imagePublication: false,
      probes: [{ probe: "node/health", status: 200 }, { probe: "node/database", status: 200 },
        { probe: "python/health", status: 200 }, { probe: "python/database", status: 200 }],
      cleanup: { nodeStopped: true, pythonStopped: true, candidateRestored: true, roleLoginRevoked: true, m2Preserved: true,
        candidateDeploymentId: candidateJobId, candidateVersionId: candidateJobId } } };
  state.intent = { updatedBy: 17, valueJson: { ...scope, submissionId: id, plan, planDigest, expiresAt: "2026-01-01T00:00:00Z",
    authority: "existing-candidate-bounded-runtime-test-v1", revokedAt: null, trafficMutation: false, dnsMutation: false,
    imagePublication: false, applicationCreation: false, fixtureCreation: false } };
  state.checkpoint = { updatedBy: 17, isSensitive: true, value: JSON.stringify({ ...scope, jobId: id, planDigest, stage: "TESTED_AND_COMPENSATED", rolePrepared: true,
    probes: state.job.outputJson.probes,
    rolePlan, roleSecret: { role: applicationDatabaseRoleName(scope), password: "never-expose-prior-password", planDigest: applicationDatabaseRolePlanDigest(rolePlan) },
    cleanup: { nodeStopped: true, pythonStopped: true, candidateRestored: true, roleLoginRevoked: true, m2Preserved: true,
      candidateDeploymentId: candidateJobId, candidateVersionId: candidateJobId } }) };
});
describe("read-only compensated Candidate continuation evidence", () => {
  it("accepts successful runtime evidence with complete compensation without renewing expired authority", async () => {
    const result = await readCompensatedHttpRuntime(db(), scope, candidateJobId);
    expect(result).toMatchObject({ jobId: id, restoredBaseline: { versionId: candidateJobId } });
    expect(JSON.stringify(result)).not.toMatch(/password|authority|grant|expiresAt.*2099/);
  });
  it("accepts a failed terminal execution only with the matching complete-compensation checkpoint", async () => {
    state.job.status = "failed";
    const checkpoint = JSON.parse(state.checkpoint.value);
    checkpoint.stage = "FAILED";
    state.checkpoint.value = JSON.stringify(checkpoint);
    await expect(readCompensatedHttpRuntime(db(), scope, candidateJobId)).resolves.toMatchObject({ jobId: id });
  });
  it.each(["running", "lease", "review", "unfinished", "wrong-candidate", "foreign-owner", "foreign-tenant", "bad-digest", "missing-checkpoint", "uncertain-cleanup", "wrong-role", "wrong-relations"])("rejects %s", async mode => {
    if (mode === "running") state.job.status = "running";
    if (mode === "lease") state.job.leaseOwnerToken = "active-lease";
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
  it.each(["wrong-stage", "missing-runtime-receipt", "missing-sql-probe", "output-cleanup-mismatch", "foreign-project"])("rejects successful evidence with %s", async mode => {
    const checkpoint = JSON.parse(state.checkpoint.value);
    if (mode === "wrong-stage") checkpoint.stage = "FAILED";
    if (mode === "missing-runtime-receipt") state.job.outputJson.runtimeBootVerified = false;
    if (mode === "missing-sql-probe") state.job.outputJson.probes[1].status = 503;
    if (mode === "output-cleanup-mismatch") state.job.outputJson.cleanup.roleLoginRevoked = false;
    if (mode === "foreign-project") state.job.inputJson.projectId = "foreign-project";
    state.checkpoint.value = JSON.stringify(checkpoint);
    await expect(readCompensatedHttpRuntime(db(), scope, candidateJobId)).rejects.toThrow("RECONCILE_REQUIRED");
  });
  it("allows a fresh application attempt only after exact fixture, runtime and M2 compensation", async () => {
    state.job.status = "failed";
    const plan = { ...state.intent.valueJson.plan, operation: "application", applicationAcceptance: true };
    const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    state.job = { ...state.job, attempt: 1, maxAttempts: 1, inputJson: { candidateJobId, operation: "application", planDigest } };
    state.intent = { updatedBy: scope.actorUserId, valueJson: { ...state.intent.valueJson, operation: "application", plan, planDigest,
      authority: "existing-candidate-bounded-application-acceptance-v1", fixtureCreation: true } };
    state.checkpoint.value = JSON.stringify({ ...JSON.parse(state.checkpoint.value), operation: "application", planDigest, stage: "FAILED",
      applicationFixtureUsers: [], cleanup: { ...JSON.parse(state.checkpoint.value).cleanup, applicationFixturesRemoved: true } });
    await expect(readCompensatedHttpApplicationAcceptance(db(), scope, candidateJobId)).resolves.toMatchObject({ jobId: id,
      restoredBaseline: { versionId: candidateJobId } });
    const value = JSON.parse(state.checkpoint.value); value.cleanup.applicationFixturesRemoved = false;
    state.checkpoint.value = JSON.stringify(value);
    await expect(readCompensatedHttpApplicationAcceptance(db(), scope, candidateJobId)).rejects.toThrow("RECONCILE_REQUIRED");
  });
  it("builds valid AND predicates when finding prior application acceptance", async () => {
    state.job.status = "failed";
    const plan = { ...state.intent.valueJson.plan, operation: "application", applicationAcceptance: true };
    const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    state.job = { ...state.job, attempt: 1, maxAttempts: 1, inputJson: { candidateJobId, operation: "application", planDigest } };
    state.intent = { updatedBy: scope.actorUserId, valueJson: { ...state.intent.valueJson, operation: "application", plan, planDigest,
      authority: "existing-candidate-bounded-application-acceptance-v1", fixtureCreation: true } };
    state.checkpoint.value = JSON.stringify({ ...JSON.parse(state.checkpoint.value), operation: "application", planDigest, stage: "FAILED",
      applicationFixtureUsers: [], cleanup: { ...JSON.parse(state.checkpoint.value).cleanup, applicationFixturesRemoved: true } });

    await readCompensatedHttpApplicationAcceptance(db(), scope, candidateJobId);
    const query = new PgDialect().sqlToQuery(state.whereClauses[0]).sql;
    expect(query).toMatch(/'operation'\s*=\s*'application'\s+and\s+.*'candidateJobId'\s*=\s*\$\d+/i);
    expect(query).not.toContain(", ");
  });
});
