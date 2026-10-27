import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest } from "./cloudflareApplicationDatabaseRole";

const enabled = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true";
const suite = enabled ? describe : describe.skip;
suite("compensated runtime reconciliation against PostgreSQL worker registry", () => {
  let disposable: any, client: any, db: any, closeDb: () => Promise<void>;
  const previous = Object.fromEntries(["DATABASE_URL", "NODE_ENV", "LLM_ENCRYPTION_KEY"].map(key => [key, process.env[key] as string | undefined]));
  const scope = { tenantId: "runtime-reconcile-fixture", projectId: "runtime-project-fixture", actorUserId: 17 };
  const jobId = randomUUID(), candidateJobId = randomUUID(), deploymentId = randomUUID();
  const key = "isolated-runtime-reconciliation-test-key";

  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    Object.assign(process.env, { DATABASE_URL: disposable.databaseUrl, NODE_ENV: "test", LLM_ENCRYPTION_KEY: key });
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client,
      [schema.systemSettings]);
    const database = await import("../db");
    db = database.getDb(); closeDb = database.closeDb;

    const rolePlan = { tenantId: scope.tenantId, projectId: scope.projectId, databaseName: "fixture_db", tables: ["users"],
      sequences: [], connectionLimit: 10, expiresAt: "2025-01-01T00:00:00.000Z" };
    const plan = { candidateJobId, candidate: { imageSourceSha: "a".repeat(40), versionId: candidateJobId },
      workerSourceSha: "b".repeat(40), relations: { tables: rolePlan.tables, sequences: [] } };
    const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    const probes = ["node/health", "node/database", "python/health", "python/database"].map(probe => ({ probe, status: 200 }));
    const cleanup = { nodeStopped: true, pythonStopped: true, candidateRestored: true, roleLoginRevoked: true, m2Preserved: true,
      candidateDeploymentId: deploymentId, candidateVersionId: candidateJobId };
    const output = { jobId, candidateJobId, imageReferencesVerified: true, runtimeBootVerified: true,
      trafficMutation: false, dnsMutation: false, imagePublication: false, probes, cleanup };
    const intent = { ...scope, actorUserId: scope.actorUserId, submissionId: jobId, planDigest, plan,
      expiresAt: "2025-01-01T00:00:00.000Z", authority: "existing-candidate-bounded-runtime-test-v1", revokedAt: null,
      trafficMutation: false, dnsMutation: false, imagePublication: false, applicationCreation: false, fixtureCreation: false };
    const { encrypt } = await import("./crypto");
    const checkpoint = encrypt(JSON.stringify({ ...scope, jobId, planDigest, stage: "TESTED_AND_COMPENSATED", rolePrepared: true,
      probes, rolePlan, roleSecret: { role: applicationDatabaseRoleName(scope),
        password: "fixture-only-secret", planDigest: applicationDatabaseRolePlanDigest(rolePlan) }, cleanup }), key);
    await db.insert(schema.workerJobs).values({ id: jobId, tenantId: scope.tenantId, requestedByUserId: scope.actorUserId,
      runtimeType: "node_job_worker", jobType: "cloudflare.production.native.runtime.verify", contractVersion: "cloudflare-native-runtime-verify-v1",
      status: "succeeded", inputJson: { ...scope, candidateJobId, planDigest }, outputJson: output, attempt: 1, maxAttempts: 1, finishedAt: new Date() });
    await db.insert(schema.systemSettings).values([
      { category: "cloudflare_production_native_runtime", key: jobId, valueJson: intent, updatedBy: scope.actorUserId, isSensitive: false },
      { category: "cloudflare_production_native_runtime_checkpoints", key: jobId, updatedBy: scope.actorUserId, isSensitive: true, value: checkpoint },
    ]);
  }, 30_000);

  afterAll(async () => {
    if (closeDb) await closeDb();
    if (client) await client.end({ timeout: 5 });
    if (disposable) await disposable.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }, 20_000);

  it("reads the succeeded job, encrypted checkpoint, SQL probes and compensation as historical evidence only", async () => {
    const { readCompensatedHttpRuntime } = await import("./cloudflareHttpRuntimeContinuation");
    const [job] = await client`SELECT id,status,"requestedByUserId","tenantId","jobType","contractVersion","inputJson","outputJson","finishedAt","leaseExpiresAt","leaseOwnerToken" FROM worker_jobs WHERE id=${jobId}`;
    const settings = await client`SELECT category,key,"updatedBy","isSensitive",value IS NOT NULL AS has_value,"valueJson" FROM system_settings WHERE key=${jobId}`;
    expect(job?.id).toBe(jobId);
    expect(settings.map((row: any) => row.category).sort()).toEqual([
      "cloudflare_production_native_runtime", "cloudflare_production_native_runtime_checkpoints",
    ]);
    await expect(readCompensatedHttpRuntime(db, scope, candidateJobId, jobId)).resolves.toMatchObject({
      jobId, planDigest: expect.any(String), restoredBaseline: { deploymentId, versionId: candidateJobId },
    });
  });
});
