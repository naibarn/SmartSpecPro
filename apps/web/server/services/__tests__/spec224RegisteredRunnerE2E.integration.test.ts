/**
 * Opt-in registered Rust Runner E2E for Spec 224.
 *
 * This starts the real `smartaihub-runner` binary against an ephemeral local
 * Web control server and the real PostgreSQL Runner/Feature 195 repositories.
 * The provider is a deterministic, loopback-only adapter fixture; this is not
 * Codex/Claude Live Provider Certification.
 *
 * Run from apps/web with:
 *   RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=postgresql://.../smartspec_test \
 *   JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 \
 *   npx vitest run server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts
 */
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import express from "express";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const suite = enabled ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/smartspec_test";
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\/+/, "");
if (
  enabled &&
  (!/(^|_|-)(test|ci)(_|-|$)/i.test(databaseName) ||
    !["localhost", "127.0.0.1"].includes(parsedDatabaseUrl.hostname))
) {
  throw new Error(
    "Registered Runner E2E requires a local test/ci PostgreSQL database"
  );
}
process.env.DATABASE_URL = databaseUrl;

const sql = postgres(databaseUrl, { max: 4 });
const execFileAsync = promisify(execFile);
const createdJobs: string[] = [];
const createdTenants: string[] = [];
const createdUsers: number[] = [];
let runnerProcess: ChildProcess | null = null;
let runnerOutput: string[] = [];
let server: Server | null = null;
let dataRoot = "";
let runtime: Awaited<ReturnType<typeof loadRuntime>> | null = null;

async function loadRuntime() {
  const [
    runnerGateway,
    controlRoutes,
    auth,
    jobContracts,
    jobControl,
    dispatcher,
    commandClient,
    jobExecutor,
    jobOutboxPublisher,
    jobTransportAdapters,
  ] = await Promise.all([
    import("../runnerGateway"),
    import("../../routes/runnerControl"),
    import("../runnerAuthService"),
    import("../agentControlPlaneContracts"),
    import("../jobControlPlane"),
    import("../externalAgentRunnerDispatcher"),
    import("../runnerJobCommandClient"),
    import("../jobExecutor"),
    import("../jobOutboxPublisher"),
    import("../jobTransportAdapters"),
  ]);
  return {
    defaultRunnerGateway: runnerGateway.defaultRunnerGateway,
    handleRunnerUpgrade: controlRoutes.handleRunnerUpgrade,
    registerRunnerControlRoutes: controlRoutes.registerRunnerControlRoutes,
    runnerSessionController: controlRoutes.runnerSessionController,
    ...auth,
    ...jobContracts,
    ...jobControl,
    ...dispatcher,
    ...commandClient,
    ...jobExecutor,
    ...jobOutboxPublisher,
    ...jobTransportAdapters,
    dispatchRunnerJobCommand: controlRoutes.dispatchRunnerJobCommand,
  };
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.slice(
    0,
    42
  );
}

async function waitFor<T>(
  read: () => Promise<T | null>,
  timeoutMs = 20_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "condition not met";
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value !== null) return value;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Runner E2E condition: ${lastError}`);
}

async function createScope(): Promise<{ tenantId: string; userId: number }> {
  const tenantId = id("spec224-runner-tenant");
  const [user] = await sql`
    INSERT INTO users ("openId", "role", "plan", "credits", "isDisabled")
    VALUES (${`spec224-runner-${tenantId}`}, 'user', 'free', 0, false)
    RETURNING id
  `;
  await sql`
    INSERT INTO tenants ("id", "slug", "name", "isActive", "status", "plan", "created_at", "createdAt", "updatedAt")
    VALUES (${tenantId}, ${`${tenantId}-slug`}, 'Spec 224 Runner E2E', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())
  `;
  createdTenants.push(tenantId);
  createdUsers.push(Number(user.id));
  return { tenantId, userId: Number(user.id) };
}

async function deleteJobRows(jobId: string): Promise<void> {
  const references = await sql`
    SELECT DISTINCT kcu.table_name AS "tableName", kcu.column_name AS "columnName"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_schema = 'public' AND ccu.table_name = 'worker_jobs'
  `;
  for (const reference of references) {
    if (reference.tableName === "worker_jobs") continue;
    await sql.unsafe(
      `DELETE FROM "${reference.tableName}" WHERE "${reference.columnName}" = $1`,
      [jobId]
    );
  }
  await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
}

async function stopRunner(): Promise<void> {
  if (!runnerProcess || runnerProcess.exitCode !== null) return;
  runnerProcess.kill("SIGTERM");
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 3_000);
    runnerProcess?.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (runnerProcess.exitCode === null) runnerProcess.kill("SIGKILL");
  runnerProcess = null;
}

async function startRunner(input: {
  runnerId: string;
  controlUrl: string;
  accessToken: string;
  publicKey: string;
  privateKey: string;
  machineFingerprint: string;
  workspaceId: string;
  shimDir: string;
  previousRevision?: string;
}) {
  const binary = path.resolve("../runner-app/target/debug/smartaihub-runner");
  const childEnv = {
    ...process.env,
    PATH: `${input.shimDir}:${process.env.PATH ?? ""}`,
    SAH_RUNNER_ID: input.runnerId,
    SAH_RUNNER_DEVICE_ID: `device-${input.runnerId}`,
    SAH_RUNNER_CONTROL_URL: input.controlUrl,
    SAH_RUNNER_ACCESS_TOKEN: input.accessToken,
    SAH_RUNNER_DEVICE_PUBLIC_KEY: input.publicKey,
    SAH_RUNNER_DEVICE_PRIVATE_KEY: input.privateKey,
    SAH_RUNNER_MACHINE_FINGERPRINT: input.machineFingerprint,
    SAH_RUNNER_DATA_ROOT: dataRoot,
    SAH_RUNNER_CERTIFICATION_ADAPTER: "deterministic",
  };
  runnerProcess = spawn(binary, ["run"], {
    cwd: path.resolve("../runner-app"),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  runnerOutput = [];
  runnerProcess.stdout?.on("data", chunk =>
    runnerOutput.push(String(chunk).slice(0, 2000))
  );
  runnerProcess.stderr?.on("data", chunk =>
    runnerOutput.push(String(chunk).slice(0, 2000))
  );
  try {
    return await waitFor(async () => {
      const node = await runtime!.defaultRunnerGateway.getNode(
        input.runnerId,
        String((globalThis as { __spec224Tenant?: string }).__spec224Tenant)
      );
      return node?.currentSnapshot?.revision !== input.previousRevision &&
        node?.currentSnapshot?.toolInventory?.some(
          tool => tool.adapterId === "codex.v1" && tool.trustState === "ready"
        )
        ? node
        : null;
    });
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; runnerOutput=${runnerOutput.join("").slice(-6000)}`
    );
  }
}

suite("Spec 224 — actual registered Rust Runner E2E", () => {
  it("reconnects a registered Runner, dispatches the canonical external task, and settles PostgreSQL once", async () => {
    runtime = await loadRuntime();
    const scope = await createScope();
    (globalThis as { __spec224Tenant?: string }).__spec224Tenant =
      scope.tenantId;
    process.env.RUNNER_CONTROL_PLANE_ORIGIN = "http://127.0.0.1:0";

    const app = express();
    app.use(express.json());
    runtime.registerRunnerControlRoutes(app, runtime.defaultRunnerGateway);
    server = createServer(app);
    server.on("upgrade", (req, socket, head) =>
      runtime!.handleRunnerUpgrade(
        req,
        socket,
        head,
        runtime!.defaultRunnerGateway
      )
    );
    await new Promise<void>(resolve =>
      server!.listen(0, "127.0.0.1", () => resolve())
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Runner E2E server did not bind a TCP port");
    const origin = `http://127.0.0.1:${address.port}`;
    const runnerId = id("runner-spec224");
    const deviceId = `device-${runnerId}`;
    const machineFingerprint = `machine-${runnerId}`;
    const keyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const session = runtime.runnerSessionController.start({
      runnerId,
      tenantId: scope.tenantId,
      deviceId,
      ownerUserId: scope.userId,
      ttlMs: 120_000,
    });
    runtime.runnerSessionController.approve({
      runnerSessionId: session.runnerSessionId,
      nonce: session.nonce,
      ownerUserId: scope.userId,
      tenantId: scope.tenantId,
    });
    const registration = runtime.createRunnerRegistrationToken({
      runnerId,
      tenantId: scope.tenantId,
      profile: "local_device",
      nodeKind: "local_device",
      ownerUserId: scope.userId,
      deviceBinding: {
        deviceId,
        machineFingerprint,
        publicKey: keyPair.publicKey,
      },
    });
    const registrationAuth =
      await runtime.verifyRunnerRegistrationToken(registration);
    await runtime.defaultRunnerGateway.enroll({
      auth: registrationAuth,
      deviceId,
      displayName: "Spec 224 Registered Runner",
      ownerUserId: scope.userId,
    });
    await runtime.defaultRunnerGateway.bindSession({
      runnerId,
      tenantId: scope.tenantId,
      ownerUserId: scope.userId,
      runnerSessionId: session.runnerSessionId,
    });
    const accessToken = runtime.createRunnerControlToken({
      runnerId,
      tenantId: scope.tenantId,
      profile: "local_device",
      nodeKind: "local_device",
      runnerSessionId: session.runnerSessionId,
      deviceBinding: {
        deviceId,
        machineFingerprint,
        publicKey: keyPair.publicKey,
      },
    });

    dataRoot = await mkdtemp(path.join(tmpdir(), "spec224-runner-e2e-"));
    const workspaceId = `workspace-${runnerId}`;
    await mkdir(path.join(dataRoot, "workspaces", workspaceId), {
      recursive: true,
    });
    const shimDir = path.join(dataRoot, "bin");
    await mkdir(shimDir, { recursive: true });
    const codexShim = path.join(shimDir, "codex");
    await writeFile(
      codexShim,
      "#!/usr/bin/env node\nif (process.argv.includes('--version')) { console.log('codex-certification-shim 0.1.0'); } else { console.log('deterministic runner result'); }\n"
    );
    await chmod(codexShim, 0o755);

    const runnerInput = {
      runnerId,
      controlUrl: `${origin}/api/runners/${encodeURIComponent(runnerId)}/control`,
      accessToken,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      machineFingerprint,
      workspaceId,
      shimDir,
    };
    const firstSnapshot = await startRunner(runnerInput);
    expect(firstSnapshot.currentSnapshot?.runnerSessionId).toBe(
      session.runnerSessionId
    );
    expect(
      firstSnapshot.currentSnapshot?.toolInventory?.find(
        tool => tool.adapterId === "codex.v1"
      )
    ).toMatchObject({
      trustState: "ready",
      authorizationEvidenceRef: expect.stringMatching(
        /^runner-agent-auth:sha256:/
      ),
    });

    await stopRunner();
    const secondSnapshot = await startRunner({
      ...runnerInput,
      previousRevision: firstSnapshot.currentSnapshot?.revision,
    });
    expect(secondSnapshot.currentSnapshot?.runnerSessionId).toBe(
      session.runnerSessionId
    );

    const authEvidence = secondSnapshot.currentSnapshot?.toolInventory?.find(
      tool => tool.adapterId === "codex.v1"
    )?.authorizationEvidenceRef;
    if (!authEvidence)
      throw new Error("Runner did not publish Codex authorization evidence");
    const taskId = id("task-spec224");
    const manifest = {
      taskId,
      tenantId: scope.tenantId,
      actorId: scope.userId,
      goalId: `goal-${taskId}`,
      planId: `plan-${taskId}`,
      planRevision: 1,
      provider: "codex" as const,
      runtime: "local_runner" as const,
      workspaceId,
      contextPackageIds: [`context-${taskId}`],
      skillIds: ["skill-spec224"],
      mcpGrantIds: [],
      requestedCapabilities: ["workspace.read", "workspace.write"],
      policyBinding: {
        runnerId,
        runnerSessionId: session.runnerSessionId,
        capabilitySnapshotId:
          secondSnapshot.currentSnapshot?.capabilitySnapshotId ?? "",
        capabilitySnapshotRevision:
          secondSnapshot.currentSnapshot?.revision ?? "",
        authorizationGrantRef: authEvidence,
        approvalRef: `approval-${taskId}`,
        budgetReservationRef: `budget-${taskId}`,
        spendCeilingMicros: 1000,
        workspaceRef: workspaceId,
        deadline: new Date(Date.now() + 60_000).toISOString(),
      },
    };
    const definition = runtime.buildAgentJobDefinition(manifest);
    const created = await runtime.createJobControlPlane().create(definition);
    expect(created.created).toBe(true);
    createdJobs.push(created.jobId);

    const [outbox] = await sql`
      SELECT id
      FROM worker_job_outbox
      WHERE "workerJobId" = ${created.jobId}
      ORDER BY "createdAt" ASC
      LIMIT 1
    `;
    expect(outbox?.id).toBeTruthy();
    const publication = await runtime.publishJobOutboxRow(
      outbox.id,
      new runtime.PostgresPullJobTransportAdapter(),
      new Date()
    );
    expect(publication.state).toBe("published");

    // Run the actual Feature 195 PostgreSQL Node worker entrypoint in a
    // separate process. This keeps the certification on the deployed caller
    // boundary while the parent process owns the real Runner WSS channel.
    const internalToken = `spec224-internal-${crypto.randomUUID()}`;
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = internalToken;
    process.env.RUNNER_CONTROL_PLANE_ORIGIN = origin;
    const workerScript = `
      const { runPostgresNodeJobWorkerOnce } = await import("./server/jobs/postgresNodeJobWorker.ts");
      const result = await runPostgresNodeJobWorkerOnce({ runnerId: "node-worker-spec224-e2e" });
      process.stdout.write("SPEC224_WORKER_RESULT:" + JSON.stringify(result));
    `;
    const worker = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", workerScript],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          FEATURE_186_HARD_CUTOVER: "true",
          NODE_SERVER_INTERNAL_URL: origin,
          SMARTSPEC_INTERNAL_URL: origin,
          RUNNER_CONTROL_PLANE_ORIGIN: origin,
          SMARTSPEC_WEB_GATEWAY_TOKEN: internalToken,
        },
        timeout: 30_000,
        maxBuffer: 64 * 1024,
      }
    );
    const workerResult = worker.stdout.match(
      /SPEC224_WORKER_RESULT:(\[[^\n]*\])/
    );
    expect(workerResult?.[1]).toBeTruthy();
    expect(JSON.parse(workerResult![1])).toEqual([
      { jobId: created.jobId, state: "deferred" },
    ]);
    let terminal: { status: string };
    try {
      terminal = await waitFor(async () => {
        const status = await runtime!
          .createJobControlPlane()
          .getStatus(created.jobId, { tenantId: scope.tenantId });
        return status?.status === "succeeded" ? status : null;
      });
    } catch (error) {
      const status = await runtime
        .createJobControlPlane()
        .getStatus(created.jobId, { tenantId: scope.tenantId });
      const events = await sql`
        SELECT "eventType", "payloadJson"
        FROM worker_job_events WHERE "workerJobId" = ${created.jobId}
        ORDER BY "sequence" ASC
      `;
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; finalStatus=${JSON.stringify({ status: status?.status, errorCode: status?.errorCode, operatorReviewRequired: status?.operatorReviewRequired })}; events=${JSON.stringify(events.map(event => ({ eventType: event.eventType, payload: event.payloadJson })))}`
      );
    }
    expect(terminal.status).toBe("succeeded");
    const evidence = await sql`
      SELECT j.status, COUNT(e.id)::int AS "eventCount",
             COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS "completedEvents"
      FROM worker_jobs j LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
      WHERE j.id = ${created.jobId}
      GROUP BY j.status
    `;
    expect(evidence[0]).toMatchObject({
      status: "succeeded",
      completedEvents: 1,
    });
  }, 90_000);
});

afterAll(async () => {
  await stopRunner();
  if (server)
    await new Promise<void>(resolve => server!.close(() => resolve()));
  for (const jobId of createdJobs) await deleteJobRows(jobId);
  for (const tenantId of createdTenants)
    await sql`DELETE FROM runner_nodes WHERE "tenantId" = ${tenantId}`;
  // A user may point currentTenantId back to the test tenant. Clear that
  // reverse reference before deleting the tenant so cleanup cannot leave
  // test-owned identity rows behind when PostgreSQL enforces the FK.
  for (const userId of createdUsers)
    await sql`UPDATE users SET "currentTenantId" = NULL WHERE id = ${userId}`;
  for (const tenantId of createdTenants)
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
  for (const userId of createdUsers)
    await sql`DELETE FROM users WHERE id = ${userId}`;
  if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
  await sql.end();
});
