import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const grantValidator = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock("../spec224RecoveryGrantValidator", () => ({
  validateSpec224RecoveryGrant: grantValidator.validate,
}));

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
let sql: ReturnType<typeof postgres>;
let tenantId = "";
let runId = "";
let jobId = "";
let userId = 0;
let attemptId = "";
let runnerId = "";
let sessionId = "";
let snapshotId = "";
let snapshotRevision = "";
let attestationId = "";
const grantId = randomUUID();

const validDecision = () => ({
  schemaVersion: "spec224.recovery-grant-validation.v1",
  result: "VALID",
  grantId,
  grantVersion: 1,
  scopeDigest: "a".repeat(64),
  validatedAt: new Date().toISOString(),
});

describeDb("Spec 224 recovery grant binding service PostgreSQL", () => {
  beforeEach(async () => {
    tenantId = randomUUID();
    runId = randomUUID();
    jobId = randomUUID();
    runnerId = `spec224-bind-${randomUUID()}`;
    sessionId = randomUUID();
    snapshotId = randomUUID();
    snapshotRevision = `revision-${randomUUID()}`;
    attestationId = "b".repeat(64);
    sql = postgres(connectionString, { max: 5, connect_timeout: 5 });
    const [user] = await sql`
      INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`spec224-bind-${tenantId}`}, 'user', 'free', 0, false)
      RETURNING id
    `;
    userId = Number(user.id);
    await sql`
      INSERT INTO tenants (id, slug, name, "ownerId", "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 grant bind service test', ${userId}, true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
    `;
    const run = {
      runId,
      tenantId,
      actorId: userId,
      workerJobId: jobId,
      workPackageId: "WP-RECOVERY-04",
      projectionVersion: 2,
      decisionEpoch: 3,
      fencingVersion: 5,
    };
    const binding = {
      runnerId,
      runnerSessionId: sessionId,
      capabilitySnapshotId: snapshotId,
      capabilitySnapshotRevision: snapshotRevision,
    };
    await sql`
      INSERT INTO worker_jobs (id, "tenantId", "runtimeType", "requestedByUserId", "jobType", status, "executionClass", "contractVersion", "inputJson", "progressJson", attempt, "maxAttempts", "fencingVersion", "createdAt")
      VALUES (${jobId}, ${tenantId}, 'node_job_worker', ${userId}, 'external_agent_task', 'running', 'external', 'feature-186-v1', ${sql.json({})}, ${sql.json({ spec224: run, spec224Authorization: { binding } })}, 1, 1, 4, NOW())
    `;
    const [attempt] = await sql`
      INSERT INTO worker_job_attempts ("workerJobId", attempt, "leaseGeneration", "startedAt", "createdAt")
      VALUES (${jobId}, 1, 1, NOW(), NOW()) RETURNING id
    `;
    attemptId = String(attempt.id);
    await sql`
      INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", "profile", "displayName", "trustState", "status", "currentSnapshotRevision", "activeSessionId")
      VALUES (${runnerId}, ${tenantId}, ${userId}, 'rust_runner', 'development', 'Spec 224 binding service test', 'trusted', 'online', ${snapshotRevision}, ${sessionId})
    `;
    await sql`
      INSERT INTO runner_capability_snapshots (id, "runnerId", "tenantId", revision, "idempotencyKey", "observedAt", "expiresAt", "snapshotJson")
      VALUES (${snapshotId}, ${runnerId}, ${tenantId}, ${snapshotRevision}, ${`spec224-bind-${snapshotId}`}, NOW(), NOW() + INTERVAL '10 minutes', ${sql.json({ capabilitySnapshotId: snapshotId, runnerSessionId: sessionId })})
    `;
    await sql`
      INSERT INTO worker_job_events ("workerJobId", "eventType", "eventIdempotencyKey", "payloadJson")
      VALUES (${jobId}, 'SPEC224_SOURCE_ATTESTED', ${`spec224:source-attestation:${attestationId}`}, ${sql.json(
        {
          attestation: {
            schemaVersion: "spec224.trusted-source-attestation.v2",
            attestationVersion: 2,
            attestationId,
            trustLevel: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
            trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
            tenantId,
            actorId: userId,
            ownerId: userId,
            runId,
            workerJobId: jobId,
            workPackageId: "WP-RECOVERY-04",
            attemptId,
            attempt: 1,
            projectionRevision: 2,
            decisionEpoch: 3,
            requirementClosureDigest: "c".repeat(64),
            developmentRunFencingVersion: 5,
            workerJobFencingVersion: 4,
            developmentRepositoryRef: "repo:isolated-test",
            repository: "repo:isolated-test",
            developmentBaseRevision: "base:test",
            sourceCommit: "commit:test",
            sourceTree: "tree:test",
            gitTree: "tree:test",
            sourceManifestDigest: "d".repeat(64),
            sourceSha256: "e".repeat(64),
            specDigest: "f".repeat(64),
            specSourceDigest: "1".repeat(64),
            specBaselineId: "baseline:test",
            profileId: "local-test",
            profileVersion: 1,
            profileDigest: "2".repeat(64),
            bundleDigest: "3".repeat(64),
            artifactEvidenceDigest: "4".repeat(64),
            objectRef: "local:test-bundle",
            storageProvider: "local",
            storageObjectReference: "local:test-bundle",
            remoteTrustEvidenceDigest: null,
            issuer: "spec224-local-source-verifier.v2",
            issuerVersion: "2",
            issuedAt: new Date().toISOString(),
            status: "ACTIVE",
            invalidatedAt: null,
            invalidationReason: null,
          },
        }
      )})
    `;
    grantValidator.validate.mockReset();
  });

  afterEach(async () => {
    if (!sql) return;
    await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql.end({ timeout: 5 });
  });

  it("rejects cancellation committed during Python validation without persisting a binding", async () => {
    grantValidator.validate.mockImplementation(async () => {
      await sql`
        UPDATE worker_jobs
        SET "statusReason" = 'cancel_requested:cancel committed during grant validation'
        WHERE id = ${jobId} AND "tenantId" = ${tenantId}
      `;
      return validDecision();
    });
    const { bindSpec224RecoveryGrant } =
      await import("../spec224RecoveryGrantBinding");
    await expect(
      bindSpec224RecoveryGrant({
        tenantId,
        actorId: userId,
        runId,
        grantId,
        operation: "modify_owned_paths",
        path: "src/owned.ts",
      })
    ).rejects.toThrow("SPEC224_GRANT_BINDING_CANONICAL_STATE_CHANGED");
    const [event] = await sql`
      SELECT id FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" = 'SPEC224_RECOVERY_GRANT_BOUND'
    `;
    expect(event).toBeUndefined();
  });

  it.each([
    [
      "attempt completion",
      async () => {
        await sql`
          UPDATE worker_job_attempts SET "finishedAt" = NOW()
          WHERE "workerJobId" = ${jobId} AND attempt = 1
        `;
      },
    ],
    [
      "Runner revocation",
      async () => {
        await sql`
          UPDATE runner_nodes SET "revokedAt" = NOW()
          WHERE "runnerId" = ${runnerId} AND "tenantId" = ${tenantId}
        `;
      },
    ],
    [
      "capability snapshot replacement",
      async () => {
        await sql`
          UPDATE runner_capability_snapshots
          SET "snapshotJson" = ${sql.json({ capabilitySnapshotId: "replaced", runnerSessionId: sessionId })}
          WHERE id = ${snapshotId} AND "tenantId" = ${tenantId}
        `;
      },
    ],
  ])("rejects %s committed during validation", async (_label, mutate) => {
    grantValidator.validate.mockImplementation(async () => {
      await mutate();
      return validDecision();
    });
    const { bindSpec224RecoveryGrant } =
      await import("../spec224RecoveryGrantBinding");
    await expect(
      bindSpec224RecoveryGrant({
        tenantId,
        actorId: userId,
        runId,
        grantId,
        operation: "modify_owned_paths",
        path: "src/owned.ts",
      })
    ).rejects.toThrow("SPEC224_GRANT_BINDING_STATE_STALE");
    const [event] = await sql`
      SELECT id FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" = 'SPEC224_RECOVERY_GRANT_BOUND'
    `;
    expect(event).toBeUndefined();
  });

  it("persists owner identity and deduplicates concurrent binding callbacks", async () => {
    grantValidator.validate.mockImplementation(async () => validDecision());
    const { bindSpec224RecoveryGrant } =
      await import("../spec224RecoveryGrantBinding");
    const request = {
      tenantId,
      actorId: userId,
      runId,
      grantId,
      operation: "modify_owned_paths",
      path: "src/owned.ts",
    };
    const [first, second] = await Promise.all([
      bindSpec224RecoveryGrant(request),
      bindSpec224RecoveryGrant(request),
    ]);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    const [event] = await sql`
      SELECT "payloadJson" FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" = 'SPEC224_RECOVERY_GRANT_BOUND'
    `;
    expect(event.payloadJson).toMatchObject({
      grantId,
      tenantId,
      ownerId: userId,
    });
    const events = await sql`
      SELECT count(*)::int AS count FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" = 'SPEC224_RECOVERY_GRANT_BOUND'
    `;
    expect(events[0].count).toBe(1);
  });
});
