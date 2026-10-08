/**
 * Opt-in registered Rust Runner E2E for Spec 224.
 *
 * This starts the real `smartaihub-runner` binary against an ephemeral local
 * Web control server and the real PostgreSQL Runner/Feature 195 repositories.
 * The provider is a deterministic, loopback-only adapter fixture; this is not
 * Codex/Claude Live Provider Certification.
 *
 * Run from apps/web with:
 *   RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=postgresql://spec224_d385_runtime:<password>@127.0.0.1:55493/spec224_d385_test \
 *   JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 \
 *   npx vitest run server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts
 */
import crypto from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  execFile,
  execFileSync,
  fork,
  spawn,
  type ChildProcess,
} from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { promisify } from "node:util";

import postgres from "postgres";
import { WebSocket } from "ws";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { RUNNER_CONTRACT_VERSION } from "../runnerContracts";
import { runnerDeviceProofPayload } from "../runnerAuthService";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const suite = enabled ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/smartspec_test";
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\/+/, "");
if (
  enabled &&
  (!/(^|_|-)(test|ci)(_|-|$)/i.test(databaseName) ||
    parsedDatabaseUrl.hostname !== "127.0.0.1" ||
    parsedDatabaseUrl.port !== "55493" ||
    databaseName !== "spec224_d385_test" ||
    decodeURIComponent(parsedDatabaseUrl.username) !== "spec224_d385_runtime")
) {
  throw new Error(
    "Registered Runner E2E requires the isolated D3.85 PostgreSQL identity"
  );
}
process.env.DATABASE_URL = databaseUrl;

const sql = postgres(databaseUrl, { max: 4 });
const execFileAsync = promisify(execFile);
const createdJobs: string[] = [];
const createdTenants: string[] = [];
const createdUsers: number[] = [];
const createdApprovalIds: string[] = [];
let runnerProcess: ChildProcess | null = null;
let runnerOutput: string[] = [];
let runnerWarnings: string[] = [];
let originalConsoleWarn: typeof console.warn | null = null;
let controlServer: ChildProcess | null = null;
let pythonApprovalServer: ChildProcess | null = null;
let dataRoot = "";
let runtime: Awaited<ReturnType<typeof loadRuntime>> | null = null;
const allDataRoots: string[] = [];
const serverMessages = new WeakMap<ChildProcess, unknown[]>();
const serverWaiters = new WeakMap<
  ChildProcess,
  Array<{
    predicate: (message: Record<string, unknown>) => boolean;
    resolve: (message: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>
>();

const pythonApprovalCancellationScript = `
import asyncio, json, os, sys
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.models.approval import ApprovalType
from app.services.approval_db_service import ApprovalDBService

async def main():
    tenant_id, job_id, requester_id = sys.argv[1], sys.argv[2], int(sys.argv[3])
    correlation = json.loads(sys.argv[4])
    engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            service = ApprovalDBService(session)
            request = await service.create_request(
                request_type=ApprovalType.CODE_EXECUTION,
                title="D3.49 isolated Runner cancellation",
                tenant_id=tenant_id,
                requester_id=requester_id,
                requester_type="user",
                execution_id=job_id,
                extra_data={"approvers": [requester_id], "spec224ExternalAgentResume": correlation},
                correlation_key="spec224-d349:" + correlation["operationKey"],
                risk_level="high",
            )
            cancelled = await service.cancel_request(
                request.id, cancelled_by=requester_id, tenant_id=tenant_id, reason="D3.49 test owner cancellation"
            )
            delivery = service._read_spec224_delivery(cancelled)
            duplicate = await service.cancel_request(
                request.id, cancelled_by=requester_id, tenant_id=tenant_id, reason="D3.49 duplicate cancellation"
            )
            duplicate_delivery = service._read_spec224_delivery(duplicate) if duplicate else None
            if not delivery or not duplicate_delivery or delivery["event"]["deliveryId"] != duplicate_delivery["event"]["deliveryId"] or delivery["payloadDigest"] != duplicate_delivery["payloadDigest"]:
                raise RuntimeError("SPEC224_CANCELLATION_REPLAY_NOT_IDEMPOTENT")
            print(json.dumps({"approvalRequestId": request.id, "status": cancelled.status.value,
                              "deliveryId": delivery["event"]["deliveryId"], "duplicateStable": True}))
    finally:
        await engine.dispose()

asyncio.run(main())
`;

function waitForServerMessage(
  child: ChildProcess,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 30_000
): Promise<Record<string, unknown>> {
  const queued = serverMessages.get(child) ?? [];
  const queuedIndex = queued.findIndex(message =>
    predicate(message as Record<string, unknown>)
  );
  if (queuedIndex >= 0)
    return Promise.resolve(
      queued.splice(queuedIndex, 1)[0] as Record<string, unknown>
    );
  return new Promise((resolve, reject) => {
    const waiters = serverWaiters.get(child) ?? [];
    const waiter = {
      predicate,
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("Timed out waiting for crash-server IPC message"));
      }, timeoutMs),
    };
    waiters.push(waiter);
    serverWaiters.set(child, waiters);
  });
}

async function startControlServer(input: {
  internalToken: string;
  pauseAt?: string;
  reconcileOnStart?: boolean;
  configuredOrigin?: string;
}): Promise<{ child: ChildProcess; origin: string }> {
  const child = fork(
    path.join(
      process.cwd(),
      "server/services/__tests__/spec224RunnerCrashServer.ts"
    ),
    [],
    {
      cwd: process.cwd(),
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        SMARTSPEC_WEB_GATEWAY_TOKEN: input.internalToken,
        ...(input.configuredOrigin
          ? { SPEC224_TEST_CONFIGURED_ORIGIN: input.configuredOrigin }
          : {}),
        ...(input.pauseAt ? { SPEC224_TEST_PAUSE_AT: input.pauseAt } : {}),
        ...(input.reconcileOnStart
          ? { SPEC224_TEST_RECONCILE_ON_START: "true" }
          : {}),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    }
  );
  const queue: unknown[] = [];
  const waiters: Array<{
    predicate: (message: Record<string, unknown>) => boolean;
    resolve: (message: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  serverMessages.set(child, queue);
  serverWaiters.set(child, waiters);
  child.on("message", raw => {
    const message = raw as Record<string, unknown>;
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else queue.push(message);
  });
  child.stderr?.on("data", chunk =>
    runnerWarnings.push(String(chunk).slice(0, 2000))
  );
  controlServer = child;
  const ready = await waitForServerMessage(
    child,
    message => message.type === "ready"
  );
  return { child, origin: String(ready.origin) };
}

async function getRunnerCommandFrameCount(child: ChildProcess): Promise<number> {
  const requestId = crypto.randomUUID();
  child.send?.({ type: "get-runner-command-count", requestId });
  const response = await waitForServerMessage(
    child,
    message =>
      message.type === "runner-command-count" &&
      message.requestId === requestId
  );
  if (typeof response.count !== "number")
    throw new Error("SPEC224_RUNNER_COMMAND_COUNT_INVALID");
  return response.count;
}

async function probeRunnerWebSocket(input: {
  origin: string;
  runnerId: string;
  token: string;
  deviceId?: string;
  publicKey?: string;
  privateKey?: string;
  machineFingerprint?: string;
}): Promise<{ socket: WebSocket; closed: Promise<number> }> {
  const url = new URL(
    `/api/runners/${encodeURIComponent(input.runnerId)}/control`,
    input.origin
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.token}`,
    host: "attacker.invalid",
    origin: "https://attacker.invalid",
    "x-forwarded-host": "attacker.invalid",
    "x-forwarded-proto": "https",
    "x-smartaihub-runner-protocol": RUNNER_CONTRACT_VERSION,
  };
  if (
    input.deviceId &&
    input.publicKey &&
    input.privateKey &&
    input.machineFingerprint
  ) {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const jti = JSON.parse(
      Buffer.from(input.token.split(".")[1] ?? "", "base64url").toString("utf8")
    ).jti as string;
    const signer = crypto.createSign("sha256");
    signer.update(
      runnerDeviceProofPayload({
        bodyHash: crypto.createHash("sha256").update("{}").digest("hex"),
        jti,
        method: "GET",
        nonce,
        path: url.pathname,
        timestamp,
      })
    );
    signer.end();
    const signature = signer.sign(input.privateKey, "base64");
    Object.assign(headers, {
      "x-runner-device-id": input.deviceId,
      "x-runner-device-public-key": input.publicKey.replace(/\n/g, "\\n"),
      "x-runner-device-nonce": nonce,
      "x-runner-device-timestamp": timestamp,
      "x-runner-device-signature": signature,
      "x-runner-machine-fingerprint": input.machineFingerprint,
    });
  }
  const socket = new WebSocket(url, {
    headers,
  });
  const closed = new Promise<number>(resolveClose => {
    socket.once("close", code => resolveClose(code));
  });
  await new Promise<void>((resolveOpen, rejectOpen) => {
    const timer = setTimeout(
      () => rejectOpen(new Error("SPEC224_WS_PROBE_OPEN_TIMEOUT")),
      5_000
    );
    socket.once("open", () => {
      clearTimeout(timer);
      resolveOpen();
    });
    socket.once("error", error => {
      clearTimeout(timer);
      rejectOpen(error);
    });
  });
  return { socket, closed };
}

async function killControlServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGKILL");
  await new Promise<void>(resolve => child.once("exit", () => resolve()));
  if (controlServer === child) controlServer = null;
}

async function startPythonApprovalServer(input: {
  pythonBackendRoot: string;
  pythonExecutable: string;
  pythonDatabaseUrl: string;
  internalToken: string;
}): Promise<string> {
  const tcpServer = createTcpServer();
  await new Promise<void>(resolve => tcpServer.listen(0, "127.0.0.1", resolve));
  const address = tcpServer.address();
  if (!address || typeof address === "string") throw new Error("SPEC224_PYTHON_GATEWAY_PORT_UNAVAILABLE");
  const port = address.port;
  await new Promise<void>(resolve => tcpServer.close(() => resolve()));
  const child = spawn(input.pythonExecutable, [
    "-m", "uvicorn", "spec224_d349_gateway_app:app", "--app-dir", "tests",
    "--host", "127.0.0.1", "--port", String(port),
  ], {
    cwd: input.pythonBackendRoot,
    env: {
      ...process.env,
      PYTHONPATH: input.pythonBackendRoot,
      DATABASE_URL: input.pythonDatabaseUrl,
      SMARTSPEC_WEB_GATEWAY_TOKEN: input.internalToken,
      JWT_SECRET: "spec224-d349-test-jwt-secret-only-not-production-000000000000",
      DEBUG: "false",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  pythonApprovalServer = child;
  child.stderr?.on("data", chunk => {
    runnerWarnings.push(String(chunk).replace(input.internalToken, "[redacted]").slice(0, 1000));
  });
  const origin = `http://127.0.0.1:${port}`;
  await waitFor(async () => {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`SPEC224_PYTHON_GATEWAY_EXITED:${child.exitCode ?? child.signalCode}`);
    const response = await fetch(`${origin}/openapi.json`).catch(() => null);
    return response?.ok ? true : null;
  }, 20_000);
  return origin;
}

async function stopPythonApprovalServer(): Promise<void> {
  const child = pythonApprovalServer;
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 3_000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null) child.kill("SIGKILL");
  pythonApprovalServer = null;
}

async function runApprovalReconcilerProcess(input: {
  workerId: string;
  leaseSeconds: number;
  killAfterPythonAck?: boolean;
}): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const script = `
    const { createSpec224ExternalApprovalAuthority, createSpec224ApprovalDecisionReconciler } = await import("./server/services/spec224ApprovalContinuation.ts");
    const { createJobControlPlane } = await import("./server/services/jobControlPlane.ts");
    const authority = createSpec224ExternalApprovalAuthority();
    if (process.env.SPEC224_TEST_KILL_AFTER_PYTHON_ACK === "true") {
      const acknowledge = authority.acknowledge.bind(authority);
      authority.acknowledge = async input => {
        await acknowledge(input);
        process.stdout.write("SPEC224_PYTHON_ACK_DURABLE\\n");
        await new Promise(resolve => setTimeout(resolve, 30000));
      };
    }
    const reconcile = createSpec224ApprovalDecisionReconciler(
      { authority, controlPlane: createJobControlPlane() },
      { workerId: process.env.SPEC224_TEST_WORKER_ID, limit: 10, leaseSeconds: Number(process.env.SPEC224_TEST_LEASE_SECONDS) },
    );
    const result = await reconcile();
    process.stdout.write("SPEC224_RECONCILE_RESULT:" + JSON.stringify(result) + "\\n");
  `;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SPEC224_TEST_WORKER_ID: input.workerId,
      SPEC224_TEST_LEASE_SECONDS: String(input.leaseSeconds),
      SPEC224_TEST_KILL_AFTER_PYTHON_ACK: input.killAfterPythonAck ? "true" : "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let killedAfterAck = false;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("SPEC224_APPROVAL_RECONCILER_PROCESS_TIMEOUT"));
    }, 30_000);
    child.stdout.on("data", chunk => {
      stdout += String(chunk);
      if (input.killAfterPythonAck && !killedAfterAck && stdout.includes("SPEC224_PYTHON_ACK_DURABLE")) {
        killedAfterAck = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", chunk => { stderr += String(chunk).slice(-4000); });
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (exitCode, signal) => {
      clearTimeout(timeout);
      if (input.killAfterPythonAck && !killedAfterAck) {
        reject(new Error(`SPEC224_ACK_FAILPOINT_NOT_REACHED:${stderr.slice(-1000)}`));
        return;
      }
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
}

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
    developmentRunContracts,
    developmentRunPersistence,
    continuationReconciler,
    approvalContinuation,
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
    import("../spec224DevelopmentRunContracts"),
    import("../spec224DevelopmentRunPersistence"),
    import("../spec224RunnerContinuationReconciler"),
    import("../spec224ApprovalContinuation"),
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
    ...developmentRunContracts,
    ...developmentRunPersistence,
    ...continuationReconciler,
    ...approvalContinuation,
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
    SELECT child_ns.nspname AS "schemaName",
      child_rel.relname AS "tableName",
      child_col.attname AS "columnName"
    FROM pg_constraint constraint_row
    JOIN pg_class child_rel ON child_rel.oid = constraint_row.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY child_key(attnum, position) ON true
    JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY parent_key(attnum, position)
      ON parent_key.position = child_key.position
    JOIN pg_attribute child_col
      ON child_col.attrelid = child_rel.oid AND child_col.attnum = child_key.attnum
    JOIN pg_class parent_rel ON parent_rel.oid = constraint_row.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    WHERE constraint_row.contype = 'f'
      AND child_ns.nspname = 'public'
      AND parent_ns.nspname = 'public'
      AND parent_rel.relname = 'worker_jobs'
  `;
  for (const reference of references) {
    if (reference.tableName === "worker_jobs") continue;
    await sql.unsafe(
      `DELETE FROM "${reference.schemaName}"."${reference.tableName}" WHERE "${reference.columnName}" = $1`,
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
  dropReceiptAck?: boolean;
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
    ...(input.dropReceiptAck
      ? { SAH_RUNNER_TEST_DROP_RECEIPT_ACK_ONCE: "true" }
      : {}),
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
  it("registers the real Runner and keeps dispatch inert without a grant-bound durable start", async () => {
    const [databaseIdentity] = await sql`
      SELECT current_database() AS database_name, current_user AS role_name,
        role.rolsuper AS is_superuser, version() AS server_version
      FROM pg_roles AS role WHERE role.rolname = current_user
    `;
    expect(databaseIdentity).toMatchObject({
      database_name: "spec224_d385_test",
      role_name: "spec224_d385_runtime",
      is_superuser: false,
    });
    expect(databaseIdentity.server_version).toMatch(/^PostgreSQL 15\.17/);

    const [container] = JSON.parse(
      execFileSync("docker", ["inspect", "spec224-d385-pg"], {
        encoding: "utf8",
      })
    ) as Array<{
      Name: string;
      Config: { Image: string };
      State: { Running: boolean };
      HostConfig: { NetworkMode: string };
      Mounts: Array<{ Name: string; Destination: string }>;
      NetworkSettings: {
        Ports: Record<
          string,
          Array<{ HostIp: string; HostPort: string }> | null
        >;
      };
    }>;
    expect(container).toMatchObject({
      Name: "/spec224-d385-pg",
      Config: { Image: "postgres:15.17" },
      State: { Running: true },
      HostConfig: { NetworkMode: "spec224-d385-net" },
    });
    expect(container.Mounts).toContainEqual(
      expect.objectContaining({
        Name: "spec224-d385-pgdata",
        Destination: "/var/lib/postgresql/data",
      })
    );
    expect(container.NetworkSettings.Ports["5432/tcp"]).toContainEqual({
      HostIp: "127.0.0.1",
      HostPort: "55493",
    });

    const crashMode = process.env.SPEC224_RUNNER_CRASH_CASE ?? "baseline";
    if (
      ![
        "baseline",
        "disconnect-before-ack",
        "lost-ack-resend",
        "sigkill-after-persist",
        "sigkill-after-ack",
        "cancellation",
        "approval-cancellation",
      ].includes(crashMode)
    )
      throw new Error("Unsupported SPEC224_RUNNER_CRASH_CASE");
    runnerWarnings = [];
    originalConsoleWarn ??= console.warn;
    console.warn = (...args: unknown[]) => {
      runnerWarnings.push(args.map(value => String(value)).join(" "));
      originalConsoleWarn?.(...args);
    };
    const scope = await createScope();
    (globalThis as { __spec224Tenant?: string }).__spec224Tenant =
      scope.tenantId;
    const internalToken = `spec224-internal-${crypto.randomUUID()}`;
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = internalToken;
    if (crashMode === "approval-cancellation") {
      const pythonExecutable = process.env.SPEC224_PYTHON_EXECUTABLE;
      if (!pythonExecutable) throw new Error("SPEC224_PYTHON_EXECUTABLE_REQUIRED_FOR_APPROVAL_E2E");
      const repoRoot = path.resolve(process.cwd(), "../..");
      const pythonDatabaseUrl = process.env.PYTHON_DATABASE_URL;
      if (!pythonDatabaseUrl) throw new Error("PYTHON_DATABASE_URL_REQUIRED_FOR_APPROVAL_E2E");
      const pythonOrigin = await startPythonApprovalServer({
        pythonBackendRoot: path.join(repoRoot, "python-backend"),
        pythonExecutable,
        pythonDatabaseUrl,
        internalToken,
      });
      process.env.PYTHON_BACKEND_URL = pythonOrigin;
    }
    runtime = await loadRuntime();
    const pauseAt =
      crashMode === "disconnect-before-ack"
        ? "disconnect-before-ack"
        : crashMode === "sigkill-after-persist"
          ? "after-persist-before-ack"
          : crashMode === "sigkill-after-ack"
            ? "after-ack-written"
            : undefined;
    const invalidOriginServer = await startControlServer({
      internalToken,
      configuredOrigin: "not a valid control-plane origin",
    });
    const invalidOriginProbe = await probeRunnerWebSocket({
      origin: invalidOriginServer.origin,
      runnerId: "invalid-origin-probe",
      token: "not-a-valid-token",
    });
    const invalidOriginCloseCode = await Promise.race([
      invalidOriginProbe.closed,
      new Promise<number>(resolveClose =>
        setTimeout(() => resolveClose(-1), 5_000)
      ),
    ]);
    expect(invalidOriginCloseCode).toBe(1008);
    await killControlServer(invalidOriginServer.child);

    const firstServer = await startControlServer({ internalToken, pauseAt });
    const origin = firstServer.origin;
    process.env.RUNNER_CONTROL_PLANE_ORIGIN = origin;
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
    const spoofedOriginProbe = await probeRunnerWebSocket({
      origin,
      runnerId,
      token: accessToken,
      deviceId,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      machineFingerprint,
    });
    const authenticatedProbe = await waitForServerMessage(
      firstServer.child,
      message => message.type === "authenticated"
    );
    expect(authenticatedProbe.origin).toBe(origin);
    spoofedOriginProbe.socket.close(1000, "origin-spoof-test-complete");
    await spoofedOriginProbe.closed;

    dataRoot = await mkdtemp(path.join(tmpdir(), "spec224-runner-e2e-"));
    allDataRoots.push(dataRoot);
    const workspaceId = `workspace-${runnerId}`;
    await mkdir(path.join(dataRoot, "workspaces", workspaceId), {
      recursive: true,
    });
    const workspaceCancelMarker = path.join(dataRoot, "workspaces", workspaceId, "codex-cancel-execution-started");
    const shimDir = path.join(dataRoot, "bin");
    await mkdir(shimDir, { recursive: true });
    const codexShim = path.join(shimDir, "codex");
    await writeFile(
      codexShim,
      ["cancellation", "approval-cancellation"].includes(crashMode)
        ? "#!/usr/bin/env node\nif (process.argv.includes('--version')) { console.log('codex-certification-shim 0.1.0'); } else { require('fs').writeFileSync('codex-cancel-execution-started', 'started'); setTimeout(() => console.log('late deterministic result'), 180000); }\n"
        : "#!/usr/bin/env node\nif (process.argv.includes('--version')) { console.log('codex-certification-shim 0.1.0'); } else { console.log('deterministic runner result'); }\n"
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
      dropReceiptAck: crashMode === "lost-ack-resend",
    });
    expect(secondSnapshot.currentSnapshot?.runnerSessionId).toBe(
      session.runnerSessionId
    );

    const authEvidence = secondSnapshot.currentSnapshot?.toolInventory?.find(
      tool => tool.adapterId === "codex.v1"
    )?.authorizationEvidenceRef;
    if (!authEvidence)
      throw new Error("Runner did not publish Codex authorization evidence");
    const [snapshotIdentity] = await sql`
      SELECT id, "snapshotJson"->>'capabilitySnapshotId' AS "semanticId"
      FROM runner_capability_snapshots
      WHERE "runnerId" = ${runnerId}
        AND "tenantId" = ${scope.tenantId}
        AND revision = ${secondSnapshot.currentSnapshot?.revision}
    `;
    expect(snapshotIdentity?.semanticId).toBe(
      secondSnapshot.currentSnapshot?.capabilitySnapshotId
    );
    expect(snapshotIdentity?.id).not.toBe(snapshotIdentity?.semanticId);
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
        budgetCapMinorUnits: 1000,
        currency: "USD",
        workspaceRef: workspaceId,
        deadline: new Date(Date.now() + 180_000).toISOString(),
      },
    };
    const definition = runtime.buildAgentJobDefinition(manifest);
    const runId = crypto.randomUUID();
    const run = runtime.buildDevelopmentRun({
      runId,
      tenantId: scope.tenantId,
      actorId: scope.userId,
      goal: "Registered Rust Runner WebSocket ACK continuation test",
      repositoryRef: "repo:spec224-runner-e2e",
      baseRevision: "git:spec224-runner-e2e-base",
      contextPackHash: "b".repeat(64),
      workspaceId: `workspace:${workspaceId}`,
    });
    const canonicalJobId = crypto.randomUUID();
    const boundRun = runtime.bindWorkerJob(run, canonicalJobId);
    const created = await runtime.createJobControlPlane().create(
      {
        ...definition,
        input: {
          ...definition.input,
          spec224Run: { ...boundRun, projectionVersion: 0 },
        },
      },
      { canonicalJobId }
    );
    expect(created.created).toBe(true);
    createdJobs.push(created.jobId);
    await runtime
      .createDevelopmentRunService(
        runtime.defaultDevelopmentRunPersistenceAdapter
      )
      .initialize({
        run: boundRun,
        eventIdempotencyKey: `run-created:${canonicalJobId}`,
        scope: { tenantId: scope.tenantId, actorId: scope.userId },
      });

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
    const workerResultRows = JSON.parse(workerResult![1]) as Array<{
      jobId: string;
      state: string;
    }>;
    expect(workerResultRows).toHaveLength(1);
    expect(workerResultRows[0]?.jobId).toBe(created.jobId);
    if (crashMode === "baseline") {
      expect(workerResultRows[0]?.state).toBe("error");
      expect(runnerProcess?.exitCode).toBeNull();
      const [noStartEvidence] = await sql`
        SELECT j.status, j."errorCode", j."failureReason",
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_PROTECTED_EXECUTION_STARTED')::int AS starts,
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_PROTECTED_EXECUTION_START_DENIED')::int AS denials,
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_RUNNER_DISPATCH_DENIED')::int AS "dispatchDenials",
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS receipts,
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_CONTINUATION_PENDING')::int AS continuations
        FROM worker_jobs j LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
        WHERE j.id = ${created.jobId} GROUP BY j.status, j."errorCode", j."failureReason"
      `;
      expect(noStartEvidence).toEqual({
        status: "failed",
        errorCode: "JobControlPlaneError",
        failureReason:
          "DevelopmentRun protected dispatch is fail-closed until canonical admission commits a durable execution-start",
        starts: 0,
        denials: 0,
        dispatchDenials: 0,
        receipts: 0,
        continuations: 0,
      });
      expect(await getRunnerCommandFrameCount(firstServer.child)).toBe(0);
      return;
    }
    expect(
      workerResultRows,
      `worker stderr=${worker.stderr}; stdout=${worker.stdout}`
    ).toEqual([{ jobId: created.jobId, state: "deferred" }]);
    if (crashMode === "cancellation" || crashMode === "approval-cancellation") {
      await waitFor(async () => {
        try { return await readFile(workspaceCancelMarker, "utf8"); } catch { return null; }
      }, 10_000).catch(async error => {
        const status = await runtime!.createJobControlPlane().getStatus(created.jobId, { tenantId: scope.tenantId });
        const events = await sql`SELECT "eventType", "payloadJson"->>'errorCode' AS "errorCode" FROM worker_job_events WHERE "workerJobId" = ${created.jobId} ORDER BY sequence`;
        throw new Error(`${String(error)} status=${JSON.stringify({ status: status?.status, errorCode: status?.errorCode, operatorReviewRequired: status?.operatorReviewRequired })} events=${JSON.stringify(events)} runner=${runnerOutput.join(" ").slice(-2000)} warnings=${runnerWarnings.join(" ").slice(-2000)}`);
      });
      if (crashMode === "approval-cancellation") {
        const status = await runtime.createJobControlPlane().getStatus(created.jobId, {
          tenantId: scope.tenantId,
          requestedByUserId: scope.userId,
        });
        const progress = status?.progress && typeof status.progress === "object" ? status.progress as Record<string, unknown> : {};
        const externalWait = progress.externalWait && typeof progress.externalWait === "object" ? progress.externalWait as Record<string, unknown> : {};
        const metadata = externalWait.metadata && typeof externalWait.metadata === "object" ? externalWait.metadata as Record<string, unknown> : {};
        const correlation = {
          jobId: created.jobId,
          tenantId: scope.tenantId,
          operationKey: externalWait.operationKey,
          provider: "codex",
          providerRequestId: metadata.commandId,
          runnerId: metadata.runnerId,
          runnerSessionId: metadata.runnerSessionId,
          capabilitySnapshotId: metadata.capabilitySnapshotId,
          capabilitySnapshotRevision: metadata.capabilitySnapshotRevision,
          fencingVersion: status?.lease?.fencingVersion,
          actionId: `approval-cancel-${crypto.randomUUID()}`,
          requesterId: scope.userId,
          semanticState: { operation: "cancel", profile: "isolated-non-production" },
        };
        if (!status || !externalWait.operationKey || !metadata.commandId || !metadata.runnerId
          || !metadata.runnerSessionId || !metadata.capabilitySnapshotId || !metadata.capabilitySnapshotRevision
          || !Number.isSafeInteger(correlation.fencingVersion)) {
          throw new Error(`SPEC224_CANCEL_BINDING_NOT_PERSISTED:${JSON.stringify({ status: status?.status, externalWait, metadata, lease: status?.lease })}`);
        }
        const repoRoot = path.resolve(process.cwd(), "../..");
        const pythonResult = await execFileAsync(
          process.env.SPEC224_PYTHON_EXECUTABLE!,
          ["-c", pythonApprovalCancellationScript, scope.tenantId, created.jobId, String(scope.userId), JSON.stringify(correlation)],
          {
            cwd: path.join(repoRoot, "python-backend"),
            env: {
              ...process.env,
              DATABASE_URL: process.env.PYTHON_DATABASE_URL!,
              PYTHONPATH: path.join(repoRoot, "python-backend"),
              DEBUG: "false",
            },
            timeout: 20_000,
          },
        );
        const resultLine = pythonResult.stdout.trim().split(/\r?\n/).reverse().find(line => line.startsWith("{"));
        if (!resultLine) throw new Error(`SPEC224_PYTHON_CANCELLATION_RESULT_MISSING:${pythonResult.stderr}`);
        const approvalResult = JSON.parse(resultLine) as { approvalRequestId: string; status: string; deliveryId: string; duplicateStable?: boolean };
        expect(approvalResult.status).toBe("cancelled");
        expect(approvalResult.duplicateStable).toBe(true);
        createdApprovalIds.push(approvalResult.approvalRequestId);

        const authority = runtime.createSpec224ExternalApprovalAuthority();
        const approvalPreflight = await authority.get(approvalResult.approvalRequestId, {
          tenantId: scope.tenantId,
          jobId: created.jobId,
          operationId: String(correlation.operationKey),
        });
        expect(approvalPreflight?.status).toBe("cancelled");
        const crashedReconciler = await runApprovalReconcilerProcess({
          workerId: `spec224-d349-${scope.tenantId}`,
          leaseSeconds: 5,
          killAfterPythonAck: true,
        });
        expect(crashedReconciler.signal).toBe("SIGKILL");
        expect(crashedReconciler.stdout).toContain("SPEC224_PYTHON_ACK_DURABLE");
        const afterLostAck = await sql`
          SELECT extra_data->'spec224DecisionDeliveryV1'->>'state' AS state
          FROM approval_requests WHERE id = ${approvalResult.approvalRequestId}
        `;
        expect(afterLostAck[0]?.state).toBe("acknowledged");
        const [beforeRecoveryAckEvent] = await sql`
          SELECT COUNT(*)::int AS count FROM worker_job_events
          WHERE "workerJobId" = ${created.jobId} AND "eventType" = 'APPROVAL_DELIVERY_ACKNOWLEDGED'
        `;
        expect(beforeRecoveryAckEvent.count).toBe(0);
        await new Promise(resolve => setTimeout(resolve, 5_200));
        const recoveredReconciler = await runApprovalReconcilerProcess({
          workerId: `spec224-d349-restart-${scope.tenantId}`,
          leaseSeconds: 5,
        });
        expect(recoveredReconciler.exitCode, recoveredReconciler.stderr).toBe(0);
        const recoveredResultMatch = recoveredReconciler.stdout.match(/SPEC224_RECONCILE_RESULT:(\{[^\n]+\})/);
        expect(recoveredResultMatch?.[1]).toBeTruthy();
        const approvalReconcile = JSON.parse(recoveredResultMatch![1]) as Record<string, number>;
        const approvalAfterReconcile = await sql`
          SELECT extra_data->'spec224DecisionDeliveryV1'->>'state' AS state,
                 extra_data->'spec224DecisionDeliveryV1'->'receipt'->>'result' AS result
          FROM approval_requests WHERE id = ${approvalResult.approvalRequestId}
        `;
        const approvalEventsAfterReconcile = await sql`
          SELECT "eventType" FROM worker_job_events WHERE "workerJobId" = ${created.jobId}
            AND "eventType" IN ('CANCEL_REQUESTED', 'APPROVAL_DELIVERY_RECONCILED', 'APPROVAL_DELIVERY_ACKNOWLEDGED')
          ORDER BY sequence
        `;
        expect(approvalReconcile, `persisted=${JSON.stringify(approvalAfterReconcile)} events=${JSON.stringify(approvalEventsAfterReconcile)}`).toMatchObject({ claimed: 1, duplicate: 1, errors: 0, operatorReview: 0 });
        const cancellationStatus = await runtime.createJobControlPlane().getStatus(created.jobId, { tenantId: scope.tenantId });
        expect(cancellationStatus?.status).toBe("waiting_external");
        const [cancelRequestEvent] = await sql`
          SELECT COUNT(*)::int AS count FROM worker_job_events
          WHERE "workerJobId" = ${created.jobId} AND "eventType" = 'CANCEL_REQUESTED'
        `;
        expect(cancelRequestEvent.count).toBe(1);
        const [approvalDelivery] = await sql`
          SELECT extra_data->'spec224DecisionDeliveryV1'->>'state' AS state
          FROM approval_requests WHERE id = ${approvalResult.approvalRequestId}
        `;
        expect(approvalDelivery?.state).toBe("acknowledged");
      } else {
        const cancellationRequested = await runtime.createJobControlPlane().requestCancel(
          created.jobId, "spec224_cancellation_e2e", undefined, scope.userId,
          { tenantId: scope.tenantId, requestedByUserId: scope.userId },
        );
        expect(cancellationRequested).toBe(true);
        await expect(runtime.createJobControlPlane().requestCancel(
          created.jobId, "spec224_cancellation_e2e", undefined, scope.userId,
          { tenantId: scope.tenantId, requestedByUserId: scope.userId },
        )).resolves.toBe(true);
      }
      const [cancelOutbox] = await sql`
        SELECT id FROM worker_job_outbox
        WHERE "workerJobId" = ${created.jobId} AND "dedupeKey" LIKE 'runner-cancel:%'
      `;
      expect(cancelOutbox?.id).toBeTruthy();
      const cancelPublication = await runtime.publishJobOutboxRow(
        cancelOutbox.id,
        new runtime.PostgresPullJobTransportAdapter(),
        new Date(),
        async command => {
          const response = await fetch(`${origin}/api/internal/runners/${encodeURIComponent(runnerId)}/job-command`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-internal-token": internalToken },
            body: JSON.stringify(command),
          });
          const body = await response.json().catch(() => ({})) as Record<string, unknown>;
          if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "RUNNER_CANCEL_DISPATCH_FAILED");
          return body as Awaited<ReturnType<typeof runtime.dispatchRunnerJobCommand>>;
        },
      );
      const [cancelDeliveryDiagnostic] = await sql`SELECT "failedReason", "publishAttempts", "quarantinedAt" FROM worker_job_outbox WHERE id = ${cancelOutbox.id}`;
      expect(cancelPublication.state, JSON.stringify(cancelDeliveryDiagnostic)).toBe("published");
      await waitFor(async () => {
        const status = await runtime!.createJobControlPlane().getStatus(created.jobId, { tenantId: scope.tenantId });
        return status?.status === "cancelled" ? status : null;
      }, 10_000).catch(async error => {
        const status = await runtime!.createJobControlPlane().getStatus(created.jobId, { tenantId: scope.tenantId });
        const events = await sql`SELECT "eventType", "payloadJson"->>'errorCode' AS "errorCode", "payloadJson"->>'status' AS "receiptStatus", "payloadJson"->>'reason' AS reason FROM worker_job_events WHERE "workerJobId" = ${created.jobId} ORDER BY sequence`;
        throw new Error(`${String(error)} status=${JSON.stringify({ status: status?.status, errorCode: status?.errorCode, operatorReviewRequired: status?.operatorReviewRequired })} events=${JSON.stringify(events)} runner=${runnerOutput.join(" ").slice(-2000)} warnings=${runnerWarnings.join(" ").slice(-3000)}`);
      });
      const [cancelEvidence] = await sql`
        SELECT j.status,
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_CANCEL_INTENT')::int AS intents,
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_CANCEL_DISPATCHED')::int AS dispatches,
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_CANCEL_ACKNOWLEDGED')::int AS receipts,
          COUNT(*) FILTER (WHERE e."eventType" = 'CANCELLED')::int AS settlements,
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS executions
        FROM worker_jobs j LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
        WHERE j.id = ${created.jobId} GROUP BY j.status
      `;
      expect(cancelEvidence).toEqual({ status: "cancelled", intents: 1, dispatches: 1, receipts: 1, settlements: 1, executions: 0 });
      if (crashMode === "approval-cancellation") {
        const [approvalEvents] = await sql`
          SELECT COUNT(*) FILTER (WHERE "eventType" = 'APPROVAL_DELIVERY_ACKNOWLEDGED')::int AS acks,
                 COUNT(*) FILTER (WHERE "eventType" = 'APPROVAL_DELIVERY_RECONCILED')::int AS reconciled,
                 COUNT(*) FILTER (WHERE "eventType" = 'RUNNER_CANCEL_INTENT')::int AS intents,
                 COUNT(*) FILTER (WHERE "eventType" = 'RUNNER_CANCEL_ACKNOWLEDGED')::int AS receipts,
                 COUNT(*) FILTER (WHERE "eventType" = 'CANCELLED')::int AS terminal
          FROM worker_job_events WHERE "workerJobId" = ${created.jobId}
        `;
        expect(approvalEvents).toEqual({ acks: 1, reconciled: 1, intents: 1, receipts: 1, terminal: 1 });
      }
      const developmentContinuation = await runtime.reconcileSpec224RunnerContinuations({ limit: 100 });
      expect(developmentContinuation.reviewRequired).toBe(0);
      return;
    }
    let crashEvidence: Record<string, unknown> | null = null;
    let continuationReconciledBeforeFinal = false;
    if (
      crashMode === "disconnect-before-ack" ||
      crashMode === "sigkill-after-persist" ||
      crashMode === "sigkill-after-ack"
    ) {
      crashEvidence = await waitForServerMessage(
        firstServer.child,
        message => message.type === "failpoint"
      );
      expect(crashEvidence.receiptEventId).toBeTruthy();
    }

    if (crashMode === "sigkill-after-persist") {
      const [beforeRestart] = await sql`
        SELECT j.status,
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS receipts,
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_CONTINUATION_PENDING')::int AS intents,
          COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements
        FROM worker_jobs j
        LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
        WHERE j.id = ${created.jobId} GROUP BY j.status
      `;
      expect(beforeRestart).toEqual({
        status: "waiting_external",
        receipts: 1,
        intents: 1,
        settlements: 0,
      });
      await killControlServer(firstServer.child);
      await stopRunner();
      const restarted = await startControlServer({ internalToken });
      process.env.RUNNER_CONTROL_PLANE_ORIGIN = restarted.origin;
      restarted.child.send?.({ type: "reconcile-now" });
      const recovered = await waitForServerMessage(
        restarted.child,
        message => message.type === "reconciled"
      );
      expect(recovered.result).toMatchObject({
        reconciled: 1,
        reviewRequired: 0,
      });
      continuationReconciledBeforeFinal = true;
      runnerInput.controlUrl = `${restarted.origin}/api/runners/${encodeURIComponent(runnerId)}/control`;
      await startRunner({
        ...runnerInput,
        previousRevision: secondSnapshot.currentSnapshot?.revision,
      });
      await waitFor(async () => {
        try {
          const records = JSON.parse(
            await readFile(path.join(dataRoot, "runner-receipts.json"), "utf8")
          ) as unknown[];
          return records.length === 0 ? records : null;
        } catch {
          return null;
        }
      });
    } else if (crashMode === "sigkill-after-ack") {
      await waitFor(async () => {
        try {
          const records = JSON.parse(
            await readFile(path.join(dataRoot, "runner-receipts.json"), "utf8")
          ) as unknown[];
          return records.length === 0 ? records : null;
        } catch {
          return null;
        }
      });
      const [beforeRestart] = await sql`
        SELECT j.status,
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS receipts,
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_CONTINUATION_PENDING')::int AS intents,
          COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements,
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_PHASE_COMPLETED')::int AS transitions
        FROM worker_jobs j
        LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
        WHERE j.id = ${created.jobId} GROUP BY j.status
      `;
      expect(beforeRestart).toEqual({
        status: "succeeded",
        receipts: 1,
        intents: 1,
        settlements: 1,
        transitions: 0,
      });
      await killControlServer(firstServer.child);
      await stopRunner();
      const restarted = await startControlServer({
        internalToken,
        reconcileOnStart: true,
      });
      process.env.RUNNER_CONTROL_PLANE_ORIGIN = restarted.origin;
      await startRunner({
        ...runnerInput,
        controlUrl: `${restarted.origin}/api/runners/${encodeURIComponent(runnerId)}/control`,
        previousRevision: secondSnapshot.currentSnapshot?.revision,
      });
      const recovered = await waitForServerMessage(
        restarted.child,
        message => message.type === "reconciled"
      );
      expect(recovered.result).toMatchObject({
        reconciled: 1,
        reviewRequired: 0,
      });
      continuationReconciledBeforeFinal = true;
    } else if (
      crashMode === "disconnect-before-ack" ||
      crashMode === "lost-ack-resend"
    ) {
      await waitFor(async () => {
        const status = await runtime!
          .createJobControlPlane()
          .getStatus(created.jobId, { tenantId: scope.tenantId });
        return status?.status === "succeeded" ||
          runnerProcess?.exitCode !== null
          ? { status: status?.status, runnerExitCode: runnerProcess?.exitCode }
          : null;
      }).catch(async error => {
        const status = await runtime!
          .createJobControlPlane()
          .getStatus(created.jobId, { tenantId: scope.tenantId });
        const events = await sql`
          SELECT "eventType", "payloadJson" FROM worker_job_events
          WHERE "workerJobId" = ${created.jobId} ORDER BY sequence
        `;
        throw new Error(
          `${String(error)} status=${JSON.stringify(status)} events=${JSON.stringify(events)} runner=${runnerOutput.join("").slice(-5000)}`
        );
      });
      await waitFor(async () => {
        const status = await runtime!
          .createJobControlPlane()
          .getStatus(created.jobId, { tenantId: scope.tenantId });
        return status?.status === "succeeded" ? status : null;
      });
      const beforeReconnect = await sql`
        SELECT j.status,
          COUNT(*) FILTER (WHERE e."eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS receipts,
          COUNT(*) FILTER (WHERE e."eventType" = 'SPEC224_CONTINUATION_PENDING')::int AS intents,
          COUNT(*) FILTER (WHERE e."eventType" = 'COMPLETED')::int AS settlements
        FROM worker_jobs j
        LEFT JOIN worker_job_events e ON e."workerJobId" = j.id
        WHERE j.id = ${created.jobId} GROUP BY j.status
      `;
      expect(beforeReconnect[0]).toEqual({
        status: "succeeded",
        receipts: 1,
        intents: 1,
        settlements: 1,
      });
      const continued = await runtime.reconcileSpec224RunnerContinuations({
        limit: 100,
      });
      expect(continued).toMatchObject({ reconciled: 1, reviewRequired: 0 });
      continuationReconciledBeforeFinal = true;
      await stopRunner();
      await startRunner({
        ...runnerInput,
        previousRevision: secondSnapshot.currentSnapshot?.revision,
      });
      await waitFor(async () => {
        try {
          const records = JSON.parse(
            await readFile(path.join(dataRoot, "runner-receipts.json"), "utf8")
          ) as unknown[];
          return records.length === 0 ? records : null;
        } catch {
          return null;
        }
      });
    }
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
        `${error instanceof Error ? error.message : String(error)}; finalStatus=${JSON.stringify({ status: status?.status, errorCode: status?.errorCode, operatorReviewRequired: status?.operatorReviewRequired })}; events=${JSON.stringify(events.map(event => ({ eventType: event.eventType, payload: event.payloadJson })))}; runnerOutput=${runnerOutput.join("").slice(-6000)}; runnerWarnings=${runnerWarnings.join(" | ").slice(-6000)}`
      );
    }
    expect(terminal.status).toBe("succeeded");
    if (crashMode === "baseline") expect(runnerProcess?.exitCode).toBeNull();
    const [receiptAndIntent] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE "eventType" = 'RUNNER_EXECUTION_COMPLETED')::int AS receipts,
        COUNT(*) FILTER (WHERE "eventType" = 'SPEC224_CONTINUATION_PENDING')::int AS intents,
        COUNT(*) FILTER (WHERE "eventType" = 'COMPLETED')::int AS settlements
      FROM worker_job_events WHERE "workerJobId" = ${created.jobId}
    `;
    expect(receiptAndIntent).toEqual({
      receipts: 1,
      intents: 1,
      settlements: 1,
    });
    const receiptCorrelation = await sql`
      SELECT
        receipt."payloadJson"->>'eventId' AS "receiptEventId",
        intent."payloadJson"->>'receiptEventId' AS "intentReceiptEventId",
        receipt."payloadJson"->>'commandId' AS "receiptCommandId",
        intent."payloadJson"->>'commandId' AS "intentCommandId",
        intent."payloadJson"->>'operationId' AS "operationId",
        COUNT(transition.id)::int AS transitions
      FROM worker_job_events receipt
      JOIN worker_job_events intent
        ON intent."workerJobId" = receipt."workerJobId"
       AND intent."eventType" = 'SPEC224_CONTINUATION_PENDING'
      LEFT JOIN worker_job_events transition
        ON transition."workerJobId" = receipt."workerJobId"
       AND transition."eventType" = 'SPEC224_PHASE_COMPLETED'
      WHERE receipt."workerJobId" = ${created.jobId}
        AND receipt."eventType" = 'RUNNER_EXECUTION_COMPLETED'
      GROUP BY receipt."payloadJson", intent."payloadJson"
    `;
    expect(receiptCorrelation).toHaveLength(1);
    expect(receiptCorrelation[0]).toMatchObject({
      receiptEventId: receiptCorrelation[0]?.intentReceiptEventId,
      receiptCommandId: receiptCorrelation[0]?.intentCommandId,
      transitions: 1,
    });
    expect(receiptCorrelation[0]?.operationId).toMatch(/^[a-f0-9]{64}$/);
    const continuation = await runtime.reconcileSpec224RunnerContinuations({
      limit: 100,
    });
    if (continuation.reviewRequired > 0) {
      const [diagnostic] = await sql`
        SELECT e."payloadJson" AS review,
          j."progressJson"->'spec224' AS projection,
          j."fencingVersion" AS "jobFence",
          a."leaseGeneration" AS "attemptFence",
          a.id AS "attemptId"
        FROM worker_job_events e
        JOIN worker_jobs j ON j.id = e."workerJobId"
        LEFT JOIN worker_job_attempts a ON a."workerJobId" = j.id AND a.attempt = j.attempt
        WHERE e."workerJobId" = ${created.jobId}
          AND e."eventType" = 'SPEC224_CONTINUATION_REVIEW_REQUIRED'
        ORDER BY e.sequence DESC LIMIT 1
      `;
      throw new Error(
        `Runner continuation requires review: ${JSON.stringify({ continuation, diagnostic })}`
      );
    }
    expect(continuation).toMatchObject({
      reconciled: continuationReconciledBeforeFinal ? 0 : 1,
      reviewRequired: 0,
    });
    const projectedRun = await runtime
      .createDevelopmentRunService(
        runtime.defaultDevelopmentRunPersistenceAdapter
      )
      .get({ runId, tenantId: scope.tenantId, actorId: scope.userId });
    expect(projectedRun.run.state).toBe("PLANNING");
    const continuationReplay =
      await runtime.reconcileSpec224RunnerContinuations({
        limit: 100,
      });
    expect(continuationReplay).toMatchObject({
      reconciled: 0,
      reviewRequired: 0,
    });
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

afterEach(async () => {
  await stopRunner();
  if (controlServer) await killControlServer(controlServer);
  await stopPythonApprovalServer();
});

afterAll(async () => {
  if (originalConsoleWarn) console.warn = originalConsoleWarn;
  await stopRunner();
  await stopPythonApprovalServer();
  for (const jobId of createdJobs) await deleteJobRows(jobId);
  for (const approvalId of createdApprovalIds) {
    await sql`DELETE FROM approval_responses WHERE request_id = ${approvalId}`;
    await sql`DELETE FROM approval_requests WHERE id = ${approvalId}`;
  }
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
  for (const root of allDataRoots)
    await rm(root, { recursive: true, force: true });
  await sql.end();
});
