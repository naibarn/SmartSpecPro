import { describe, expect, it, vi } from "vitest";
import { getCloudflareMigrationMission, migrationMissionId, projectCloudflareMigration, type MigrationContinuation } from "./cloudflareMigrationLifecycle";
const evidence = vi.hoisted(() => vi.fn());
vi.mock("./cloudflareProductionDatabaseReconciliation", () => ({ readProductionDatabaseReadbackObservation: evidence }));
const scope = { tenantId: "tenant-a", projectId: "project-a" };
const continuation: MigrationContinuation = { migrationMode: "FIRST_MIGRATION", architecture: "HYBRID_INGRESS", agentCapacity: "AVAILABLE", engineeringCheckpoint: "ENGINEERING", handoffRef: "orchestra/tasks/cloudflare-delegated-staging-20261017/origin-completion/production-cutover/implementation/HANDOFF.md" };
const base = { id: "job-a", tenantId: scope.tenantId, status: "failed", jobType: "cloudflare.production.deploy", contractVersion: "cloudflare-production-ingress-v1", inputJson: { projectId: scope.projectId, targetId: "smartspec-cloudflare-runtime", environment: "production" }, outputJson: null, errorCode: "APPLICATION_PROBE_FAILED" };
const accepted = { ...base, status: "succeeded", errorCode: null, outputJson: { productionTrafficShifted: true, authenticatedAcceptance: { verified: true }, routeId: "route", deploymentId: "deployment", versionId: "version" } };
describe("First migration continuation over the existing canonical job authorities", () => {
  it("uses only evidence identity fields when the router includes environment", async () => {
    const database = { ...base, id: "database", jobType: "cloudflare.production.database.provision",
      inputJson: { ...base.inputJson, planDigest: "a".repeat(64) } };
    evidence.mockResolvedValueOnce({ acceptance: "M1_ACCEPTED", databaseConnectionVerified: true, tenantIsolationVerified: true });
    let reads = 0;
    const db = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => ++reads === 1 ? [] : [accepted, database] }) }) }) } as any;
    const result = await getCloudflareMigrationMission(db, { ...scope, environment: "production" } as typeof scope);
    expect(evidence).toHaveBeenCalledWith(db, { ...scope, jobId: "database", planDigest: "a".repeat(64) });
    expect(result.completedCheckpoints).toEqual(["M2_ACCEPTED", "M1_ACCEPTED"]);
  });
  it.each(["JOB_DEADLINE_EXPIRED", "GRANT_EXPIRED", "ATTEMPTS_EXHAUSTED", "APPLICATION_PROBE_FAILED"])("keeps the same durable mission after %s", errorCode => {
    const value = projectCloudflareMigration(scope, continuation, [{ ...base, errorCode }]);
    expect(value).toMatchObject({ campaignId: migrationMissionId(scope), missionExpiresAt: null, state: "REPAIR_REQUIRED", campaignAuthority: "NOT_AUTHORIZED" });
  });
  it("resumes the same checkpoint after agent quota/disconnect without failing the mission", () => {
    const waiting = { ...continuation, agentCapacity: "WAITING_AGENT_CAPACITY" as const };
    const before = projectCloudflareMigration(scope, waiting, [accepted]);
    const after = projectCloudflareMigration(scope, continuation, [accepted]);
    expect(before.state).toBe("WAITING_AGENT_CAPACITY");
    expect(after.state).toBe("M2_ACCEPTED");
    expect(before.completedCheckpoints).toEqual(after.completedCheckpoints);
    expect(JSON.parse(JSON.stringify(after)).campaignId).toBe(before.campaignId);
  });
  it("lets authorized backend work continue when engineering agent capacity is absent", () => {
    expect(projectCloudflareMigration(scope, { ...continuation, agentCapacity: "WAITING_AGENT_CAPACITY" }, [{ ...base, status: "queued" }]).state).toBe("AUTHORIZED");
  });
  it("preserves the nearest engineering checkpoint while agent capacity changes", () => {
    const value = projectCloudflareMigration(scope, { ...continuation,
      engineeringCheckpoint: "READY_FOR_EXECUTION", agentCapacity: "WAITING_AGENT_CAPACITY" }, []);
    expect(value.state).toBe("WAITING_AGENT_CAPACITY");
    expect(value.engineeringCheckpoint).toBe("READY_FOR_EXECUTION");
  });
  it("reconciles a crashed worker lease instead of authorizing a duplicate job", () => {
    expect(projectCloudflareMigration(scope, continuation, [{ ...base, status: "running", leaseExpiresAt: new Date(0) }])).toMatchObject({ state: "REPAIR_REQUIRED", nextOperation: "RECONCILE_CANONICAL_LEASE", activeJobId: base.id });
  });
  it("tracks the exact canonical M3 application job and ignores foreign or malformed runtime work", () => {
    const runtime = { ...base, id: "application-job", jobType: "cloudflare.production.native.runtime.verify",
      contractVersion: "cloudflare-native-runtime-verify-v1", status: "running", errorCode: null,
      inputJson: { contractVersion: "cloudflare-native-runtime-verify-v1", projectId: scope.projectId,
        candidateJobId: "11111111-1111-4111-8111-111111111111", submissionId: "22222222-2222-4222-8222-222222222222",
        planDigest: "a".repeat(64), operation: "application" }, leaseExpiresAt: new Date(Date.now() + 60_000) };
    expect(projectCloudflareMigration(scope, continuation, [accepted, runtime])).toMatchObject({
      state: "EXECUTING", nextOperation: "MONITOR_EXISTING_CANONICAL_JOB", activeJobId: "application-job" });
    expect(projectCloudflareMigration(scope, continuation, [accepted, { ...runtime, tenantId: "foreign" }]).activeJobId).toBeNull();
    expect(projectCloudflareMigration(scope, continuation, [accepted, { ...runtime, inputJson: { ...runtime.inputJson, planDigest: "bad" } }]).activeJobId).toBeNull();
  });
  it("preserves successful ingress while M1 fails and never treats provider readback as SQL acceptance", () => {
    const value = projectCloudflareMigration(scope, continuation, [accepted, { ...base, id: "db-job", jobType: "cloudflare.production.database.provision", status: "succeeded", outputJson: { providerConfigurationVerified: true } }]);
    expect(value.completedCheckpoints).toEqual(["M2_ACCEPTED"]);
    expect(value.currentMilestone).toBe("M1");
    expect(value.ingressReceipt?.routeId).toBe("route");
  });
  it("uses verified canonical SQL/isolation acceptance while preserving failed provisioning history", () => {
    const database = { ...base, id: "original-db", jobType: "cloudflare.production.database.provision",
      contractVersion: "cloudflare-prod-db-provision-v1", errorCode: "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH" };
    const value = projectCloudflareMigration(scope, continuation, [accepted, database], new Date(), [database.id]);
    expect(value).toMatchObject({ state: "M1_ACCEPTED", currentMilestone: "M3", nextOperation: "M3_RUNTIME_ACCEPTANCE", blocker: null });
    expect(value.completedCheckpoints).toEqual(["M2_ACCEPTED", "M1_ACCEPTED"]);
    expect(value.jobHistory.find(job => job.jobId === database.id)).toMatchObject({ status: "failed", errorCode: database.errorCode });
    expect(projectCloudflareMigration(scope, continuation, [accepted, database], new Date(), ["another-job"]).currentMilestone).toBe("M1");
    expect(projectCloudflareMigration(scope, continuation, [accepted, { ...database, tenantId: "foreign" }], new Date(), [database.id]).completedCheckpoints).toEqual(["M2_ACCEPTED"]);
  });
  it("does not accept a partial deployment or a failed browser receipt", () => {
    expect(projectCloudflareMigration(scope, continuation, [{ ...accepted, outputJson: { ...accepted.outputJson, authenticatedAcceptance: { verified: false } } }]).completedCheckpoints).toEqual([]);
  });
  it("requires reconciliation for an uncertain provider write rather than a retry", () => {
    expect(projectCloudflareMigration(scope, continuation, [{ ...base, errorCode: "ROUTE_SUBMISSION_UNKNOWN" }]).state).toBe("ROLLBACK_REQUIRED");
  });
  it("keeps historical acceptance but recognizes a later authorized rollback", () => {
    const rollback = { ...base, id: "rollback", status: "succeeded", inputJson: { ...base.inputJson, action: "ingress-rollback" }, outputJson: { productionTrafficShifted: false } };
    expect(projectCloudflareMigration(scope, continuation, [accepted, rollback])).toMatchObject({ currentMilestone: "M2", ingressReceipt: null, completedCheckpoints: ["M2_ACCEPTED"] });
  });
  it("does not turn scope or artifact changes into renewed operation authority", () => {
    expect(migrationMissionId({ ...scope, projectId: "other" })).not.toBe(migrationMissionId(scope));
    expect(projectCloudflareMigration(scope, continuation, [{ ...base, inputJson: { ...base.inputJson, artifactRef: "new-release" } }]).campaignAuthority).toBe("NOT_AUTHORIZED");
    expect(projectCloudflareMigration(scope, continuation, [{ ...accepted, tenantId: "foreign" }]).completedCheckpoints).toEqual([]);
  });
});
