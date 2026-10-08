import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionSpec224EconomicTestBudget } from "./helpers/spec224EconomicTestProvisioning";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const suite = enabled ? describe : describe.skip;

function testDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required for DB integration tests");
  const url = new URL(raw);
  const name = url.pathname.replace(/^\/+/, "");
  if (!/^spec224_[a-z0-9_-]*_test$/i.test(name)) {
    throw new Error("Economic DB tests require a spec224_*_test database");
  }
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Economic DB tests require a loopback PostgreSQL host");
  }
  return raw;
}

const databaseUrl = enabled ? testDatabaseUrl() : "postgresql://localhost/spec224_skipped_test";
process.env.DATABASE_URL = databaseUrl;

const sql = postgres(databaseUrl, { max: 8 });
const scopeId = randomUUID();
let tenantId = "";
let userId = 0;
let db: any;
let controlPlane: any;
let buildAgentJobDefinition: any;
let recordJournalEntry: any;
let reserveEconomicHold: any;
let releaseEconomicHold: any;
let captureEconomicHold: any;
let economicSchema: typeof import("../../../drizzle/schema");
let createdJobs: string[] = [];
let sharedAttempt: { jobId: string; attemptId: string } | undefined;

async function createAttempt() {
  if (sharedAttempt) return sharedAttempt;
  const taskId = randomUUID();
  const definition = buildAgentJobDefinition({
    taskId,
    tenantId,
    actorId: userId,
    goalId: `goal-${taskId}`,
    planId: `plan-${taskId}`,
    planRevision: 1,
    provider: "codex",
    runtime: "local_runner",
    workspaceId: `workspace-${taskId}`,
    contextPackageIds: [`context-${taskId}`],
    skillIds: ["spec224-economic-test"],
    mcpGrantIds: [],
    requestedCapabilities: ["workspace.read"],
    policyBinding: {
      runnerId: "runner-spec224-economic-test",
      runnerSessionId: `session-${taskId}`,
      capabilitySnapshotId: `snapshot-${taskId}`,
      capabilitySnapshotRevision: "1",
      authorizationGrantRef: `grant-${taskId}`,
      approvalRef: `approval-${taskId}`,
      budgetReservationRef: `reservation-${taskId}`,
      budgetCapMinorUnits: 100_000,
      currency: "USD",
      workspaceRef: `workspace-${taskId}`,
      deadline: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  const created = await controlPlane.create(definition);
  expect(created.created).toBe(true);
  createdJobs.push(created.jobId);
  const lease = await controlPlane.claim({
    jobId: created.jobId,
    runnerId: "runner-spec224-economic-test",
    adapter: "postgres-pull",
  });
  expect(lease).not.toBeNull();
  sharedAttempt = { jobId: created.jobId, attemptId: lease.attemptId };
  return sharedAttempt;
}

function makeIntent(job: { jobId: string; attemptId: string }, amountMinorUnits: number, idempotencyKey: string) {
  return import("../economicControlPlaneTypes").then(({ admitEconomicIntent }) =>
    admitEconomicIntent({
      context: { tenantId, actorId: String(userId), actorType: "user", policyVersion: "spec224-test-v1" },
      request: {
        jobId: job.jobId,
        attemptId: job.attemptId,
        idempotencyKey,
        amount: { minorUnits: amountMinorUnits, currency: "USD" },
        effectType: "tool_call",
        resourceRef: `spec224-test:${idempotencyKey}`,
      },
    }).intent,
  );
}

function journalLines(accounts: { sourceAccountId: string; targetAccountId: string }, amount: number, reverse = false) {
  return [
    {
      accountId: reverse ? accounts.targetAccountId : accounts.sourceAccountId,
      tenantId,
      currency: "USD",
      debitMinorUnits: amount,
      creditMinorUnits: 0,
    },
    {
      accountId: reverse ? accounts.sourceAccountId : accounts.targetAccountId,
      tenantId,
      currency: "USD",
      debitMinorUnits: 0,
      creditMinorUnits: amount,
    },
  ];
}

suite("Spec 224 — PostgreSQL economic certification", () => {
  beforeAll(async () => {
    const [database, control, contracts, ledger, durable, schema] = await Promise.all([
      import("../../db"),
      import("../jobControlPlane"),
      import("../agentControlPlaneContracts"),
      import("../economicLedgerService"),
      import("../economicDurableService"),
      import("../../../drizzle/schema"),
    ]);
    db = database.getDb();
    controlPlane = control.createJobControlPlane();
    buildAgentJobDefinition = contracts.buildAgentJobDefinition;
    recordJournalEntry = ledger.recordJournalEntry;
    reserveEconomicHold = durable.reserveEconomicHold;
    releaseEconomicHold = durable.releaseEconomicHold;
    captureEconomicHold = durable.captureEconomicHold;
    economicSchema = schema;

    tenantId = scopeId;
    await sql`INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${tenantId}, ${`${scopeId}-slug`}, 'Spec 224 Economic Test', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())`;
    const [user] = await sql`INSERT INTO users ("openId", role, plan, credits, "isDisabled")
      VALUES (${`${scopeId}-user`}, 'user', 'free', 0, false) RETURNING id`;
    userId = Number(user.id);
  });

  afterAll(async () => {
    if (tenantId) {
      await sql`DELETE FROM economic_journal_lines WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM economic_reconciliations WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM economic_events WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM economic_holds WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM economic_intents WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM economic_journal_entries WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM economic_budgets WHERE "tenantId" = ${tenantId}`;
      await sql`DELETE FROM economic_ledger_accounts WHERE "tenantId" = ${tenantId}`;
      for (const jobId of createdJobs) {
        await sql`DELETE FROM worker_job_dispatches WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_job_outbox WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_job_events WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_job_settlements WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_job_attempts WHERE "workerJobId" = ${jobId}`;
        await sql`DELETE FROM worker_jobs WHERE id = ${jobId}`;
      }
      if (userId) await sql`DELETE FROM users WHERE id = ${userId}`;
      await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    }
    await sql.end();
    await (db as any)?.$client?.end?.({ timeout: 1 });
  });

  it("reserves/releases idempotently and enforces tenant budget balance", async () => {
    const budget = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: `${scopeId}-reserve`, limitMinorUnits: 1_000 });
    const job = await createAttempt();
    const intent = await makeIntent(job, 300, "reserve-main-01");
    const reserveInput = {
      intent,
      budgetId: budget.budgetId,
      idempotencyKey: "hold-main-001",
      journalLines: journalLines(budget, 300),
      journalDescription: "Spec 224 test reserve",
    };
    const reserved = await reserveEconomicHold(db, reserveInput);
    expect(reserved.status).toBe("held");
    expect((await reserveEconomicHold(db, reserveInput)).replayed).toBe(true);
    const [budgetAfterReserve] = await db.select().from(economicSchema.economicBudgets).where(
      eq(economicSchema.economicBudgets.id, budget.budgetId),
    );
    expect(budgetAfterReserve.heldMinorUnits).toBe(300);

    const releaseInput = {
      tenantId,
      holdId: reserved.id,
      idempotencyKey: "release-main-01",
      actorId: String(userId),
      policyVersion: "spec224-test-v1",
      journalLines: journalLines(budget, 300, true),
      journalDescription: "Spec 224 test release",
    };
    await expect(releaseEconomicHold(db, {
      ...releaseInput,
      idempotencyKey: "release-wrong-amount-01",
      journalLines: journalLines(budget, 299, true),
    })).rejects.toMatchObject({ code: "RELEASE_AMOUNT_INVALID" });
    const [stillHeld] = await db.select().from(economicSchema.economicHolds).where(
      eq(economicSchema.economicHolds.id, reserved.id),
    );
    expect(stillHeld).toMatchObject({ status: "held", releasedMinorUnits: 0 });
    expect((await releaseEconomicHold(db, releaseInput)).status).toBe("released");
    await expect(releaseEconomicHold(db, { ...releaseInput, idempotencyKey: "release-other-01" }))
      .rejects.toMatchObject({ code: "RELEASE_IDEMPOTENCY_CONFLICT" });
    expect((await releaseEconomicHold(db, releaseInput)).replayed).toBe(true);
    const [budgetAfterRelease] = await db.select().from(economicSchema.economicBudgets).where(
      eq(economicSchema.economicBudgets.id, budget.budgetId),
    );
    expect(budgetAfterRelease.heldMinorUnits).toBe(0);
    const entries = await db.select().from(economicSchema.economicJournalEntries).where(
      eq(economicSchema.economicJournalEntries.tenantId, tenantId),
    );
    expect(entries.filter((entry: any) => entry.idempotencyKey === "reserve:hold-main-001")).toHaveLength(1);
    expect(entries.filter((entry: any) => entry.idempotencyKey === "release:release-main-01")).toHaveLength(1);
    const auditEvents = await db.select().from(economicSchema.economicEvents).where(
      eq(economicSchema.economicEvents.tenantId, tenantId),
    );
    expect(auditEvents.map((event: any) => event.eventType).sort()).toEqual(["hold_released", "hold_reserved"]);
    expect(auditEvents.every((event: any) => event.actorId === String(userId))).toBe(true);
  });

  it("provisions an owned zero-balance account and scoped budget idempotently with audit events", async () => {
    const { economicControlPlaneRouter } = await import("../../routers/economicControlPlane");
    const caller = economicControlPlaneRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: userId, role: "admin", currentTenantId: tenantId } as any,
      userToken: null,
      privateVaultToken: null,
      protectedSurfaceToken: null,
      tenantId,
      publicUrl: null,
    });
    const accountInput = {
      ownerType: "user" as const,
      accountType: "user_credit",
      currency: "usd",
      idempotencyKey: `account-${scopeId}`,
    };
    const account = await caller.provisionLedgerAccount(accountInput);
    const accountReplay = await caller.provisionLedgerAccount(accountInput);
    expect(account.status).toBe("open");
    expect(account.ownerRef).toBe(`user:${userId}`);
    expect(account.balanceMinorUnits).toBe(0);
    expect(accountReplay.accountId).toBe(account.accountId);
    expect(accountReplay.replayed).toBe(true);

    const budgetInput = {
      scopeType: "tenant" as const,
      currency: "usd",
      limitMinorUnits: 25_000,
      idempotencyKey: `budget-${scopeId}`,
    };
    const budget = await caller.provisionBudget(budgetInput);
    const budgetReplay = await caller.provisionBudget(budgetInput);
    expect(budget.scopeRef).toBe(tenantId);
    expect(budget.limitMinorUnits).toBe(25_000);
    expect(budget.heldMinorUnits).toBe(0);
    expect(budget.capturedMinorUnits).toBe(0);
    expect(budgetReplay.budgetId).toBe(budget.budgetId);
    expect(budgetReplay.replayed).toBe(true);
    await expect(caller.provisionBudget({ ...budgetInput, limitMinorUnits: 30_000 }))
      .rejects.toMatchObject({ message: "ECONOMIC_PROVISIONING_BUDGET_SCOPE_CONFLICT" });
    const nonAdmin = economicControlPlaneRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: userId, role: "user", currentTenantId: tenantId } as any,
      userToken: null,
      privateVaultToken: null,
      protectedSurfaceToken: null,
      tenantId,
      publicUrl: null,
    });
    await expect(nonAdmin.provisionBudget({ ...budgetInput, idempotencyKey: `denied-${scopeId}` }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    const events = await db.select().from(economicSchema.economicEvents).where(
      eq(economicSchema.economicEvents.tenantId, tenantId),
    );
    const accountEvents = events.filter((event: any) => event.idempotencyKey.includes(`account-${scopeId}`));
    const budgetEvents = events.filter((event: any) => event.idempotencyKey.includes(`budget-${scopeId}`));
    expect(accountEvents).toHaveLength(1);
    expect(accountEvents[0].payloadJson.resourceId).toBe(account.accountId);
    expect(budgetEvents).toHaveLength(1);
    expect(budgetEvents[0].payloadJson.resourceId).toBe(budget.budgetId);
  });

  it("captures a verified receipt atomically and replays duplicate settlement", async () => {
    const budget = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: `${scopeId}-capture`, limitMinorUnits: 1_000 });
    const job = await createAttempt();
    const intent = await makeIntent(job, 400, "reserve-capture-01");
    const hold = await reserveEconomicHold(db, {
      intent,
      budgetId: budget.budgetId,
      idempotencyKey: "hold-capture-001",
      journalLines: journalLines(budget, 400),
      journalDescription: "Spec 224 capture reserve",
    });
    const captureInput = {
      tenantId,
      holdId: hold.id,
      amountMinorUnits: 400,
      idempotencyKey: "settle-capture-001",
      receiptVerified: true,
      externalStatus: "succeeded" as const,
      actorId: String(userId),
      policyVersion: "spec224-test-v1",
      journalLines: journalLines(budget, 400, true),
      journalDescription: "Spec 224 verified settlement",
    };
    await expect(captureEconomicHold(db, { ...captureInput, idempotencyKey: "settle-unverified-01", receiptVerified: false }))
      .rejects.toMatchObject({ code: "CAPTURE_RECEIPT_REQUIRED" });
    const captured = await captureEconomicHold(db, captureInput);
    expect(captured.hold.status).toBe("captured");
    expect(captured.hold.capturedMinorUnits).toBe(400);
    expect((await captureEconomicHold(db, captureInput)).replayed).toBe(true);
    const [after] = await db.select().from(economicSchema.economicBudgets).where(
      eq(economicSchema.economicBudgets.id, budget.budgetId),
    );
    expect(after.heldMinorUnits).toBe(0);
    expect(after.capturedMinorUnits).toBe(400);
    const [settlementEvent] = await db.select().from(economicSchema.economicEvents).where(
      eq(economicSchema.economicEvents.idempotencyKey, "settle:settle-capture-001"),
    );
    expect(settlementEvent.eventType).toBe("receipt_settled");
    const settlementJournal = await db.select().from(economicSchema.economicJournalEntries).where(
      eq(economicSchema.economicJournalEntries.idempotencyKey, "settle:settle-capture-001"),
    );
    expect(settlementJournal).toHaveLength(1);
  });

  it("preserves holds for unknown outcomes and routes them to reconciliation", async () => {
    const budget = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: `${scopeId}-unknown`, limitMinorUnits: 500 });
    const job = await createAttempt();
    const intent = await makeIntent(job, 200, "reserve-unknown-01");
    const hold = await reserveEconomicHold(db, {
      intent,
      budgetId: budget.budgetId,
      idempotencyKey: "hold-unknown-001",
      journalLines: journalLines(budget, 200),
      journalDescription: "Spec 224 unknown-outcome reserve",
    });
    const result = await captureEconomicHold(db, {
      tenantId,
      holdId: hold.id,
      amountMinorUnits: 200,
      idempotencyKey: "settle-unknown-001",
      receiptVerified: false,
      externalStatus: "unknown",
      actorId: String(userId),
      policyVersion: "spec224-test-v1",
    });
    expect(result.reconciliationRequired).toBe(true);
    expect(result.hold.status).toBe("reconciliation_required");
    const [after] = await db.select().from(economicSchema.economicBudgets).where(
      eq(economicSchema.economicBudgets.id, budget.budgetId),
    );
    expect(after.heldMinorUnits).toBe(200);
    expect(after.capturedMinorUnits).toBe(0);
    const reviews = await db.select().from(economicSchema.economicReconciliations).where(
      eq(economicSchema.economicReconciliations.holdId, hold.id),
    );
    expect(reviews).toHaveLength(1);
  });

  it("rejects insufficient balance and rolls back partially written reservation state", async () => {
    const budget = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: `${scopeId}-insufficient`, limitMinorUnits: 250 });
    const job = await createAttempt();
    const intent = await makeIntent(job, 251, "reserve-insufficient-01");
    await expect(reserveEconomicHold(db, {
      intent,
      budgetId: budget.budgetId,
      idempotencyKey: "hold-insufficient-001",
      journalLines: journalLines(budget, 251),
      journalDescription: "Spec 224 over-budget reserve",
    })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    const noHold = await db.select().from(economicSchema.economicHolds).where(
      eq(economicSchema.economicHolds.idempotencyKey, "hold-insufficient-001"),
    );
    expect(noHold).toHaveLength(0);

    const balancedIntent = await makeIntent(job, 100, "reserve-rollback-01");
    const badLines = journalLines(budget, 100).slice(0, 1);
    await expect(reserveEconomicHold(db, {
      intent: balancedIntent,
      budgetId: budget.budgetId,
      idempotencyKey: "hold-rollback-001",
      journalLines: badLines,
      journalDescription: "Spec 224 rollback after staged reservation",
    })).rejects.toBeDefined();
    const rolledBackHold = await db.select().from(economicSchema.economicHolds).where(
      eq(economicSchema.economicHolds.idempotencyKey, "hold-rollback-001"),
    );
    expect(rolledBackHold).toHaveLength(0);
    const [budgetAfterRollback] = await db.select().from(economicSchema.economicBudgets).where(
      eq(economicSchema.economicBudgets.id, budget.budgetId),
    );
    expect(budgetAfterRollback.heldMinorUnits).toBe(0);
  });

  it("rejects a journal line whose account belongs to another tenant", async () => {
    const budget = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: `${scopeId}-cross-tenant`, limitMinorUnits: 100 });
    const foreignTenantId = randomUUID();
    await sql`INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt")
      VALUES (${foreignTenantId}, ${`${foreignTenantId}-slug`}, 'Spec 224 Foreign Tenant', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW())`;
    let foreignAccountId = "";
    try {
      const [foreignAccount] = await db.insert(economicSchema.economicLedgerAccounts).values({
        tenantId: foreignTenantId,
        accountType: "test_foreign",
        ownerRef: `${scopeId}-foreign-${randomUUID()}`,
        currency: "USD",
      }).returning({ id: economicSchema.economicLedgerAccounts.id });
      foreignAccountId = foreignAccount.id;
      await expect(recordJournalEntry(db, {
        tenantId,
        idempotencyKey: `cross-tenant-${randomUUID()}`,
        description: "Spec 224 cross tenant journal rejection",
        lines: [
          { accountId: budget.sourceAccountId, tenantId, currency: "USD", debitMinorUnits: 25, creditMinorUnits: 0 },
          { accountId: foreignAccountId, tenantId, currency: "USD", debitMinorUnits: 0, creditMinorUnits: 25 },
        ],
      })).rejects.toMatchObject({ code: "LEDGER_ACCOUNT_SCOPE_MISMATCH" });
      const entries = await db.select().from(economicSchema.economicJournalEntries).where(
        eq(economicSchema.economicJournalEntries.tenantId, tenantId),
      );
      expect(entries.some((entry: any) => entry.description === "Spec 224 cross tenant journal rejection")).toBe(false);
    } finally {
      if (foreignAccountId) await sql`DELETE FROM economic_ledger_accounts WHERE id = ${foreignAccountId}`;
      await sql`DELETE FROM tenants WHERE id = ${foreignTenantId}`;
    }
  });

  it("serializes concurrent captures and prevents a second full settlement", async () => {
    const budget = await provisionSpec224EconomicTestBudget(db, { tenantId, scopeId: `${scopeId}-concurrent`, limitMinorUnits: 600 });
    const job = await createAttempt();
    const intent = await makeIntent(job, 600, "reserve-concurrent-01");
    const hold = await reserveEconomicHold(db, {
      intent,
      budgetId: budget.budgetId,
      idempotencyKey: "hold-concurrent-001",
      journalLines: journalLines(budget, 600),
      journalDescription: "Spec 224 concurrent reserve",
    });
    const input = (key: string) => ({
      tenantId,
      holdId: hold.id,
      amountMinorUnits: 600,
      idempotencyKey: key,
      receiptVerified: true,
      externalStatus: "succeeded" as const,
      actorId: String(userId),
      policyVersion: "spec224-test-v1",
      journalLines: journalLines(budget, 600, true),
      journalDescription: "Spec 224 concurrent settlement",
    });
    const outcomes = await Promise.allSettled([
      captureEconomicHold(db, input("settle-concurrent-a")),
      captureEconomicHold(db, input("settle-concurrent-b")),
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    const [after] = await db.select().from(economicSchema.economicBudgets).where(
      eq(economicSchema.economicBudgets.id, budget.budgetId),
    );
    expect(after.capturedMinorUnits).toBe(600);
  });
});
