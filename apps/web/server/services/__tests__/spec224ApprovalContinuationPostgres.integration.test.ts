import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true"
  && Boolean(process.env.PYTHON_BACKEND_URL)
  && Boolean(process.env.SMARTSPEC_WEB_GATEWAY_TOKEN)
  && Boolean(process.env.PYTHON_DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const dbUrl = process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const pythonUrl = process.env.PYTHON_DATABASE_URL ?? "postgresql+asyncpg://localhost/spec224_skipped_test";
const sql = postgres(dbUrl, { max: 4 });
const ownerDecisionScript = `
import asyncio, json, os, sys
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.services.approval_db_service import ApprovalDBService

async def main():
    approval_ref, tenant_id, approver_id = sys.argv[1], sys.argv[2], int(sys.argv[3])
    engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            request = await ApprovalDBService(session).submit_decision(
                approval_ref, approver_id, "approved", tenant_id=tenant_id
            )
            print(json.dumps({"requestId": request.request_id, "decision": request.decision}))
    finally:
        await engine.dispose()

asyncio.run(main())
`;

const tenantId = process.env.SPEC224_E2E_TENANT_ID ?? randomUUID();
const scopeId = randomUUID();
let requesterId = 0;
let approverId = Number.parseInt(process.env.SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID ?? "", 10) || 0;
let jobId = "";
let approvalRef = "";
let runnerId = "";
let controlPlane: any;
let reconciler: any;

suite("Spec 224 Python approval to Node continuation — PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    const [{ createJobControlPlane }, contracts, approval, runnerGateway, runnerAuth, runnerSessionContracts] = await Promise.all([
      import("../jobControlPlane"),
      import("../agentControlPlaneContracts"),
      import("../spec224ApprovalContinuation"),
      import("../runnerGateway"),
      import("../runnerAuthService"),
      import("../runnerSessionContracts"),
    ]);
    controlPlane = createJobControlPlane();
    if (!approverId) throw new Error("SPEC224_TEST_APPROVER_REQUIRED");
    const [tenant] = await sql`SELECT id FROM tenants WHERE id = ${tenantId}`;
    if (!tenant) await sql`INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`spec224-${scopeId}-slug`}, 'Spec 224 Approval E2E', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())`;
    const [approver] = await sql`SELECT id FROM users WHERE id = ${approverId} AND role = 'admin'`;
    if (!approver) throw new Error("SPEC224_TEST_APPROVER_NOT_ADMIN");
    const [requester] = await sql`INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`spec224-${scopeId}-requester`}, 'user', 'free', 0, false) RETURNING id`;
    requesterId = Number(requester.id);
    runnerId = `runner-${scopeId}`;
    const deviceId = `device-${scopeId}`;
    const machineFingerprint = `machine-${scopeId}`;
    const keyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const sessionController = new runnerSessionContracts.RunnerSessionController();
    const runnerSession = sessionController.start({
      runnerId,
      tenantId,
      deviceId,
      ownerUserId: approverId,
      ttlMs: 120_000,
    });
    sessionController.approve({
      runnerSessionId: runnerSession.runnerSessionId,
      nonce: runnerSession.nonce,
      ownerUserId: approverId,
      tenantId,
    });
    const registrationToken = runnerAuth.createRunnerRegistrationToken({
      runnerId,
      tenantId,
      profile: "local_device",
      nodeKind: "local_device",
      ownerUserId: approverId,
      deviceBinding: { deviceId, machineFingerprint, publicKey: keyPair.publicKey },
    });
    const registrationAuth = await runnerAuth.verifyRunnerRegistrationToken(registrationToken);
    await runnerGateway.defaultRunnerGateway.enroll({
      auth: registrationAuth,
      deviceId,
      displayName: "Spec 224 approval continuation test Runner",
      ownerUserId: approverId,
    });
    await runnerGateway.defaultRunnerGateway.bindSession({
      runnerId,
      tenantId,
      ownerUserId: approverId,
      runnerSessionId: runnerSession.runnerSessionId,
    });
    const controlToken = runnerAuth.createRunnerControlToken({
      runnerId,
      tenantId,
      profile: "local_device",
      nodeKind: "local_device",
      runnerSessionId: runnerSession.runnerSessionId,
      deviceBinding: { deviceId, machineFingerprint, publicKey: keyPair.publicKey },
    });
    const runnerControlAuth = await runnerAuth.verifyRunnerControlToken(controlToken, {
      runnerId,
      tenantId,
      requiredScopes: ["runner:capabilities"],
    });
    // Rust Runner IDs are semantic strings, not the DB row's UUID primary key.
    const capabilitySnapshotId = `capability:${runnerId}:${scopeId}`;
    const capabilitySnapshotRevision = "d341-test-v1";
    const workspaceId = `workspace-${scopeId}`;
    const observedAt = new Date();
    await runnerGateway.defaultRunnerGateway.publishCapabilities({
      auth: runnerControlAuth,
      idempotencyKey: `spec224-approval-snapshot:${scopeId}`,
      snapshot: {
        runnerId,
        tenantId,
        runnerSessionId: runnerSession.runnerSessionId,
        capabilitySnapshotId,
        revision: capabilitySnapshotRevision,
        observedAt: observedAt.toISOString(),
        expiresAt: new Date(observedAt.getTime() + 120_000).toISOString(),
        capabilities: ["workspace.read"],
        workspaceIds: [workspaceId],
        resourceClass: "small",
      },
    });
    const [snapshotIdentity] = await sql`SELECT id, "snapshotJson"->>'capabilitySnapshotId' AS capability_id
      FROM runner_capability_snapshots WHERE "runnerId" = ${runnerId}`;
    expect(snapshotIdentity.capability_id).toBe(capabilitySnapshotId);
    expect(snapshotIdentity.id).not.toBe(capabilitySnapshotId);
    const providerRequestId = `provider-${scopeId}`;
    const operationKey = `spec224-approval:${scopeId}`;
    const runnerSessionId = runnerSession.runnerSessionId;
    const created = await controlPlane.create(contracts.buildAgentJobDefinition({
      taskId: `task-${scopeId}`,
      tenantId,
      actorId: requesterId,
      goalId: `goal-${scopeId}`,
      planId: `plan-${scopeId}`,
      planRevision: 1,
      provider: "codex",
      runtime: "local_runner",
      workspaceId,
      contextPackageIds: [],
      skillIds: ["spec224-approval-test"],
      mcpGrantIds: [],
      requestedCapabilities: ["workspace.read"],
      policyBinding: {
        runnerId,
        runnerSessionId: runnerSession.runnerSessionId,
        capabilitySnapshotId,
        capabilitySnapshotRevision,
        authorizationGrantRef: `test-binding:${scopeId}`,
        approvalRef: `approval-${scopeId}`,
        budgetReservationRef: `budget-${scopeId}`,
        budgetCapMinorUnits: 100_000,
        currency: "USD",
        workspaceRef: workspaceId,
        deadline: new Date(Date.now() + 120_000).toISOString(),
      },
    }));
    expect(created.created).toBe(true);
    jobId = created.jobId;
    const lease = await controlPlane.claim({ jobId, runnerId, adapter: "postgres-pull" });
    expect(lease).toBeTruthy();
    await controlPlane.start(lease);
    await controlPlane.waitForExternal(lease, {
      operationKey,
      resumeAfter: new Date(Date.now() + 60_000).toISOString(),
      metadata: {
        commandId: providerRequestId,
        runnerId,
        runnerSessionId,
        capabilitySnapshotId,
        capabilitySnapshotRevision,
      },
    });
    const authority = approval.createSpec224ExternalApprovalAuthority();
    const continuation = approval.createSpec224ApprovalContinuation({ authority, controlPlane });
    const requested = await continuation.request({
      jobId,
      tenantId,
      operationKey,
      provider: "codex",
      providerRequestId,
      runnerId,
      runnerSessionId: runnerSession.runnerSessionId,
      capabilitySnapshotId,
      capabilitySnapshotRevision,
      fencingVersion: lease.fencingVersion,
      actionId: `action-${scopeId}`,
      requesterId,
      semanticState: { tool: "workspace.read", scope: "loopback-certification" },
    });
    approvalRef = requested.approvalRef;
    const durableStatus = await controlPlane.getStatus(jobId);
    expect(durableStatus?.status).toBe("waiting_external");
    expect((durableStatus?.progress.externalWait as any)?.metadata?.approval?.state).toBe("pending");
    reconciler = approval.createSpec224ApprovalDecisionReconciler(
      { authority, controlPlane },
      { workerId: `d341-reconciler-${scopeId}`, limit: 5 },
    );
  }, 30_000);

  afterAll(async () => {
    if (approvalRef) {
      await sql`DELETE FROM approval_responses WHERE request_id = ${approvalRef}`;
      await sql`DELETE FROM approval_requests WHERE id = ${approvalRef}`;
    }
    if (jobId) {
      await sql`DELETE FROM worker_job_dispatches WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_job_settlements WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
      await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
    }
    if (runnerId) {
      await sql`DELETE FROM runner_capability_snapshots WHERE "runnerId" = ${runnerId}`;
      await sql`DELETE FROM runner_nodes WHERE "runnerId" = ${runnerId}`;
    }
    if (requesterId || approverId)
      await sql`DELETE FROM users WHERE id = ${requesterId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await sql.end();
  });

  it("claims the Python decision, resumes the canonical job once, persists events/outbox, and ACKs", async () => {
    const repoRoot = process.cwd().replace(/\/apps\/web$/, "");
    const decided = await execFileAsync(
      `${repoRoot}/python-backend/.venv/bin/python`,
      ["-c", ownerDecisionScript, approvalRef, tenantId, String(approverId)],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_URL: pythonUrl,
          PYTHONPATH: `${repoRoot}/python-backend`,
          DEBUG: "false",
        },
      },
    );
    const decisionJson = decided.stdout.trim().split(/\r?\n/)
      .reverse().find(line => line.startsWith("{") && line.endsWith("}"));
    expect(decisionJson).toBeTruthy();
    expect(JSON.parse(decisionJson!)).toMatchObject({ requestId: approvalRef, decision: "approved" });

    const reconciled = await reconciler();
    expect(reconciled).toMatchObject({ claimed: 1, resumed: 1, errors: 0 });
    const status = await controlPlane.getStatus(jobId);
    expect(status?.status).toBe("queued");

    const evidence = await sql`
      SELECT "eventType" FROM worker_job_events
      WHERE "workerJobId" = ${jobId}
        AND "eventType" IN ('APPROVAL_RESOLVED', 'APPROVAL_DELIVERY_ACKNOWLEDGED', 'DISPATCH_REQUESTED')
    `;
    expect(evidence.map((row: any) => row.eventType)).toEqual(expect.arrayContaining([
      "APPROVAL_RESOLVED",
      "APPROVAL_DELIVERY_ACKNOWLEDGED",
      "DISPATCH_REQUESTED",
    ]));
    const [outbox] = await sql`SELECT count(*)::int AS count FROM worker_job_outbox
      WHERE "workerJobId" = ${jobId} AND "dedupeKey" LIKE '%:approval-resume:%'`;
    expect(outbox.count).toBe(1);
    const [persisted] = await sql`SELECT extra_data->'spec224DecisionDeliveryV1'->>'state' AS state
      FROM approval_requests WHERE id = ${approvalRef}`;
    expect(persisted.state).toBe("acknowledged");

    expect(await reconciler()).toMatchObject({ claimed: 0, resumed: 0, errors: 0 });
    const [deliveryEvents] = await sql`SELECT count(*)::int AS count FROM worker_job_events
      WHERE "workerJobId" = ${jobId} AND "eventType" IN ('APPROVAL_RESOLVED', 'APPROVAL_DELIVERY_ACKNOWLEDGED')`;
    expect(deliveryEvents.count).toBe(2);
  }, 30_000);
});
