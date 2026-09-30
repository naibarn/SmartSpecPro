import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const grantValidator = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock("../spec224RecoveryGrantValidator", () => ({
  validateSpec224RecoveryGrant: grantValidator.validate,
}));

import type { LeaseContext } from "../jobControlPlaneTypes";
import { bindSpec224RecoveryGrant } from "../spec224RecoveryGrantBinding";
import { commitSpec224ProtectedExecutionStartForTests } from "./support/spec224ProtectedExecutionStartHarness";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../"
);
const pythonGrantHelper = resolve(
  repositoryRoot,
  "python-backend/tests/integration/support/spec224_grant_process_helper.py"
);
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
let sourceCommit = "";
let sourcePath = "python-backend/app/services/approval_db_service.py";
let sourceFileSha256 = "";
let sourceSha256 = "";

function issueGrant(runtimeBinding: Record<string, unknown>) {
  return runPythonGrantProcess("issue", {
    tenantId,
    ownerId: userId,
    idempotencyKey: `spec224-start-${randomUUID()}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    runtimeBinding,
    sourcePath,
    sourceFileSha256,
    sourceCommit,
    sourceSha256,
  });
}

function runPythonGrantProcess(
  action: "issue" | "revoke",
  input: Record<string, unknown>
) {
  const python = process.env.SPEC224_TEST_PYTHON;
  if (!python) throw new Error("SPEC224_TEST_PYTHON_REQUIRED");
  const output = execFileSync(python, [pythonGrantHelper, action], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DEBUG: "false",
      SPEC224_TEST_DATABASE_IDENTITY:
        "spec224-d377-pg-20260930|spec224_d377_test|spec224_runtime|PostgreSQL 15.17",
      PYTHONPATH: resolve(repositoryRoot, "python-backend"),
      SPEC224_GRANT_TEST_INPUT: JSON.stringify(input),
    },
    timeout: 15_000,
  });
  return JSON.parse(output.trim());
}

function spawnPythonGrantProcess(
  action: "revoke" | "revoke-hold",
  input: Record<string, unknown>
) {
  const python = process.env.SPEC224_TEST_PYTHON;
  if (!python) throw new Error("SPEC224_TEST_PYTHON_REQUIRED");
  const child = spawn(python, [pythonGrantHelper, action], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DEBUG: "false",
      SPEC224_TEST_DATABASE_IDENTITY:
        "spec224-d377-pg-20260930|spec224_d377_test|spec224_runtime|PostgreSQL 15.17",
      PYTHONPATH: resolve(repositoryRoot, "python-backend"),
      SPEC224_GRANT_TEST_INPUT: JSON.stringify(input),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    output += chunk;
  });
  child.stderr.on("data", chunk => {
    stderr += chunk;
  });
  const result = new Promise<string>((resolveResult, rejectResult) => {
    child.once("error", rejectResult);
    child.once("close", code => {
      if (code !== 0)
        rejectResult(
          new Error(`SPEC224_PYTHON_HELPER_FAILED:${code}:${stderr}`)
        );
      else resolveResult(output.trim().split("\n").at(-1) ?? "");
    });
  });
  const fenceHeld =
    action === "revoke-hold"
      ? new Promise<void>((resolveReady, rejectReady) => {
          const deadline = setTimeout(
            () => rejectReady(new Error("SPEC224_PYTHON_FENCE_TIMEOUT")),
            10_000
          );
          const onData = () => {
            if (!output.includes("FENCE_HELD")) return;
            clearTimeout(deadline);
            child.stdout.off("data", onData);
            resolveReady();
          };
          child.stdout.on("data", onData);
          void result.catch(error => {
            clearTimeout(deadline);
            rejectReady(error);
          });
        })
      : Promise.resolve();
  return {
    child,
    result,
    fenceHeld,
    release: () => child.stdin.write("CONTINUE\n"),
    killIfRunning: () => {
      if (child.exitCode === null) child.kill("SIGTERM");
    },
  };
}

async function waitForAdvisoryWaiter() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [row] = await sql`
      SELECT count(*)::int AS count FROM pg_locks
      WHERE locktype = 'advisory' AND granted = false
    `;
    if (row.count > 0) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 10));
  }
  throw new Error("SPEC224_ADVISORY_WAITER_NOT_OBSERVED");
}

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
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    sourceFileSha256 = createHash("sha256")
      .update(
        await import("node:fs/promises").then(fs =>
          fs.readFile(resolve(repositoryRoot, sourcePath))
        )
      )
      .digest("hex");
    const sourceManifest = {
      files: [{ path: sourcePath, sha256: sourceFileSha256 }],
      schemaVersion: "spec224.source-manifest.v1",
      sourceCommit,
    };
    sourceSha256 = createHash("sha256")
      .update(JSON.stringify(sourceManifest))
      .digest("hex");
    grantId = "";
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
      VALUES (${jobId}, ${tenantId}, 'node_job_worker', ${userId}, 'external_agent_task', 'running', 'external', 'feature-186-v1', ${sql.json({})}, ${sql.json({ spec224: run, spec224Authorization: { binding: { runnerId, runnerSessionId: sessionId, capabilitySnapshotId: snapshotId, capabilitySnapshotRevision: snapshotRevision } } })}, 1, 1, 4, NOW() + INTERVAL '5 minutes', NOW())
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
      sourceCommit,
      sourceTree: sourceCommit,
      sourceSha256,
      sourceManifestDigest: "b".repeat(64),
      profileId: "local-test",
      profileVersion: 1,
      profileDigest: "c".repeat(64),
      bundleDigest: "d".repeat(64),
      artifactEvidenceDigest: "e".repeat(64),
      storageProvider: "local",
      storageObjectReference: `file://${sourcePath}`,
      remoteTrustEvidenceDigest: null,
      issuer: "spec224-local-source-verifier.v2",
      issuerVersion: "2",
      status: "ACTIVE",
      issuedAt: new Date().toISOString(),
      invalidatedAt: null,
      invalidationReason: null,
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
      VALUES (${jobId}, 'SPEC224_SOURCE_ATTESTED', ${`spec224:source-attestation:${attestationId}`}, ${attemptId}, ${sql.json({ attestation })})
    `;
    const issued = issueGrant(runtimeBinding);
    grantId = issued.grantId;
    grantValidator.validate.mockResolvedValue({
      schemaVersion: "spec224.recovery-grant-validation.v1",
      result: "VALID",
      valid: true,
      grantId,
      grantVersion: issued.version,
      scopeDigest: issued.scopeDigest,
      validatedAt: new Date().toISOString(),
    });
    await bindSpec224RecoveryGrant({
      tenantId,
      actorId: userId,
      runId,
      grantId,
      operation: "modify_owned_paths",
      path: sourcePath,
    });
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
    if (grantId) {
      await sql`DELETE FROM audit_logs WHERE resource_id = ${grantId}`;
      await sql`DELETE FROM approval_responses WHERE request_id = ${grantId}`;
      await sql`DELETE FROM approval_requests WHERE id = ${grantId}`;
    }
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql.end({ timeout: 5 });
  });

  it("persists one canonical start event and returns it after a fresh retry", async () => {
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

  it("persists containment after a committed harness start and Python owner revocation", async () => {
    let releaseStart!: () => void;
    let startHasFence!: () => void;
    const startFenceHeld = new Promise<void>(resolveHeld => {
      startHasFence = resolveHeld;
    });
    const startMayContinue = new Promise<void>(resolveContinue => {
      releaseStart = resolveContinue;
    });
    const startPromise = commitSpec224ProtectedExecutionStartForTests({
      tenantId,
      workerJobId: jobId,
      lease,
      afterGrantFenceAcquired: async () => {
        startHasFence();
        await startMayContinue;
      },
      syntheticGrantVerifier: async () => true,
    });
    await startFenceHeld;
    const revokeProcess = spawnPythonGrantProcess("revoke", {
      grantId,
      tenantId,
      ownerId: userId,
      reason: "test start-wins containment",
    });
    await waitForAdvisoryWaiter();
    releaseStart();
    const started = await startPromise;
    expect(started.outcome).toBe("STARTED");
    const revoked = await revokeProcess.result.then(JSON.parse);
    expect(revoked.state).toBe("revoked");
    expect(revoked.revocation.containmentIntentIds).toEqual([
      `spec224:protected-start-containment:${grantId}:${started.operationId}`,
    ]);
    expect(revoked.revocation.containmentReviewRequired).toBe(false);

    const [counts] = await sql`
      SELECT
        count(*) FILTER (WHERE "eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED')::int AS starts,
        count(*) FILTER (WHERE "eventType" = 'SPEC224_PROTECTED_EXECUTION_CONTAINMENT_REQUIRED')::int AS containment
      FROM worker_job_events WHERE "workerJobId" = ${jobId}
    `;
    expect(counts).toMatchObject({ starts: 1, containment: 1 });
    const [job] = await sql`SELECT status FROM worker_jobs WHERE id = ${jobId}`;
    expect(job.status).toBe("running");
    expect(
      await spawnPythonGrantProcess("revoke", {
        grantId,
        tenantId,
        ownerId: userId,
        reason: "duplicate test revoke",
      }).result.then(JSON.parse)
    ).toEqual(revoked);
    const [containment] = await sql`
      SELECT "eventIdempotencyKey" FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_CONTAINMENT_REQUIRED'
    `;
    await sql`
      UPDATE worker_job_events
      SET "payloadJson" = jsonb_set("payloadJson", '{deliveryState}', '"TAMPERED"'::jsonb)
      WHERE "workerJobId" = ${jobId} AND "eventIdempotencyKey" = ${containment.eventIdempotencyKey}
    `;
    const reconciled = runPythonGrantProcess("revoke", {
      grantId,
      tenantId,
      ownerId: userId,
      reason: "reconcile tampered intent",
    });
    expect(reconciled.state).toBe("revoked");
    expect(reconciled.revocation.containmentIntentIds).toEqual([]);
    expect(reconciled.revocation.containmentReviewRequired).toBe(true);
    expect(reconciled.revocation.containmentReviewReasons).toContain(
      "CONTAINMENT_IDEMPOTENCY_CONFLICT"
    );
    const [review] = await sql`
      SELECT "payloadJson" FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_CONTAINMENT_REVIEW_REQUIRED'
    `;
    expect(review.payloadJson.deliveryState).toBe("OPERATOR_REVIEW_REQUIRED");
  });

  it("denies and persists evidence when Python revocation commits before start", async () => {
    const revokeProcess = spawnPythonGrantProcess("revoke-hold", {
      grantId,
      tenantId,
      ownerId: userId,
      reason: "test revoke-wins ordering",
    });
    await revokeProcess.fenceHeld;
    const deniedPromise = commitSpec224ProtectedExecutionStartForTests({
      tenantId,
      workerJobId: jobId,
      lease,
      syntheticGrantVerifier: async snapshot => {
        const [row] = await sql`
          SELECT extra_data->'spec224RecoveryGrantV1'->>'state' AS state
          FROM approval_requests WHERE id = ${snapshot.grantBinding?.grantId}
            AND tenant_id = ${tenantId}
        `;
        return row?.state === "active";
      },
    });
    await waitForAdvisoryWaiter();
    revokeProcess.release();
    const [revoked, denied] = await Promise.all([
      revokeProcess.result.then(JSON.parse),
      deniedPromise,
    ]);
    expect(revoked.state).toBe("revoked");
    expect(denied).toEqual({
      outcome: "DENIED",
      reason: "DENIED_SYNTHETIC_TEST_GRANT",
    });
    const [counts] = await sql`
      SELECT
        count(*) FILTER (WHERE "eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED')::int AS starts,
        count(*) FILTER (WHERE "eventType" = 'SPEC224_PROTECTED_EXECUTION_START_DENIED')::int AS denials
      FROM worker_job_events WHERE "workerJobId" = ${jobId}
    `;
    expect(counts).toMatchObject({ starts: 0, denials: 1 });
    const [denial] = await sql`
      SELECT "payloadJson" FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" = 'SPEC224_PROTECTED_EXECUTION_START_DENIED'
    `;
    expect(denial.payloadJson).toMatchObject({
      grantId,
      reasonCode: "DENIED_SYNTHETIC_TEST_GRANT",
      evidenceClass: "SYNTHETIC_TEST_ONLY",
    });
  });

  it("serializes concurrent duplicate starts to one command", async () => {
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
