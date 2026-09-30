import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

import type { LeaseContext } from "../jobControlPlaneTypes";

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
let grantId = "";
let lease: LeaseContext;

describeDb("Spec 224 durable protected-start test harness PostgreSQL", () => {
  beforeEach(async () => {
    process.env.SPEC224_EXECUTION_START_TEST_HARNESS = "true";
    process.env.SPEC224_TEST_DATABASE_IDENTITY =
      "spec224-d377-pg-20260930|spec224_d377_test|spec224_runtime|PostgreSQL 15.17";
    tenantId = randomUUID();
    runId = randomUUID();
    jobId = randomUUID();
    attemptId = randomUUID();
    runnerId = `spec224-start-${randomUUID()}`;
    sessionId = randomUUID();
    snapshotId = randomUUID();
    snapshotRevision = `revision-${randomUUID()}`;
    attestationId = randomUUID();
    grantId = randomUUID();
    lease = {
      jobId,
      attemptId,
      leaseToken: `token-${randomUUID()}`,
      fencingVersion: 4,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    sql = postgres(connectionString, { max: 5, connect_timeout: 5 });
    const [user] = await sql`
      INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`spec224-start-${tenantId}`}, 'user', 'free', 0, false)
      RETURNING id
    `;
    userId = Number(user.id);
    await sql`
      INSERT INTO tenants (id, slug, name, "ownerId", "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 protected start test', ${userId}, true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
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
    const leaseTokenHash = createHash("sha256")
      .update(lease.leaseToken)
      .digest("hex");
    await sql`
      INSERT INTO worker_jobs (id, "tenantId", "runtimeType", "requestedByUserId", "jobType", status, "executionClass", "contractVersion", "inputJson", "progressJson", attempt, "maxAttempts", "fencingVersion", "leaseExpiresAt", "createdAt")
      VALUES (${jobId}, ${tenantId}, 'node_job_worker', ${userId}, 'external_agent_task', 'running', 'external', 'feature-186-v1', ${sql.json({})}, ${sql.json({ spec224: run })}, 1, 1, 4, NOW() + INTERVAL '5 minutes', NOW())
    `;
    await sql`
      INSERT INTO worker_job_attempts (id, "workerJobId", attempt, "leaseGeneration", "leaseTokenHash", "leaseExpiresAt", "startedAt", "createdAt")
      VALUES (${attemptId}, ${jobId}, 1, 1, ${leaseTokenHash}, NOW() + INTERVAL '5 minutes', NOW(), NOW())
    `;
    await sql`
      INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", "profile", "displayName", "trustState", status, "currentSnapshotRevision", "activeSessionId")
      VALUES (${runnerId}, ${tenantId}, ${userId}, 'rust_runner', 'development', 'Spec 224 start test', 'trusted', 'online', ${snapshotRevision}, ${sessionId})
    `;
    const runtimeBinding = {
      tenantId,
      ownerId: userId,
      runId,
      workerJobId: jobId,
      attempt: 1,
      revision: 2,
      decisionEpoch: 3,
      developmentRunFencingVersion: 5,
      workerJobFencingVersion: 4,
      runnerId,
      runnerSessionId: sessionId,
      capabilitySnapshotId: snapshotId,
      capabilitySnapshotRevision: snapshotRevision,
    };
    await sql`
      INSERT INTO runner_capability_snapshots (id, "runnerId", "tenantId", revision, "idempotencyKey", "observedAt", "expiresAt", "snapshotJson")
      VALUES (${snapshotId}, ${runnerId}, ${tenantId}, ${snapshotRevision}, ${`spec224-start-${snapshotId}`}, NOW(), NOW() + INTERVAL '5 minutes', ${sql.json({ capabilitySnapshotId: snapshotId, runnerSessionId: sessionId })})
    `;
    const attestation = {
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
      workPackageId: run.workPackageId,
      attemptId,
      attempt: 1,
      projectionRevision: 2,
      decisionEpoch: 3,
      developmentRunFencingVersion: 5,
      workerJobFencingVersion: 4,
      sourceCommit: "commit:test",
      sourceTree: "tree:test",
      sourceSha256: "a".repeat(64),
      sourceManifestDigest: "b".repeat(64),
      profileId: "local-test",
      profileVersion: 1,
      profileDigest: "c".repeat(64),
      bundleDigest: "d".repeat(64),
      artifactEvidenceDigest: "e".repeat(64),
      status: "ACTIVE",
      issuedAt: new Date().toISOString(),
    };
    const admissionBinding = {
      ...runtimeBinding,
      workPackageId: run.workPackageId,
      attemptId,
      attestationId,
      sourceCommit: attestation.sourceCommit,
      sourceTree: attestation.sourceTree,
      sourceSha256: attestation.sourceSha256,
      sourceManifestDigest: attestation.sourceManifestDigest,
      profileId: attestation.profileId,
      profileVersion: attestation.profileVersion,
      profileDigest: attestation.profileDigest,
      bundleDigest: attestation.bundleDigest,
      artifactEvidenceDigest: attestation.artifactEvidenceDigest,
    };
    const grantBinding = {
      schemaVersion: "spec224.recovery-grant-binding.v1",
      grantId,
      grantVersion: 1,
      scopeDigest: "f".repeat(64),
      tenantId,
      ownerId: userId,
      runId,
      workerJobId: jobId,
      workPackageId: run.workPackageId,
      operation: "modify_owned_paths",
      path: "src/test-only.ts",
      sourceCommit: attestation.sourceCommit,
      sourceTree: attestation.sourceTree,
      sourceSha256: attestation.sourceSha256,
      sourceManifestDigest: attestation.sourceManifestDigest,
      profileId: attestation.profileId,
      profileVersion: attestation.profileVersion,
      profileDigest: attestation.profileDigest,
      bundleDigest: attestation.bundleDigest,
      artifactEvidenceDigest: attestation.artifactEvidenceDigest,
      trustClass: attestation.trustClass,
      trustLevel: attestation.trustLevel,
      attestationId,
      attemptId,
      attempt: 1,
      revision: 2,
      decisionEpoch: 3,
      developmentRunFencingVersion: 5,
      workerJobFencingVersion: 4,
      runtimeBinding,
      admissionBinding,
      boundAt: new Date().toISOString(),
    };
    await sql`
      INSERT INTO worker_job_events ("workerJobId", "eventType", "eventIdempotencyKey", "attemptId", "payloadJson")
      VALUES
        (${jobId}, 'SPEC224_SOURCE_ATTESTED', ${`spec224:source-attestation:${attestationId}`}, ${attemptId}, ${sql.json({ attestation })}),
        (${jobId}, 'SPEC224_RECOVERY_GRANT_BOUND', ${`spec224:recovery-grant-binding:${runId}`}, ${attemptId}, ${sql.json(grantBinding)})
    `;
  });

  afterEach(async () => {
    delete process.env.SPEC224_EXECUTION_START_TEST_HARNESS;
    delete process.env.SPEC224_TEST_DATABASE_IDENTITY;
    if (!sql) return;
    await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
    await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
    await sql`DELETE FROM runner_capability_snapshots WHERE "runnerId" = ${runnerId} AND "tenantId" = ${tenantId}`;
    await sql`DELETE FROM runner_nodes WHERE "runnerId" = ${runnerId} AND "tenantId" = ${tenantId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql.end({ timeout: 5 });
  });

  it("persists one canonical start event and returns it after a fresh retry", async () => {
    const { commitSpec224ProtectedExecutionStartForTests } =
      await import("../spec224RuntimeAdmission");
    const request = {
      tenantId,
      workerJobId: jobId,
      lease,
      syntheticGrantVerifier: async () => true,
    };
    const first = await commitSpec224ProtectedExecutionStartForTests(request);
    const retry = await commitSpec224ProtectedExecutionStartForTests(request);
    expect(first.outcome).toBe("STARTED");
    expect(retry).toEqual({ ...first, outcome: "ALREADY_STARTED" });
    const [event] = await sql`
      SELECT "eventType", "eventIdempotencyKey", "payloadJson", "eventSequence"
      FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED'
    `;
    expect(event.eventIdempotencyKey).toBe(first.eventIdempotencyKey);
    expect(event.eventSequence).toBeTruthy();
    expect(event.payloadJson).toMatchObject({
      schemaVersion: "spec224.protected-execution-start.v1",
      evidenceClass: "SYNTHETIC_TEST_ONLY",
      tenantId,
      runId,
      workerJobId: jobId,
      attemptId,
      grantId,
      attestationId,
      runnerId,
      runnerSessionId: sessionId,
      capabilitySnapshotId: snapshotId,
      authorizedCommandId: first.authorizedCommandId,
    });
    const [count] = await sql`
      SELECT count(*)::int AS count FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED'
    `;
    expect(count.count).toBe(1);
  });

  it("serializes concurrent duplicate starts to one command", async () => {
    const { commitSpec224ProtectedExecutionStartForTests } =
      await import("../spec224RuntimeAdmission");
    const request = {
      tenantId,
      workerJobId: jobId,
      lease,
      syntheticGrantVerifier: async () => true,
    };
    const outcomes = await Promise.all([
      commitSpec224ProtectedExecutionStartForTests(request),
      commitSpec224ProtectedExecutionStartForTests(request),
    ]);
    expect(outcomes.map(item => item.outcome).sort()).toEqual([
      "ALREADY_STARTED",
      "STARTED",
    ]);
    expect(new Set(outcomes.map(item => item.authorizedCommandId)).size).toBe(
      1
    );
    const [count] = await sql`
      SELECT count(*)::int AS count FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED'
    `;
    expect(count.count).toBe(1);
  });

  it("records a durable conflict audit when an existing start payload is corrupted", async () => {
    const { commitSpec224ProtectedExecutionStartForTests } =
      await import("../spec224RuntimeAdmission");
    const request = {
      tenantId,
      workerJobId: jobId,
      lease,
      syntheticGrantVerifier: async () => true,
    };
    const first = await commitSpec224ProtectedExecutionStartForTests(request);
    await sql`
      UPDATE worker_job_events
      SET "payloadJson" = jsonb_set("payloadJson", '{authorityDigest}', '"tampered"'::jsonb)
      WHERE "workerJobId" = ${jobId}
        AND "eventIdempotencyKey" = ${first.eventIdempotencyKey}
    `;
    const retry = await commitSpec224ProtectedExecutionStartForTests(request);
    expect(retry).toEqual({
      outcome: "DENIED",
      reason: "DENIED_START_IDEMPOTENCY_CONFLICT",
    });
    const [audit] = await sql`
      SELECT "eventType", "payloadJson" FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_START_CONFLICT'
    `;
    expect(audit.payloadJson.operationId).toBe(first.operationId);
  });

  it.each([
    [
      "cancellation",
      async () =>
        sql`UPDATE worker_jobs SET "statusReason" = 'cancel_requested:test' WHERE id = ${jobId}`,
    ],
    [
      "completed attempt",
      async () =>
        sql`UPDATE worker_job_attempts SET "finishedAt" = NOW() WHERE id = ${attemptId}`,
    ],
    [
      "expired job lease",
      async () =>
        sql`UPDATE worker_jobs SET "leaseExpiresAt" = NOW() - INTERVAL '1 second' WHERE id = ${jobId}`,
    ],
    [
      "revoked runner",
      async () =>
        sql`UPDATE runner_nodes SET "revokedAt" = NOW() WHERE "runnerId" = ${runnerId}`,
    ],
    [
      "expired capability snapshot",
      async () =>
        sql`UPDATE runner_capability_snapshots SET "expiresAt" = NOW() - INTERVAL '1 second' WHERE id = ${snapshotId}`,
    ],
    [
      "stale projection revision",
      async () =>
        sql`UPDATE worker_jobs SET "progressJson" = jsonb_set("progressJson", '{spec224,projectionVersion}', '99'::jsonb) WHERE id = ${jobId}`,
    ],
    [
      "attestation invalidation",
      async () =>
        sql`
          INSERT INTO worker_job_events ("workerJobId", "eventType", "eventIdempotencyKey", "attemptId", "payloadJson")
          VALUES (${jobId}, 'SPEC224_SOURCE_ATTESTATION_INVALIDATED', ${`spec224:source-attestation-invalidated:${attestationId}`}, ${attemptId}, ${sql.json({ attestationId, actorId: userId, invalidatedAt: new Date().toISOString(), reason: "OWNER_REVOKED" })})
        `,
    ],
  ])("fails closed after %s", async (_label, mutate) => {
    await mutate();
    const { commitSpec224ProtectedExecutionStartForTests } =
      await import("../spec224RuntimeAdmission");
    const result = await commitSpec224ProtectedExecutionStartForTests({
      tenantId,
      workerJobId: jobId,
      lease,
      syntheticGrantVerifier: async () => true,
    });
    expect(result.outcome).toBe("DENIED");
    const [count] = await sql`
      SELECT count(*)::int AS count FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED'
    `;
    expect(count.count).toBe(0);
  });

  it("fails closed when the synthetic grant authority says expired or revoked", async () => {
    const { commitSpec224ProtectedExecutionStartForTests } =
      await import("../spec224RuntimeAdmission");
    const result = await commitSpec224ProtectedExecutionStartForTests({
      tenantId,
      workerJobId: jobId,
      lease,
      syntheticGrantVerifier: async () => false,
    });
    expect(result).toEqual({
      outcome: "DENIED",
      reason: "DENIED_SYNTHETIC_TEST_GRANT",
    });
  });

  it("keeps the normal admission path deny-only and creates no start event", async () => {
    const { checkSpec224RuntimeAdmission } =
      await import("../spec224RuntimeAdmission");
    const result = await checkSpec224RuntimeAdmission({
      tenantId,
      workerJobId: jobId,
      lease,
    });
    expect(result.decision).toBe("DENY");
    const [count] = await sql`
      SELECT count(*)::int AS count FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED'
    `;
    expect(count.count).toBe(0);
  });
});
