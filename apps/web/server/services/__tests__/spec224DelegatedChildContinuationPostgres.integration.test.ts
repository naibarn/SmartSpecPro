import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

async function setup(limit = 200) {
  const tenantId = randomUUID(), runId = randomUUID(), goalId = randomUUID(), approvalRef = randomUUID();
  const runnerId = `runner-${randomUUID()}`, sessionId = `session-${randomUUID()}`, snapshotId = randomUUID();
  const workspaceId = `workspace-${randomUUID()}`, revision = `rev-${randomUUID()}`;
  const expires = new Date(Date.now() + 600_000), observed = new Date(Date.now() - 1_000);
  const [user] = await sql`INSERT INTO users ("openId", role, plan, credits, "isDisabled") VALUES (${randomUUID()}, 'user', 'free', 0, false) RETURNING id`;
  const actorId = Number(user.id);
  await sql`INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt") VALUES (${tenantId}, ${randomUUID()}, 'Disposable bridge', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())`;
  const snapshot = { runnerId, tenantId, runnerSessionId: sessionId, capabilitySnapshotId: snapshotId, revision,
    observedAt: observed.toISOString(), expiresAt: expires.toISOString(), capabilities: ["agent.external_task"], workspaceIds: [workspaceId], resourceClass: "medium",
    workspaces: [{ workspaceId, projectId: "project-test", repositoryId: "repo-test", displayName: "Test", gitHead: "a".repeat(40), gitBranch: "main", dirty: false, contentFingerprint: "b".repeat(64) }],
    toolInventory: [{ toolId: "codex", kind: "agent_cli", displayName: "Codex", version: "test", adapterId: "codex.v1", adapterVersion: "1", discoverySource: "runner_probe", installState: "installed", configurationState: "configured", authState: "authenticated", healthState: "healthy", availabilityState: "available", trustState: "ready", fingerprint: "test", authorizationEvidenceRef: "auth-test", observedAt: observed.toISOString(), expiresAt: expires.toISOString(), reasonCodes: [], taskProbeState: "passed", taskProbeObservedAtMs: observed.getTime(), taskProbeExpiresAtMs: expires.getTime(), taskProbeEvidenceRef: "test-probe" }] };
  await sql`INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", profile, "displayName", "trustState", status, "currentSnapshotRevision", "currentSnapshotJson", "snapshotExpiresAt", "activeSessionId") VALUES (${runnerId}, ${tenantId}, ${actorId}, 'rust_runner', 'development', 'Test runner', 'trusted', 'online', ${revision}, ${sql.json(snapshot)}, ${expires}, ${sessionId})`;
  await sql`INSERT INTO runner_capability_snapshots (id, "runnerId", "tenantId", revision, "idempotencyKey", "observedAt", "expiresAt", "snapshotJson") VALUES (${snapshotId}, ${runnerId}, ${tenantId}, ${revision}, ${randomUUID()}, ${observed}, ${expires}, ${sql.json(snapshot)})`;
  const payload = { kind: "spec224_goal_delegation_grant", provider: "codex", grantId: randomUUID(), goalId, actorId, workspaceId, repositoryRef: "repo:test", sourceSha: "a".repeat(40), allowedActions: ["discover", "plan", "implement", "test", "repair", "verify"], writeScope: ["src/**"], capabilities: ["agent.external_task"], budgetLimitMinorUnits: limit, currency: "USD", issuedAt: observed.toISOString(), expiresAt: expires.toISOString() };
  await sql`INSERT INTO approval_requests (id, request_type, title, tenant_id, execution_id, requester_id, status, payload, required_approvers, current_approvals, expires_at, created_at) VALUES (${approvalRef}, 'CUSTOM', 'Approved Goal', ${tenantId}, ${goalId}, ${actorId}, 'APPROVED', ${sql.json(payload)}, 1, 1, ${expires}, NOW())`;
  const [{ getDb }, { buildDevelopmentRun }, { createPersistedDevelopmentRun }, { provisionSpec224GoalBudget }] = await Promise.all([
    import("../../db"), import("../spec224DevelopmentRunContracts"), import("../spec224DevelopmentRunPersistence"), import("../economicProvisioningService"),
  ]);
  const db = getDb();
  const accounts = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: runId, limitMinorUnits: limit });
  process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID = accounts.sourceAccountId;
  process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID = accounts.targetAccountId;
  const budget = await provisionSpec224GoalBudget(db, { tenantId, actorId, goalId, approvalRef });
  const run = buildDevelopmentRun({ runId, goalId, tenantId, actorId, goal: "Implement bounded test", repositoryRef: "repo:test", baseRevision: `git:${"a".repeat(40)}`, contextPackHash: "c".repeat(64), workspaceId,
    metadata: { spec224BudgetCapMinorUnits: 50, spec224Workspace: { runnerId }, spec224Execution: { sourceFingerprint: "b".repeat(64), mode: "prompt", allowedWriteSet: ["src/**"] } } });
  const created = await createPersistedDevelopmentRun({ run, provider: "codex", runtime: "local_runner", planId: `plan-${runId}`, planRevision: 1, skillIds: [], requestedCapabilities: ["agent.external_task"], deferredAdmission: true, authorizationScope: "spec224.development.run" });
  const { defaultSpec224AuthorizationService } = await import("../spec224AuthorizationService");
  // This production entry point is the missing bridge under test.
  const authorize = (defaultSpec224AuthorizationService as unknown as { authorizeDelegatedChild(input: { context: { tenantId: string; actorId: number }; runId: string }): Promise<{ status: string }> }).authorizeDelegatedChild;
  return { tenantId, actorId, runId, goalId, approvalRef, runnerId, sessionId, snapshotId, revision, budgetId: budget.budgetId, jobId: created.jobRef.jobId, expires, authorize };
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
  it("authorizes Child 1 and automatically authorizes and dispatches Child 2 after its receipt, once under replay and concurrency", async () => {
    const f = await setup();
    expect(typeof f.authorize, "production delegated-child authorization operation").toBe("function");
    expect((await f.authorize({ context: { tenantId: f.tenantId, actorId: f.actorId }, runId: f.runId })).status).toBe("READY_FOR_LIVE");
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
