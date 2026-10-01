import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { db } from "../../db";
import { bindSpec224RecoveryGrant } from "../spec224RecoveryGrantBinding";
import { acquireSpec224RecoveryGrantFence } from "../spec224RecoveryGrantFence";
import { checkSpec224RuntimeAdmission } from "../spec224RuntimeAdmission";
import { validateSpec224RecoveryGrant } from "../spec224RecoveryGrantValidator";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const describeDb = enabled ? describe : describe.skip;
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../"
);
const python = process.env.SPEC224_TEST_PYTHON;
const validatorUrl = process.env.PYTHON_BACKEND_URL ?? "";
const validatorPath =
  "/api/v1/approvals/internal/spec224-recovery-grants/validate";
const identity =
  "spec224-d385-20261001|spec224_d385_test|spec224_d385_runtime|PostgreSQL 15.17";
const grantHelper = resolve(
  repositoryRoot,
  "python-backend/tests/integration/support/spec224_grant_process_helper.py"
);
const serverHelper = resolve(
  repositoryRoot,
  "python-backend/tests/integration/support/spec224_validator_http_helper.py"
);
const pythonProcessCwd = resolve(repositoryRoot, "python-backend");
const sourcePath = "apps/web/server/services/spec224RecoveryGrantValidator.ts";
const operation = "run_focused_tests";
let sql: ReturnType<typeof postgres>;
let server: ChildProcess | undefined;
let serverOutput = "";
let tenantId = "";
let userId = 0;
let grantId = "";
let grantScopeDigest = "";
let sourceSha256 = "";
let issuedGrantIds: string[] = [];
let fixtureJobId = "";
let fixtureRunnerId = "";
let fixtureCapabilityId = "";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function helperEnv(input: Record<string, unknown>) {
  return {
    PATH: process.env.PATH,
    DATABASE_URL: process.env.DATABASE_URL,
    PYTHONUNBUFFERED: "1",
    DEBUG: "false",
    SPEC224_TEST_DATABASE_IDENTITY: identity,
    PYTHONPATH: resolve(repositoryRoot, "python-backend"),
    SMARTSPEC_WEB_GATEWAY_TOKEN: process.env.SMARTSPEC_WEB_GATEWAY_TOKEN,
    SMARTSPEC_PROXY_TOKEN: "proxy-only-test-credential",
    SPEC224_GRANT_TEST_INPUT: JSON.stringify(input),
  };
}

function runGrantHelper(
  action: "issue" | "revoke",
  input: Record<string, unknown>
) {
  if (!python) throw new Error("SPEC224_TEST_PYTHON_REQUIRED");
  const output = execFileSync(python, [grantHelper, action], {
    cwd: pythonProcessCwd,
    encoding: "utf8",
    env: helperEnv(input),
    timeout: 15_000,
  });
  return JSON.parse(output.trim().split("\n").at(-1) ?? "{}");
}

function spawnRevoke(input: Record<string, unknown>) {
  if (!python) throw new Error("SPEC224_TEST_PYTHON_REQUIRED");
  const child = spawn(python, [grantHelper, "revoke"], {
    cwd: pythonProcessCwd,
    env: helperEnv(input),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", chunk => {
    stderr += chunk;
  });
  const result = new Promise<string>((resolveResult, rejectResult) => {
    child.once("error", rejectResult);
    child.once("close", code =>
      code === 0
        ? resolveResult(stdout.trim().split("\n").at(-1) ?? "")
        : rejectResult(
            new Error(`SPEC224_TEST_REVOKE_FAILED:${code}:${stderr}`)
          )
    );
  });
  return { child, result };
}

async function stopHelperProcess(child: ChildProcess, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const waitForClose = () =>
    new Promise<boolean>(resolveClose => {
      const timer = setTimeout(() => resolveClose(false), timeoutMs);
      child.once("close", () => {
        clearTimeout(timer);
        resolveClose(true);
      });
    });
  child.kill("SIGTERM");
  if (await waitForClose()) return;

  child.kill("SIGKILL");
  if (!(await waitForClose())) {
    throw new Error("SPEC224_HELPER_PROCESS_DID_NOT_EXIT_AFTER_SIGKILL");
  }
}

async function waitForGrantFenceWaiter() {
  const [hash] = await sql`
    SELECT hashtextextended(${`spec224:recovery-grant:${tenantId}:${grantId}`}, 224)::text AS value
  `;
  const unsigned = BigInt.asUintN(64, BigInt(hash.value));
  const classId = Number((unsigned >> 32n) & 0xffffffffn);
  const objectId = Number(unsigned & 0xffffffffn);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [waiter] = await sql`
      SELECT count(*)::int AS count FROM pg_locks
      WHERE locktype='advisory' AND granted=false AND objsubid=1
        AND classid=${classId}::oid AND objid=${objectId}::oid
    `;
    if (waiter.count > 0) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 10));
  }
  throw new Error("SPEC224_PYTHON_REVOKER_DID_NOT_WAIT_ON_SHARED_FENCE");
}

const baseRequest = () => ({
  grantId,
  tenantId,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim(),
  sourceSha256: "",
  workpackageId: "WP-RECOVERY-04",
  operation,
  path: sourcePath,
  runtimeScope: "node-control-plane",
  environmentScope: "isolated-non-production",
});

describeDb(
  "Spec 224 authenticated Node-Python grant validator PostgreSQL integration",
  () => {
    beforeAll(async () => {
      if (!python || !process.env.SMARTSPEC_WEB_GATEWAY_TOKEN) {
        throw new Error(
          "SPEC224_VALIDATOR_TEST_RUNTIME_CONFIGURATION_REQUIRED"
        );
      }
      const url = new URL(validatorUrl);
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        !Number(url.port)
      ) {
        throw new Error("SPEC224_VALIDATOR_TEST_ENDPOINT_MUST_BE_LOOPBACK");
      }
      server = spawn(python, [serverHelper, url.port], {
        cwd: pythonProcessCwd,
        env: helperEnv({}),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      server.stdout.setEncoding("utf8").on("data", chunk => {
        serverOutput += chunk;
      });
      server.stderr.setEncoding("utf8").on("data", chunk => {
        stderr += chunk;
      });
      const deadline = Date.now() + 15_000;
      while (
        Date.now() < deadline &&
        !serverOutput.includes("SPEC224_VALIDATOR_READY")
      ) {
        if (server.exitCode !== null)
          throw new Error(
            `SPEC224_VALIDATOR_PROCESS_EXITED:${server.exitCode}:${stderr}`
          );
        await new Promise(resolveWait => setTimeout(resolveWait, 20));
      }
      if (!serverOutput.includes("SPEC224_VALIDATOR_READY")) {
        server.kill("SIGTERM");
        throw new Error(`SPEC224_VALIDATOR_START_TIMEOUT:${stderr}`);
      }
    }, 20_000);

    beforeEach(async () => {
      const parsed = new URL(connectionString);
      if (
        parsed.hostname !== "127.0.0.1" ||
        parsed.port !== "55493" ||
        parsed.pathname !== "/spec224_d385_test" ||
        decodeURIComponent(parsed.username) !== "spec224_d385_runtime"
      ) {
        throw new Error("SPEC224_TEST_DATABASE_URL_FORBIDDEN");
      }
      sql = postgres(connectionString, { max: 5, connect_timeout: 5 });
      const [dbIdentity] = await sql`
      SELECT current_database() AS db, current_user AS role, r.rolsuper AS superuser, version()
      FROM pg_roles r WHERE r.rolname=current_user
    `;
      if (
        dbIdentity.db !== "spec224_d385_test" ||
        dbIdentity.role !== "spec224_d385_runtime" ||
        dbIdentity.superuser !== false ||
        !dbIdentity.version.startsWith("PostgreSQL 15.17")
      ) {
        await sql.end({ timeout: 5 });
        throw new Error("SPEC224_TEST_DATABASE_IDENTITY_MISMATCH");
      }
      tenantId = randomUUID();
      grantId = "";
      grantScopeDigest = "";
      sourceSha256 = "";
      issuedGrantIds = [];
      fixtureJobId = "";
      fixtureRunnerId = "";
      fixtureCapabilityId = "";
      const [user] = await sql`
      INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`spec224-validator-${tenantId}`}, 'user', 'free', 0, false) RETURNING id
    `;
      userId = Number(user.id);
      await sql`
      INSERT INTO tenants (id, slug, name, "ownerId", "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 validator integration', ${userId}, true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
    `;

      const fileHash = createHash("sha256")
        .update(await readFile(resolve(repositoryRoot, sourcePath)))
        .digest("hex");
      const sourceFiles = [{ path: sourcePath, sha256: fileHash }];
      const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim();
      const manifest = {
        files: sourceFiles,
        schemaVersion: "spec224.source-manifest.v1",
        sourceCommit,
      };
      sourceSha256 = createHash("sha256")
        .update(stableJson(manifest))
        .digest("hex");
      const scope = {
        sourceCommit,
        sourceSha256,
        sourceFiles,
        workpackageId: "WP-RECOVERY-04",
        allowedWriteSet: [sourcePath],
        allowedOperations: [operation],
        forbiddenOperations: [
          "production",
          "paid_provider",
          "cloudflare_migration",
          "shared_worktree",
        ],
        runtimeScope: "node-control-plane",
        environmentScope: "isolated-non-production",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      const issued = runGrantHelper("issue", {
        tenantId,
        ownerId: userId,
        idempotencyKey: `spec224-validator-${randomUUID()}`,
        scope,
      });
      grantId = issued.grantId;
      grantScopeDigest = issued.scopeDigest;
      issuedGrantIds.push(grantId);
    });

    afterEach(async () => {
      if (sql) {
        if (fixtureJobId) {
          await sql`DELETE FROM worker_job_events WHERE "workerJobId"=${fixtureJobId}`;
          await sql`DELETE FROM worker_job_outbox WHERE "workerJobId"=${fixtureJobId}`;
          await sql`DELETE FROM worker_job_attempts WHERE "workerJobId"=${fixtureJobId}`;
          await sql`DELETE FROM worker_jobs WHERE id=${fixtureJobId}`;
        }
        if (fixtureRunnerId) {
          await sql`DELETE FROM runner_capability_snapshots WHERE id=${fixtureCapabilityId}`;
          await sql`DELETE FROM runner_nodes WHERE "runnerId"=${fixtureRunnerId} AND "tenantId"=${tenantId}`;
        }
        for (const id of issuedGrantIds) {
          await sql`DELETE FROM audit_logs WHERE resource_id=${id}`;
          await sql`DELETE FROM approval_responses WHERE request_id=${id}`;
          await sql`DELETE FROM approval_requests WHERE id=${id}`;
        }
        if (tenantId) await sql`DELETE FROM tenants WHERE id=${tenantId}`;
        if (userId) await sql`DELETE FROM users WHERE id=${userId}`;
        await sql.end({ timeout: 5 });
      }
      sourceSha256 = "";
    });

    afterAll(async () => {
      if (server && server.exitCode === null) {
        await stopHelperProcess(server);
      }
    });

    it("uses the real authenticated Python route and canonical grant service", async () => {
      const request = baseRequest();
      request.sourceSha256 = sourceSha256;
      const decision = await validateSpec224RecoveryGrant(request);
      expect(decision).toMatchObject({
        schemaVersion: "spec224.recovery-grant-validation.v1",
        result: "VALID",
        grantId,
        grantVersion: 1,
        scopeDigest: grantScopeDigest,
      });
    });

    it("reloads grant authority from PostgreSQL after restarting the Python validator process", async () => {
      const request = baseRequest();
      request.sourceSha256 = sourceSha256;
      await expect(
        validateSpec224RecoveryGrant(request)
      ).resolves.toMatchObject({
        result: "VALID",
        grantId,
        scopeDigest: grantScopeDigest,
      });
      if (!server) throw new Error("SPEC224_VALIDATOR_PROCESS_NOT_STARTED");
      await stopHelperProcess(server);
      serverOutput = "";
      let stderr = "";
      const url = new URL(validatorUrl);
      server = spawn(python!, [serverHelper, url.port], {
        cwd: pythonProcessCwd,
        env: helperEnv({}),
        stdio: ["ignore", "pipe", "pipe"],
      });
      server.stdout.setEncoding("utf8").on("data", chunk => {
        serverOutput += chunk;
      });
      server.stderr.setEncoding("utf8").on("data", chunk => {
        stderr += chunk;
      });
      const deadline = Date.now() + 15_000;
      while (
        Date.now() < deadline &&
        !serverOutput.includes("SPEC224_VALIDATOR_READY")
      ) {
        if (server.exitCode !== null) {
          throw new Error(
            `SPEC224_VALIDATOR_RESTART_FAILED:${server.exitCode}:${stderr}`
          );
        }
        await new Promise(resolveWait => setTimeout(resolveWait, 20));
      }
      expect(serverOutput).toContain("SPEC224_VALIDATOR_READY");
      await expect(
        validateSpec224RecoveryGrant(request)
      ).resolves.toMatchObject({
        result: "VALID",
        grantId,
        grantVersion: 1,
        scopeDigest: grantScopeDigest,
      });
    });

    it("rejects missing/wrong internal authentication and an unknown protocol version", async () => {
      const request = {
        schemaVersion: "spec224.recovery-grant-validation.v1",
        ...baseRequest(),
        sourceSha256,
      };
      const noAuth = await fetch(`${validatorUrl}${validatorPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const wrongAuth = await fetch(`${validatorUrl}${validatorPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": "wrong-test-identity",
        },
        body: JSON.stringify(request),
      });
      const proxyOnlyAuth = await fetch(`${validatorUrl}${validatorPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": "proxy-only-test-credential",
        },
        body: JSON.stringify(request),
      });
      const wrongVersion = await fetch(`${validatorUrl}${validatorPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": process.env.SMARTSPEC_WEB_GATEWAY_TOKEN!,
        },
        body: JSON.stringify({
          ...request,
          schemaVersion: "spec224.recovery-grant-validation.v0",
        }),
      });
      expect(noAuth.status).toBe(401);
      expect(wrongAuth.status).toBe(401);
      expect(proxyOnlyAuth.status).toBe(401);
      expect(wrongVersion.status).toBe(422);
    });

    it("serializes validator reads against Python revocation with the shared PostgreSQL fence", async () => {
      const request = baseRequest();
      request.sourceSha256 = sourceSha256;
      let revoke: ReturnType<typeof spawnRevoke> | undefined;
      try {
        await db.instance.transaction(async tx => {
          await acquireSpec224RecoveryGrantFence(tx, { tenantId, grantId });
          revoke = spawnRevoke({
            grantId,
            tenantId,
            ownerId: userId,
            reason: "Integration fence ordering",
          });
          await waitForGrantFenceWaiter();
          const decision = await validateSpec224RecoveryGrant(request);
          expect(decision.result).toBe("VALID");
        });
        const revoked = JSON.parse(await revoke.result);
        expect(revoked.state).toBe("revoked");
      } finally {
        if (revoke?.child.exitCode === null) revoke.child.kill("SIGTERM");
        await revoke?.result.catch(() => undefined);
      }
      await expect(
        validateSpec224RecoveryGrant(request)
      ).resolves.toMatchObject({ result: "INVALID_REVOKED" });
    });

    it("maps a grant bound to another tenant to the authoritative invalid-tenant result", async () => {
      const request = baseRequest();
      request.tenantId = randomUUID();
      request.sourceSha256 = sourceSha256;
      await expect(
        validateSpec224RecoveryGrant(request)
      ).resolves.toMatchObject({ result: "INVALID_TENANT" });
    });

    it("loads canonical run/job/Runner state, validates through Python under the fence, then denies local-only trust", async () => {
      const runId = randomUUID();
      fixtureJobId = randomUUID();
      const attemptId = randomUUID();
      fixtureRunnerId = `spec224-validator-${randomUUID()}`;
      fixtureCapabilityId = randomUUID();
      const sessionId = randomUUID();
      const capabilityRevision = `revision-${randomUUID()}`;
      const attestationId = createHash("sha256")
        .update(randomBytes(32))
        .digest("hex");
      const leaseToken = `token-${randomUUID()}`;
      const run = {
        runId,
        tenantId,
        actorId: userId,
        workerJobId: fixtureJobId,
        workPackageId: "WP-RECOVERY-04",
        projectionVersion: 2,
        decisionEpoch: 3,
        fencingVersion: 5,
      };
      await sql`
        INSERT INTO worker_jobs (id, "tenantId", "runtimeType", "requestedByUserId", "jobType", status, "executionClass", "contractVersion", "inputJson", "progressJson", attempt, "maxAttempts", "fencingVersion", "leaseExpiresAt", "createdAt")
        VALUES (${fixtureJobId}, ${tenantId}, 'node_job_worker', ${userId}, 'external_agent_task', 'running', 'external', 'feature-186-v1', ${sql.json({})}, ${sql.json({ spec224: run, spec224Authorization: { binding: { runnerId: fixtureRunnerId, runnerSessionId: sessionId, capabilitySnapshotId: fixtureCapabilityId, capabilitySnapshotRevision: capabilityRevision } } })}, 1, 1, 4, NOW() + INTERVAL '5 minutes', NOW())
      `;
      await sql`
        INSERT INTO worker_job_attempts (id, "workerJobId", attempt, "leaseGeneration", "leaseTokenHash", "leaseExpiresAt", "startedAt", "createdAt")
        VALUES (${attemptId}, ${fixtureJobId}, 1, 1, ${createHash("sha256").update(leaseToken).digest("hex")}, NOW() + INTERVAL '5 minutes', NOW(), NOW())
      `;
      await sql`
        INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", profile, "displayName", "trustState", status, "currentSnapshotRevision", "activeSessionId")
        VALUES (${fixtureRunnerId}, ${tenantId}, ${userId}, 'rust_runner', 'development', 'Spec 224 validator integration', 'trusted', 'online', ${capabilityRevision}, ${sessionId})
      `;
      await sql`
        INSERT INTO runner_capability_snapshots (id, "runnerId", "tenantId", revision, "idempotencyKey", "observedAt", "expiresAt", "snapshotJson")
        VALUES (${fixtureCapabilityId}, ${fixtureRunnerId}, ${tenantId}, ${capabilityRevision}, ${`spec224-validator-${fixtureCapabilityId}`}, NOW(), NOW() + INTERVAL '5 minutes', ${sql.json({ capabilitySnapshotId: fixtureCapabilityId, runnerSessionId: sessionId })})
      `;
      const runtimeBinding = {
        tenantId,
        ownerId: userId,
        runId,
        workerJobId: fixtureJobId,
        attempt: 1,
        revision: 2,
        decisionEpoch: 3,
        developmentRunFencingVersion: 5,
        workerJobFencingVersion: 4,
        runnerId: fixtureRunnerId,
        runnerSessionId: sessionId,
        capabilitySnapshotId: fixtureCapabilityId,
        capabilitySnapshotRevision: capabilityRevision,
      };
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
        workerJobId: fixtureJobId,
        workPackageId: run.workPackageId,
        attemptId,
        attempt: 1,
        projectionRevision: 2,
        decisionEpoch: 3,
        developmentRunFencingVersion: 5,
        workerJobFencingVersion: 4,
        sourceCommit: baseRequest().sourceCommit,
        sourceTree: baseRequest().sourceCommit,
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
        issuedAt: new Date().toISOString(),
        status: "ACTIVE",
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
        sourceSha256,
        sourceManifestDigest: attestation.sourceManifestDigest,
        profileId: attestation.profileId,
        profileVersion: attestation.profileVersion,
        profileDigest: attestation.profileDigest,
        bundleDigest: attestation.bundleDigest,
        artifactEvidenceDigest: attestation.artifactEvidenceDigest,
      };
      await sql`
        INSERT INTO worker_job_events ("workerJobId", "eventType", "eventIdempotencyKey", "attemptId", "payloadJson")
        VALUES (${fixtureJobId}, 'SPEC224_SOURCE_ATTESTED', ${`spec224:source-attestation:${attestationId}`}, ${attemptId}, ${sql.json({ attestation })})
      `;
      const scope = {
        sourceCommit: attestation.sourceCommit,
        sourceSha256,
        sourceFiles: [
          {
            path: sourcePath,
            sha256: createHash("sha256")
              .update(await readFile(resolve(repositoryRoot, sourcePath)))
              .digest("hex"),
          },
        ],
        workpackageId: run.workPackageId,
        allowedWriteSet: [sourcePath],
        allowedOperations: [operation],
        forbiddenOperations: [
          "production",
          "paid_provider",
          "cloudflare_migration",
          "shared_worktree",
        ],
        runtimeScope: "node-control-plane",
        environmentScope: "isolated-non-production",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        runtimeBinding,
        admissionBinding,
      };
      const issued = runGrantHelper("issue", {
        tenantId,
        ownerId: userId,
        idempotencyKey: `spec224-validator-bound-${randomUUID()}`,
        scope,
      });
      grantId = issued.grantId;
      grantScopeDigest = issued.scopeDigest;
      issuedGrantIds.push(grantId);
      await bindSpec224RecoveryGrant({
        tenantId,
        actorId: userId,
        runId,
        grantId,
        operation,
        path: sourcePath,
      });
      const decision = await checkSpec224RuntimeAdmission({
        tenantId,
        workerJobId: fixtureJobId,
        lease: {
          jobId: fixtureJobId,
          attemptId,
          leaseToken,
          fencingVersion: 4,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      });
      expect(decision).toEqual({
        decision: "DENY",
        reason: "DENIED_LOCAL_ONLY_ATTESTATION",
      });
      const validations = await sql`
        SELECT "payloadJson" FROM worker_job_events
        WHERE "workerJobId"=${fixtureJobId} AND "eventType"='SPEC224_RECOVERY_GRANT_VALIDATED'
      `;
      expect(validations.some(row => row.payloadJson?.result === "VALID")).toBe(
        true
      );
    });
  }
);
