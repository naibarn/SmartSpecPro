import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { provisionSpec224EconomicTestBudget } from "./helpers/spec224EconomicTestProvisioning";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const target = new URL(databaseUrl);
if (enabled && (!/^(localhost|127\.0\.0\.1)$/.test(target.hostname) || !/^spec224_[a-z0-9_-]*_test$/i.test(target.pathname.slice(1))))
  throw new Error("SPEC224_DISPOSABLE_DATABASE_REQUIRED");
process.env.DATABASE_URL = databaseUrl;
const sql = postgres(databaseUrl, { max: 8 });
const suite = enabled ? describe : describe.skip;
const execFileAsync = promisify(execFile);
const createGoalApprovalScript = `
import asyncio, json, os, sys
from types import SimpleNamespace
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.api.approvals import Spec224GoalGrantApprovalCreate, create_spec224_goal_grant_approval
async def main():
    tenant_id, actor_id, project_id, goal_id, payload = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], json.loads(sys.argv[5])
    engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            request = await create_spec224_goal_grant_approval(Spec224GoalGrantApprovalCreate(project_id=project_id, goal_id=goal_id, payload=payload), SimpleNamespace(id=actor_id), tenant_id, session)
            print(json.dumps({"id": request.id, "status": request.status.value}))
    finally:
        await engine.dispose()
asyncio.run(main())
`;
const approveGoalScript = `
import asyncio, json, os, sys
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.services.approval_db_service import ApprovalDBService
async def main():
    approval_ref, tenant_id, approver_id = sys.argv[1], sys.argv[2], int(sys.argv[3])
    engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            request = await ApprovalDBService(session).submit_decision(approval_ref, approver_id, "approved", tenant_id=tenant_id)
            print(json.dumps({"requestId": request.request_id, "decision": request.decision}))
    finally:
        await engine.dispose()
asyncio.run(main())
`;

async function runApprovalAuthorityScript(script: string, args: string[]) {
  const pythonRoot = resolve(process.cwd(), "../../python-backend");
  const result = await execFileAsync("uv", ["run", "--project", pythonRoot, "python", "-c", script, ...args], {
    cwd: pythonRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl.replace(/^postgresql:/, "postgresql+asyncpg:"), DEBUG: "false" },
    maxBuffer: 2 * 1024 * 1024,
  });
  const jsonLine = result.stdout.trim().split(/\r?\n/).reverse().find(line => line.trim().startsWith("{"));
  if (!jsonLine) throw new Error("SPEC224_APPROVAL_AUTHORITY_TEST_RESPONSE_INVALID");
  return JSON.parse(jsonLine) as Record<string, string>;
}

async function setup(limit = 200, options: { approved?: boolean; withApprover?: boolean } = {}) {
  const tenantId = randomUUID(), runId = randomUUID(), goalId = randomUUID(), approvalRef = randomUUID();
  const runnerId = `runner-${randomUUID()}`, sessionId = `session-${randomUUID()}`, snapshotId = randomUUID();
  const workspaceId = `workspace-${randomUUID()}`, revision = `rev-${randomUUID()}`;
  const expires = new Date(Date.now() + 600_000), observed = new Date(Date.now() - 1_000);
  const [user] = await sql`INSERT INTO users ("openId", role, plan, credits, "isDisabled") VALUES (${randomUUID()}, 'user', 'free', 0, false) RETURNING id`;
  const actorId = Number(user.id);
  const approverRows = options.withApprover ? await sql`INSERT INTO users ("openId", role, plan, credits, "isDisabled") VALUES (${randomUUID()}, 'admin', 'free', 0, false) RETURNING id` : [];
  const approverId = approverRows.length ? Number(approverRows[0].id) : null;
  await sql`INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt") VALUES (${tenantId}, ${randomUUID()}, 'Disposable bridge', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())`;
  const snapshot = { runnerId, tenantId, runnerSessionId: sessionId, capabilitySnapshotId: snapshotId, revision,
    observedAt: observed.toISOString(), expiresAt: expires.toISOString(), capabilities: ["agent.external_task"], workspaceIds: [workspaceId], resourceClass: "medium",
    workspaces: [{ workspaceId, projectId: "project-test", repositoryId: "repo-test", displayName: "Test", gitHead: "a".repeat(40), gitBranch: "main", dirty: false, dirtyPaths: [], contentFingerprint: "b".repeat(64) }],
    toolInventory: [{ toolId: "codex", kind: "agent_cli", displayName: "Codex", version: "test", adapterId: "codex.v1", adapterVersion: "1", discoverySource: "runner_probe", installState: "installed", configurationState: "configured", authState: "authenticated", healthState: "healthy", availabilityState: "available", trustState: "ready", fingerprint: "test", authorizationEvidenceRef: "auth-test", observedAt: observed.toISOString(), expiresAt: expires.toISOString(), reasonCodes: [], versionProbeState: "passed", taskProbeState: "passed", taskProbeObservedAtMs: observed.getTime(), taskProbeExpiresAtMs: expires.getTime(), taskProbeEvidenceRef: "test-probe" }] };
  await sql`INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", profile, "displayName", "trustState", status, "currentSnapshotRevision", "currentSnapshotJson", "snapshotExpiresAt", "activeSessionId") VALUES (${runnerId}, ${tenantId}, ${actorId}, 'rust_runner', 'development', 'Test runner', 'trusted', 'online', ${revision}, ${sql.json(snapshot)}, ${expires}, ${sessionId})`;
  await sql`INSERT INTO runner_capability_snapshots (id, "runnerId", "tenantId", revision, "idempotencyKey", "observedAt", "expiresAt", "snapshotJson") VALUES (${snapshotId}, ${runnerId}, ${tenantId}, ${revision}, ${randomUUID()}, ${observed}, ${expires}, ${sql.json(snapshot)})`;
  const payload = { kind: "spec224_goal_delegation_grant", provider: "codex", grantId: randomUUID(), goalId, actorId, workspaceId, repositoryRef: "repo:test", sourceSha: "a".repeat(40), allowedActions: ["discover", "plan", "implement", "test", "repair", "verify"], writeScope: ["src/**"], capabilities: ["agent.external_task"], budgetLimitMinorUnits: limit, currency: "USD", issuedAt: observed.toISOString(), expiresAt: expires.toISOString() };
  if (options.approved !== false) await sql`INSERT INTO approval_requests (id, request_type, title, tenant_id, execution_id, requester_id, status, payload, required_approvers, current_approvals, expires_at, created_at) VALUES (${approvalRef}, 'CUSTOM', 'Approved Goal', ${tenantId}, ${goalId}, ${actorId}, 'APPROVED', ${sql.json(payload)}, 1, 1, ${expires}, NOW())`;
  const [{ getDb }, { buildDevelopmentRun }, { createPersistedDevelopmentRun }, { provisionSpec224GoalBudget }] = await Promise.all([
    import("../../db"), import("../spec224DevelopmentRunContracts"), import("../spec224DevelopmentRunPersistence"), import("../economicProvisioningService"),
  ]);
  const db = getDb();
  const accounts = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: runId, limitMinorUnits: limit });
  process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID = accounts.sourceAccountId;
  process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID = accounts.targetAccountId;
  const budget = options.approved === false ? null : await provisionSpec224GoalBudget(db, { tenantId, actorId, goalId, approvalRef });
  const run = buildDevelopmentRun({ runId, goalId, tenantId, actorId, goal: "Implement bounded test", repositoryRef: "repo:test", baseRevision: `git:${"a".repeat(40)}`, contextPackHash: "c".repeat(64), workspaceId,
    metadata: { spec224BudgetCapMinorUnits: 50, spec224GoalGrantPayload: payload,
      spec224Workspace: { runnerId, platformScope: true },
      spec224Execution: { platformScope: true, sourceSnapshotRevision: revision, sourceSha: "a".repeat(40), sourceFingerprint: "b".repeat(64), mode: "prompt", allowedWriteSet: ["src/**"] } } });
  const created = await createPersistedDevelopmentRun({ run, provider: "codex", runtime: "local_runner", planId: `plan-${runId}`, planRevision: 1, skillIds: [], requestedCapabilities: ["agent.external_task"], deferredAdmission: true, authorizationScope: "spec224.development.run" });
  const { defaultSpec224AuthorizationService } = await import("../spec224AuthorizationService");
  // This production entry point is the missing bridge under test.
  const authorize = (defaultSpec224AuthorizationService as unknown as { authorizeDelegatedChild(input: { context: { tenantId: string; actorId: number }; runId: string }): Promise<{ status: string }> }).authorizeDelegatedChild;
  return { tenantId, actorId, approverId, runId, goalId, approvalRef, payload, runnerId, sessionId, snapshotId, revision, budgetId: budget?.budgetId ?? null, jobId: created.jobRef.jobId, expires, authorize };
}

afterAll(async () => { await sql.end(); const { closeDb } = await import("../../db"); await closeDb(); });

async function recordCompletedReceipt(f: Awaited<ReturnType<typeof setup>>) {
  const { createJobControlPlane } = await import("../jobControlPlane");
  const control = createJobControlPlane();
  const lease = await control.claim({ jobId: f.jobId, runnerId: "test-worker", adapter: "postgres-direct" });
  if (!lease) throw new Error("CHILD_ONE_NOT_DISPATCHABLE");
  await control.start(lease);
  const commandId = randomUUID(), operationKey = `external-agent:${f.runId}:1`, leaseId = `lease:${lease.jobId}:${lease.attemptId}`;
  await control.waitForExternal(lease, { operationKey, resumeAfter: f.expires.toISOString(), metadata: { commandId, executionKind: "external_agent_task", runnerId: f.runnerId, runnerSessionId: f.sessionId, capabilitySnapshotId: f.snapshotId, capabilitySnapshotRevision: f.revision, leaseId, fenceVersion: lease.fencingVersion } });
  const receipt = { jobId: f.jobId, commandId, eventId: randomUUID(), eventType: "EXECUTION_COMPLETED" as const, sequence: 1, runnerId: f.runnerId, runnerSessionId: f.sessionId, tenantId: f.tenantId, payload: { attempt: 1, leaseId, fenceVersion: lease.fencingVersion, capabilitySnapshotId: f.snapshotId, capabilitySnapshotRevision: f.revision, resultRef: `result:${f.runId}` } };
  expect(await control.recordRunnerReceipt(receipt)).toBe("recorded");
  return { control, receipt, operationKey };
}

suite("SPEC-224 connected delegated child continuation", () => {
  it("connects Start-persisted Goal, canonical approval, shared budget, Child 1 receipt and automatic Child 2", async () => {
    const f = await setup(10_000, { approved: false, withApprover: true });
    if (!f.approverId) throw new Error("SPEC224_TEST_APPROVER_REQUIRED");
    const requestArgs = [f.tenantId, String(f.actorId), "project-test", f.goalId, JSON.stringify(f.payload)];
    const [created, replay] = await Promise.all([
      runApprovalAuthorityScript(createGoalApprovalScript, requestArgs),
      runApprovalAuthorityScript(createGoalApprovalScript, requestArgs),
    ]);
    expect(created.id).toBe(replay.id);
    expect(created.status).toBe("pending");
    f.approvalRef = created.id;
    const decision = await runApprovalAuthorityScript(approveGoalScript, [f.approvalRef, f.tenantId, String(f.approverId)]);
    expect(decision).toMatchObject({ requestId: f.approvalRef, decision: "approved" });

    const { reconcileSpec224GoalAdmissions, reconcileSpec224RunnerContinuations } = await import("../spec224RunnerContinuationReconciler");
    const admission = await reconcileSpec224GoalAdmissions();
    expect(admission.dispatched).toBe(1);
    const [firstOutbox] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_outbox WHERE "workerJobId" = ${f.jobId}`;
    expect(firstOutbox.count).toBe(1);
    const { control, receipt } = await recordCompletedReceipt(f);
    expect(await control.recordRunnerReceipt(receipt)).toBe("duplicate");
    await Promise.all([reconcileSpec224RunnerContinuations(), reconcileSpec224RunnerContinuations()]);
    const jobs = await sql`SELECT id, status FROM worker_jobs WHERE "tenantId" = ${f.tenantId} AND "inputJson"->'spec224Run'->>'runId' = ${f.runId} ORDER BY "createdAt"`;
    const [proof] = await sql`SELECT COUNT(DISTINCT h.id)::int AS holds, COUNT(DISTINCT h."attemptId")::int AS attempts,
      COUNT(DISTINCT o.id)::int AS outbox FROM economic_holds h JOIN worker_job_outbox o ON o."workerJobId" = h."workerJobId"
      WHERE h."tenantId" = ${f.tenantId}`;
    const [budget] = await sql`SELECT COUNT(*)::int AS count FROM economic_budgets WHERE "tenantId" = ${f.tenantId} AND "scopeType" = 'spec224_goal'`;
    expect(jobs).toHaveLength(2);
    expect(jobs[1].status).toBe("queued");
    expect(jobs[0].id).not.toBe(jobs[1].id);
    expect(proof).toEqual({ holds: 2, attempts: 2, outbox: 2 });
    expect(budget.count).toBe(1);
    const [{ getDb }, { readSpec224GoalBudgetStatus }] = await Promise.all([
      import("../../db"), import("../economicProvisioningService"),
    ]);
    expect(await readSpec224GoalBudgetStatus(getDb(), { tenantId: f.tenantId, goalId: f.goalId })).toMatchObject({
      status: "active", limitMinorUnits: 10_000, currency: "USD",
    });
  }, 90_000);

  it("recovers an approved durable Goal admission through the worker reconciler exactly once", async () => {
    const f = await setup();
    const { reconcileSpec224GoalAdmissions } = await import("../spec224RunnerContinuationReconciler");
    const [first, replay] = await Promise.all([
      reconcileSpec224GoalAdmissions(),
      reconcileSpec224GoalAdmissions(),
    ]);
    const [outbox] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_outbox WHERE "workerJobId" = ${f.jobId}`;
    const [holds] = await sql`SELECT COUNT(*)::int AS count FROM economic_holds WHERE "tenantId" = ${f.tenantId} AND "workerJobId" = ${f.jobId}`;
    const [event] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_events WHERE "workerJobId" = ${f.jobId} AND "eventType" = 'SPEC224_GOAL_ADMISSION_DISPATCHED'`;
    expect(first.scanned + replay.scanned).toBeGreaterThan(0);
    expect(outbox.count).toBe(1);
    expect(holds.count).toBe(1);
    expect(event.count).toBe(1);
  }, 60_000);

  it("authorizes Child 1 and automatically authorizes and dispatches Child 2 after its receipt, once under replay and concurrency", async () => {
    const f = await setup();
    expect(typeof f.authorize, "production delegated-child authorization operation").toBe("function");
    const authorization = await f.authorize({ context: { tenantId: f.tenantId, actorId: f.actorId }, runId: f.runId });
    expect(authorization, JSON.stringify(authorization)).toMatchObject({ status: "READY_FOR_LIVE" });
    const [firstOutbox] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_outbox WHERE "workerJobId" = ${f.jobId}`;
    expect(firstOutbox.count).toBe(1);
    const { control, receipt } = await recordCompletedReceipt(f);
    expect(await control.recordRunnerReceipt(receipt)).toBe("duplicate");
    const { reconcileSpec224RunnerContinuations } = await import("../spec224RunnerContinuationReconciler");
    await Promise.all([reconcileSpec224RunnerContinuations(), reconcileSpec224RunnerContinuations()]);
    await reconcileSpec224RunnerContinuations();
    const jobs = await sql`SELECT id, status FROM worker_jobs WHERE "tenantId" = ${f.tenantId} AND "inputJson"->'spec224Run'->>'runId' = ${f.runId} ORDER BY "createdAt"`;
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({ status: "queued" });
    const [proof] = await sql`SELECT COUNT(DISTINCT h.id)::int AS holds, COUNT(DISTINCT h."attemptId")::int AS attempts, COUNT(DISTINCT o.id)::int AS outbox FROM economic_holds h JOIN worker_job_outbox o ON o."workerJobId" = h."workerJobId" WHERE h."tenantId" = ${f.tenantId} AND h."budgetId" = ${f.budgetId}`;
    expect(proof).toEqual({ holds: 2, attempts: 2, outbox: 2 });
    expect(jobs[0].id).not.toBe(jobs[1].id);
    const secondReceipt = await recordCompletedReceipt({ ...f, jobId: jobs[1].id });
    expect(await secondReceipt.control.completeExternal(jobs[1].id, `result:${f.runId}`, secondReceipt.operationKey)).toBe(true);
    const { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } = await import("../spec224DevelopmentRunPersistence");
    expect((await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).reconcile({ runId: f.runId, tenantId: f.tenantId, actorId: f.actorId })).action).toBe("CONTINUE");
    await reconcileSpec224RunnerContinuations();
    const third = await sql`SELECT id, status FROM worker_jobs WHERE "tenantId" = ${f.tenantId} AND "inputJson"->'spec224Run'->>'runId' = ${f.runId} ORDER BY "createdAt"`;
    expect(third).toHaveLength(3);
    expect(third[2].status).toBe("queued");
  }, 60_000);

  it("denies a revoked Goal grant before a child can enter the outbox", async () => {
    const f = await setup();
    await sql`UPDATE approval_requests SET revoked_at = NOW() WHERE id = ${f.approvalRef}`;
    expect(typeof f.authorize, "production delegated-child authorization operation").toBe("function");
    await expect(f.authorize({ context: { tenantId: f.tenantId, actorId: f.actorId }, runId: f.runId })).rejects.toMatchObject({ code: "SPEC224_GOAL_GRANT_NOT_ACTIVE_OR_APPROVED" });
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_outbox WHERE "workerJobId" = ${f.jobId}`;
    expect(row.count).toBe(0);
  }, 60_000);

  it("denies an expired grant and a changed pinned provider", async () => {
    const expired = await setup();
    await sql`UPDATE approval_requests SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = ${expired.approvalRef}`;
    await expect(expired.authorize({ context: { tenantId: expired.tenantId, actorId: expired.actorId }, runId: expired.runId })).rejects.toMatchObject({ code: "SPEC224_GOAL_GRANT_NOT_ACTIVE_OR_APPROVED" });
    const mismatch = await setup();
    await sql`UPDATE approval_requests SET payload = jsonb_set(payload::jsonb, '{provider}', '"claude_code"'::jsonb)::json WHERE id = ${mismatch.approvalRef}`;
    await expect(mismatch.authorize({ context: { tenantId: mismatch.tenantId, actorId: mismatch.actorId }, runId: mismatch.runId })).rejects.toMatchObject({ code: "SPEC224_DELEGATED_CONFIGURATION_INVALID" });
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_outbox WHERE "workerJobId" IN (${expired.jobId}, ${mismatch.jobId})`;
    expect(row.count).toBe(0);
  }, 60_000);

  it("keeps successor admission recoverable when the Goal grant is revoked after a receipt", async () => {
    const f = await setup();
    await f.authorize({ context: { tenantId: f.tenantId, actorId: f.actorId }, runId: f.runId });
    await recordCompletedReceipt(f);
    await sql`UPDATE approval_requests SET revoked_at = NOW() WHERE id = ${f.approvalRef}`;
    const { reconcileSpec224RunnerContinuations } = await import("../spec224RunnerContinuationReconciler");
    await expect(reconcileSpec224RunnerContinuations()).rejects.toMatchObject({ code: "SPEC224_GOAL_GRANT_NOT_ACTIVE_OR_APPROVED" });
    const [proof] = await sql`SELECT COUNT(*) FILTER (WHERE "eventType" = 'SPEC224_CONTINUATION_SUCCESSOR_DISPATCHED')::int AS dispatched FROM worker_job_events WHERE "workerJobId" = ${f.jobId}`;
    expect(proof.dispatched).toBe(0);
    const jobs = await sql`SELECT id, status FROM worker_jobs WHERE "tenantId" = ${f.tenantId} AND "inputJson"->'spec224Run'->>'runId' = ${f.runId} ORDER BY "createdAt"`;
    expect(jobs).toHaveLength(2);
    expect(jobs[1].status).toBe("pending");
    const [outbox] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_outbox WHERE "workerJobId" = ${jobs[1].id}`;
    expect(outbox.count).toBe(0);
    await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${f.jobId} AND "eventType" = 'SPEC224_CONTINUATION_PENDING'`;
  }, 60_000);

  it("enforces the cumulative Goal budget and does not duplicate a reservation on replay", async () => {
    const f = await setup(50);
    expect(typeof f.authorize, "production delegated-child authorization operation").toBe("function");
    await Promise.all([1, 2].map(() => f.authorize({ context: { tenantId: f.tenantId, actorId: f.actorId }, runId: f.runId })));
    const [row] = await sql`SELECT COUNT(*)::int AS holds, COALESCE(SUM("amountMinorUnits"),0)::int AS amount FROM economic_holds WHERE "tenantId" = ${f.tenantId} AND "budgetId" = ${f.budgetId}`;
    expect(row).toEqual({ holds: 1, amount: 50 });
    const [budget] = await sql`SELECT "heldMinorUnits"::int AS held, "limitMinorUnits"::int AS cap FROM economic_budgets WHERE id = ${f.budgetId}`;
    expect(budget).toEqual({ held: 50, cap: 50 });
    await recordCompletedReceipt(f);
    const { reconcileSpec224RunnerContinuations } = await import("../spec224RunnerContinuationReconciler");
    await expect(reconcileSpec224RunnerContinuations()).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    const jobs = await sql`SELECT status FROM worker_jobs WHERE "tenantId" = ${f.tenantId} AND "inputJson"->'spec224Run'->>'runId' = ${f.runId} ORDER BY "createdAt"`;
    expect(jobs).toHaveLength(2);
    expect(jobs[1].status).toBe("pending");
    const [after] = await sql`SELECT COUNT(*)::int AS holds FROM economic_holds WHERE "tenantId" = ${f.tenantId} AND "budgetId" = ${f.budgetId}`;
    expect(after.holds).toBe(1);
    await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${f.jobId} AND "eventType" = 'SPEC224_CONTINUATION_PENDING'`;
  }, 60_000);

  it("recovers after settlement and projection commit before successor admission", async () => {
    const f = await setup();
    await f.authorize({ context: { tenantId: f.tenantId, actorId: f.actorId }, runId: f.runId });
    const { control, operationKey } = await recordCompletedReceipt(f);
    expect(await control.completeExternal(f.jobId, `result:${f.runId}`, operationKey)).toBe(true);
    const { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } = await import("../spec224DevelopmentRunPersistence");
    expect((await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).reconcile({ runId: f.runId, tenantId: f.tenantId, actorId: f.actorId })).action).toBe("CONTINUE");
    const [intent] = await sql`SELECT "payloadJson" FROM worker_job_events WHERE "workerJobId" = ${f.jobId} AND "eventType" = 'SPEC224_CONTINUATION_PENDING'`;
    const { db } = await import("../../db");
    const { appendJobEvent } = await import("../jobControlPlane");
    await db.transaction(tx => appendJobEvent(tx, { workerJobId: f.jobId, eventType: "SPEC224_CONTINUATION_RECONCILED",
      eventIdempotencyKey: `spec224-continuation-result:${intent.payloadJson.operationId}`,
      payloadJson: { operationId: intent.payloadJson.operationId, runId: f.runId, reason: "phase_succeeded" } }));
    await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
      const { reconcileSpec224RunnerContinuations } = await import('./server/services/spec224RunnerContinuationReconciler.ts');
      await reconcileSpec224RunnerContinuations(); process.exit(0);
    `], { cwd: process.cwd(), env: process.env, timeout: 20_000 });
    const jobs = await sql`SELECT status FROM worker_jobs WHERE "tenantId" = ${f.tenantId} AND "inputJson"->'spec224Run'->>'runId' = ${f.runId} ORDER BY "createdAt"`;
    expect(jobs).toHaveLength(2);
    expect(jobs[1].status).toBe("queued");
  }, 60_000);
});
