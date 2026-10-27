import { createHash } from "node:crypto";

import { and, asc, eq, or, sql } from "drizzle-orm";

import {
  economicHolds,
  economicBudgets,
  workerJobAttempts,
  workerJobs,
} from "../../drizzle/schema";
import { db, getDb } from "../db";
import {
  getAppRuntimeConfig,
} from "./appRuntimeConfig";
import {
  appendJobEvent,
  createJobControlPlane,
  defaultJobControlPlaneRepository,
} from "./jobControlPlane";
import {
  releaseEconomicHold,
  reserveEconomicHold,
  type DurableReserveInput,
  type DurableReleaseInput,
} from "./economicDurableService";
import { provisionEconomicBudget } from "./economicProvisioningService";
import {
  type AgentTaskManifest,
  validateAgentTaskManifest,
} from "./agentControlPlaneContracts";
import { defaultRunnerGateway, type RunnerGatewayNode } from "./runnerGateway";
import {
  canPersistSpec224PolicyBinding,
  evaluateSpec224Authorization,
  evaluateSpec224RunnerReadiness,
  type Spec224ApprovalEvidence,
  type Spec224AuthorizationInput,
  type Spec224AuthorizationResult,
  type Spec224AuthorizationRun,
  type Spec224AuthorizationRunner,
  type Spec224BudgetEvidence,
  type Spec224PolicyBinding,
} from "./spec224AuthorizationBinding";
import {
  canonicalDevelopmentRunWorkerJobId,
  type DevelopmentRun,
} from "./spec224DevelopmentRunContracts";

export class Spec224AuthorizationError extends Error {
  constructor(
    public readonly code: string,
    message = code
  ) {
    super(message);
    this.name = "Spec224AuthorizationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type Spec224AuthorizationContext = {
  tenantId: string;
  actorId: number;
  actorRole?: string;
  userToken?: string | null;
};

type LoadedRun = {
  run: DevelopmentRun;
  attemptId: string | null;
  existingBinding: Spec224PolicyBinding | null;
  pending: {
    runnerId?: string;
    approvalRef?: string;
    budgetReservationRef?: string;
    deadline?: string;
    budgetCapMinorUnits?: number;
    currency?: string;
    status?: string;
  };
};

function requiredToken(ctx: Spec224AuthorizationContext): string {
  if (!ctx.userToken?.trim())
    throw new Spec224AuthorizationError("APPROVAL_AUTHENTICATION_REQUIRED");
  return ctx.userToken;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseBinding(value: unknown): Spec224PolicyBinding | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (
    typeof raw.runnerId !== "string" ||
    typeof raw.runnerSessionId !== "string" ||
    typeof raw.capabilitySnapshotId !== "string" ||
    typeof raw.capabilitySnapshotRevision !== "string" ||
    typeof raw.authorizationGrantRef !== "string" ||
    typeof raw.approvalRef !== "string" ||
    typeof raw.budgetReservationRef !== "string" ||
    !Number.isSafeInteger(raw.budgetCapMinorUnits) ||
    typeof raw.currency !== "string" ||
    !/^[A-Z]{3}$/.test(raw.currency) ||
    typeof raw.workspaceRef !== "string" ||
    typeof raw.deadline !== "string"
  )
    return null;
  return raw as unknown as Spec224PolicyBinding;
}

function runInput(
  loaded: LoadedRun,
  provider: "codex" | "claude_code",
  deadline?: string
): Spec224AuthorizationRun {
  return {
    runId: loaded.run.runId,
    tenantId: loaded.run.tenantId,
    actorId: loaded.run.actorId,
    workerJobId: loaded.run.workerJobId,
    attemptId: loaded.attemptId,
    workspaceId: loaded.run.workspaceId,
    ...(typeof loaded.run.metadata?.profileId === "string"
      ? { profileId: loaded.run.metadata.profileId }
      : {}),
    provider,
    deadline:
      deadline ??
      loaded.pending.deadline ??
      loaded.existingBinding?.deadline ??
      new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

function mapRunner(
  node: RunnerGatewayNode | null
): Spec224AuthorizationRunner | null {
  if (!node) return null;
  return {
    runnerId: node.runnerId,
    tenantId: node.tenantId,
    ownerUserId: node.ownerUserId,
    trustState: node.trustState,
    status: node.status,
    activeSessionId: node.activeSessionId,
    snapshot: node.currentSnapshot,
  };
}

function mapApproval(raw: any, ref: string): Spec224ApprovalEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    approvalRef: ref,
    tenantId: typeof raw.tenant_id === "string" ? raw.tenant_id : null,
    executionId: typeof raw.execution_id === "string" ? raw.execution_id : null,
    requesterId: Number.isSafeInteger(Number(raw.requester_id))
      ? Number(raw.requester_id)
      : null,
    status: raw.status,
    currentApprovals: Number(raw.current_approvals ?? 0),
    requiredApprovers: Number(raw.required_approvers ?? 1),
    expiresAt: typeof raw.expires_at === "string" ? raw.expires_at : null,
    payload: asRecord(raw.payload) ?? {},
  };
}

function mapHold(row: any): Spec224BudgetEvidence | null {
  if (!row) return null;
  return {
    budgetReservationRef: row.id,
    tenantId: row.tenantId,
    workerJobId: row.workerJobId,
    attemptId: row.attemptId,
    status: row.status,
    amountMinorUnits: row.amountMinorUnits,
    currency: row.currency,
    expiresAt: null,
  };
}

async function readApproval(
  ctx: Spec224AuthorizationContext,
  ref: string | null
): Promise<Spec224ApprovalEvidence | null> {
  if (!ref) return null;
  const runtime = await getAppRuntimeConfig();
  const response = await fetch(
    `${runtime.pythonBackendUrl}/api/v1/approvals/requests/${encodeURIComponent(ref)}`,
    { headers: { Authorization: `Bearer ${requiredToken(ctx)}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Spec224AuthorizationError("APPROVAL_AUTHORITY_UNAVAILABLE");
  return mapApproval(await response.json(), ref);
}

async function createApproval(
  ctx: Spec224AuthorizationContext,
  loaded: LoadedRun,
  runner: Spec224AuthorizationRunner,
  provider: "codex" | "claude_code",
  profileId: string,
  deadline: string,
  budgetCapMinorUnits: number,
  currency: string
): Promise<Spec224ApprovalEvidence> {
  const runtime = await getAppRuntimeConfig();
  const response = await fetch(
    `${runtime.pythonBackendUrl}/api/v1/approvals/requests`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requiredToken(ctx)}`,
      },
      body: JSON.stringify({
        request_type: "code_execution",
        title: `Approve ${provider} execution for ${loaded.run.runId}`,
        description:
          "Owner approval for a bounded Spec 224 external-agent run.",
        execution_id: loaded.run.workerJobId,
        risk_level: "high",
        required_approvers: 1,
        timeout_minutes: Math.max(
          5,
          Math.min(
            10080,
            Math.ceil((Date.parse(deadline) - Date.now()) / 60000)
          )
        ),
        payload: {
          runId: loaded.run.runId,
          provider,
          profileId,
          workspaceId: loaded.run.workspaceId,
          runnerId: runner.runnerId,
          runnerSessionId: runner.activeSessionId,
          capabilitySnapshotId: runner.snapshot?.capabilitySnapshotId,
          capabilitySnapshotRevision: runner.snapshot?.revision,
          authorizationGrantRef: runner.snapshot?.toolInventory?.find(
            tool =>
              tool.toolId === provider || tool.adapterId === `${provider}.v1`
          )?.authorizationEvidenceRef,
          budgetCapMinorUnits,
          currency: currency.trim().toUpperCase(),
          deadline,
        },
      }),
    }
  );
  if (!response.ok)
    throw new Spec224AuthorizationError("APPROVAL_REQUEST_REJECTED");
  const data = await response.json();
  const mapped = mapApproval(data, String(data.id ?? ""));
  if (!mapped?.approvalRef)
    throw new Spec224AuthorizationError("APPROVAL_REFERENCE_MISSING");
  return mapped;
}

async function createPolicyDecision(
  ctx: Spec224AuthorizationContext,
  loaded: LoadedRun,
  runner: Spec224AuthorizationRunner,
  profileId: string,
  deadline: string,
  budgetCapMinorUnits: number,
  currency: string,
  policyId?: string
): Promise<Spec224ApprovalEvidence | null> {
  const projectId = loaded.run.metadata?.projectId;
  const persistedProfileId = loaded.run.metadata?.profileId;
  const tool = runner.snapshot?.toolInventory?.find(
    item => item.toolId === "codex" || item.adapterId === "codex.v1"
  );
  if (
    typeof projectId !== "string" ||
    !projectId.trim() ||
    typeof persistedProfileId !== "string" ||
    persistedProfileId !== profileId ||
    !loaded.run.workerJobId ||
    !loaded.attemptId ||
    !runner.activeSessionId ||
    !runner.snapshot?.capabilitySnapshotId ||
    runner.snapshot.revision === undefined ||
    runner.snapshot.revision === null ||
    !tool?.authorizationEvidenceRef
  )
    return null;

  const runtime = await getAppRuntimeConfig();
  const resourceScopes = [
    { kind: "development_run", id: loaded.run.runId },
    { kind: "worker_job", id: loaded.run.workerJobId },
    { kind: "attempt", id: loaded.attemptId },
    { kind: "workspace", id: loaded.run.workspaceId },
    { kind: "runner", id: runner.runnerId },
    { kind: "runner_session", id: runner.activeSessionId },
    { kind: "capability_snapshot", id: runner.snapshot.capabilitySnapshotId },
  ];
  const idempotencyKey = createHash("sha256")
    .update(
      [
        ctx.tenantId,
        loaded.run.runId,
        loaded.run.workerJobId,
        loaded.attemptId,
        runner.runnerId,
        runner.activeSessionId,
        profileId,
      ].join(":"),
      "utf8"
    )
    .digest("hex");
  const response = await fetch(
    `${runtime.pythonBackendUrl}/api/v1/approvals/internal/spec224/development-policy-decisions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requiredToken(ctx)}`,
      },
      body: JSON.stringify({
        ...(policyId ? { policyId } : {}),
        tenantId: ctx.tenantId,
        idempotencyKey,
        projectId,
        environment: "development",
        profileId,
        operation: "spec224.development.run",
        runId: loaded.run.runId,
        provider: "codex",
        executionId: loaded.run.workerJobId,
        attemptId: loaded.attemptId,
        workspaceId: loaded.run.workspaceId,
        authorizationGrantRef: tool.authorizationEvidenceRef,
        runnerId: runner.runnerId,
        runnerSessionId: runner.activeSessionId,
        capabilitySnapshotId: runner.snapshot.capabilitySnapshotId,
        capabilitySnapshotRevision: String(runner.snapshot.revision),
        resourceScopes,
        budgetMinorUnits: budgetCapMinorUnits,
        currency: currency.trim().toUpperCase(),
        expiresAt: deadline,
      }),
    }
  );
  if (response.status === 403 || response.status === 422) {
    if (!policyId) return null;
    const body = await response.json().catch(() => ({}));
    const code = typeof body.detail === "string" && /^SPEC224_POLICY_[A-Z0-9_]+$/.test(body.detail)
      ? body.detail : "SPEC224_POLICY_SCOPE_DENIED";
    throw new Spec224AuthorizationError(code);
  }
  if (!response.ok)
    throw new Spec224AuthorizationError("POLICY_AUTHORITY_UNAVAILABLE");
  const data = (await response.json()) as Record<string, unknown>;
  const approvalRef =
    typeof data.approvalRequestId === "string" ? data.approvalRequestId : "";
  if (!approvalRef || data.status !== "approved")
    throw new Spec224AuthorizationError("POLICY_DECISION_RECORD_INVALID");
  return {
    approvalRef,
    tenantId: typeof data.tenantId === "string" ? data.tenantId : null,
    executionId: typeof data.executionId === "string" ? data.executionId : null,
    requesterId: Number.isSafeInteger(Number(data.requesterId))
      ? Number(data.requesterId)
      : null,
    status: "approved",
    currentApprovals: 0,
    requiredApprovers: 0,
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
    payload: asRecord(data.payload) ?? {},
  };
}

async function loadRun(
  ctx: Spec224AuthorizationContext,
  runId: string
): Promise<LoadedRun> {
  getDb();
  const [row] = await db
    .select({
      id: workerJobs.id,
      attempt: workerJobs.attempt,
      inputJson: workerJobs.inputJson,
      progressJson: workerJobs.progressJson,
    })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.id, canonicalDevelopmentRunWorkerJobId(runId)),
        eq(workerJobs.tenantId, ctx.tenantId),
        eq(workerJobs.requestedByUserId, ctx.actorId)
      )
    )
    .limit(1);

  let job = row;
  if (!job) {
    const [legacyRoot] = await db
      .select({
        id: workerJobs.id,
        attempt: workerJobs.attempt,
        inputJson: workerJobs.inputJson,
        progressJson: workerJobs.progressJson,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, ctx.tenantId),
          eq(workerJobs.requestedByUserId, ctx.actorId),
          or(
            sql`${workerJobs.inputJson}->'spec224Run'->>'runId' = ${runId}`,
            sql`${workerJobs.progressJson}->'spec224'->>'runId' = ${runId}`
          )
        )
      )
      .orderBy(asc(workerJobs.createdAt), asc(workerJobs.id))
      .limit(1);
    job = legacyRoot;
  }
  if (!job) throw new Spec224AuthorizationError("RUN_NOT_FOUND");
  const projection = asRecord(job.progressJson?.spec224);
  if (!projection) throw new Spec224AuthorizationError("RUN_NOT_FOUND");
  const run = projection as unknown as DevelopmentRun;
  const [attempt] = await db
    .select({ id: workerJobAttempts.id })
    .from(workerJobAttempts)
    .where(
      and(
        eq(workerJobAttempts.workerJobId, job.id),
        eq(workerJobAttempts.attempt, job.attempt)
      )
    )
    .limit(1);
  const manifest = asRecord(job.inputJson?.manifest);
  const pending = asRecord(job.progressJson?.spec224Authorization) ?? {};
  return {
    run,
    attemptId: attempt?.id ?? null,
    existingBinding: parseBinding(manifest?.policyBinding),
    pending: {
      runnerId:
        typeof pending.runnerId === "string" ? pending.runnerId : undefined,
      approvalRef:
        typeof pending.approvalRef === "string"
          ? pending.approvalRef
          : undefined,
      budgetReservationRef:
        typeof pending.budgetReservationRef === "string"
          ? pending.budgetReservationRef
          : undefined,
      deadline:
        typeof pending.deadline === "string" ? pending.deadline : undefined,
      budgetCapMinorUnits:
        typeof pending.budgetCapMinorUnits === "number"
          ? pending.budgetCapMinorUnits
          : undefined,
      currency:
        typeof pending.currency === "string" ? pending.currency : undefined,
      status: typeof pending.status === "string" ? pending.status : undefined,
    },
  };
}

async function persistAuthorizationProjection(
  ctx: Spec224AuthorizationContext,
  loaded: LoadedRun,
  update: Record<string, unknown>,
  eventSuffix: string
): Promise<void> {
  if (!loaded.run.workerJobId)
    throw new Spec224AuthorizationError("RUN_JOB_REQUIRED");
  await db.transaction(async tx => {
    const [row] = await tx
      .select({
        progressJson: workerJobs.progressJson,
        status: workerJobs.status,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, loaded.run.workerJobId!),
          eq(workerJobs.tenantId, ctx.tenantId),
          eq(workerJobs.requestedByUserId, ctx.actorId)
        )
      )
      .for("update")
      .limit(1);
    if (!row) throw new Spec224AuthorizationError("RUN_NOT_FOUND");
    if (row.status !== "pending" && row.status !== "queued")
      throw new Spec224AuthorizationError("AUTH_BINDING_JOB_NOT_QUEUED");
    const current = asRecord(row.progressJson.spec224Authorization) ?? {};
    await tx
      .update(workerJobs)
      .set({
        progressJson: {
          ...row.progressJson,
          spec224Authorization: {
            ...current,
            ...update,
            updatedAt: new Date().toISOString(),
          },
        },
      })
      .where(eq(workerJobs.id, loaded.run.workerJobId!));
    await appendJobEvent(tx, {
      workerJobId: loaded.run.workerJobId!,
      eventType: "SPEC224_AUTHORIZATION_PROJECTION_UPDATED",
      eventIdempotencyKey: `spec224:authorization-projection:${loaded.run.runId}:${eventSuffix}`,
      payloadJson: { runId: loaded.run.runId, ...update },
    });
  });
}

async function readBudget(
  ctx: Spec224AuthorizationContext,
  ref: string | null
): Promise<Spec224BudgetEvidence | null> {
  if (!ref) return null;
  const [row] = await db
    .select()
    .from(economicHolds)
    .where(
      and(eq(economicHolds.id, ref), eq(economicHolds.tenantId, ctx.tenantId))
    )
    .limit(1);
  return mapHold(row);
}

export function spec224ReservationIntentId(tenantId: string, idempotencyKey: string): string {
  const hex = createHash("sha256")
    .update(JSON.stringify(["spec224-reservation-intent-v1", tenantId, idempotencyKey]))
    .digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function reserveInput(
  ctx: Spec224AuthorizationContext,
  loaded: LoadedRun,
  budgetId: string,
  amountMinorUnits: number,
  currency: string
): DurableReserveInput {
  const debitAccount =
    process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID?.trim();
  const creditAccount =
    process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID?.trim();
  if (!debitAccount || !creditAccount)
    throw new Spec224AuthorizationError(
      "ECONOMIC_LEDGER_ACCOUNTS_NOT_CONFIGURED"
    );
  if (!loaded.run.workerJobId || !loaded.attemptId)
    throw new Spec224AuthorizationError("RUN_ATTEMPT_REQUIRED");
  const normalizedCurrency = currency.trim().toUpperCase();
  const idempotencyKey =
    `spec224:codex:${loaded.run.runId}:${loaded.attemptId}:${amountMinorUnits}`.slice(
      0,
      128
    );
  return {
    budgetId,
    idempotencyKey,
    intent: {
      intentId: spec224ReservationIntentId(ctx.tenantId, idempotencyKey),
      tenantId: ctx.tenantId,
      actorId: String(ctx.actorId),
      actorType: "user",
      jobId: loaded.run.workerJobId,
      attemptId: loaded.attemptId,
      idempotencyKey,
      effectType: "provider_charge",
      resourceRef: `spec224:${loaded.run.runId}`,
      amount: { minorUnits: amountMinorUnits, currency: normalizedCurrency },
      policyVersion: "spec224-authorization-binding-v1",
      createdAt: new Date().toISOString(),
    },
    journalDescription: `Reserve Spec 224 Codex execution ${loaded.run.runId}`,
    journalLines: [
      {
        accountId: debitAccount,
        tenantId: ctx.tenantId,
        currency: normalizedCurrency,
        debitMinorUnits: amountMinorUnits,
        creditMinorUnits: 0,
      },
      {
        accountId: creditAccount,
        tenantId: ctx.tenantId,
        currency: normalizedCurrency,
        debitMinorUnits: 0,
        creditMinorUnits: amountMinorUnits,
      },
    ],
  };
}

async function persistBinding(
  ctx: Spec224AuthorizationContext,
  loaded: LoadedRun,
  binding: Spec224PolicyBinding
): Promise<void> {
  if (!loaded.run.workerJobId)
    throw new Spec224AuthorizationError("RUN_JOB_REQUIRED");
  await db.transaction(async tx => {
    const [row] = await tx
      .select({
        inputJson: workerJobs.inputJson,
        progressJson: workerJobs.progressJson,
        status: workerJobs.status,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, loaded.run.workerJobId!),
          eq(workerJobs.tenantId, ctx.tenantId),
          eq(workerJobs.requestedByUserId, ctx.actorId)
        )
      )
      .for("update")
      .limit(1);
    if (!row) throw new Spec224AuthorizationError("RUN_NOT_FOUND");
    if (row.status !== "pending" && row.status !== "queued")
      throw new Spec224AuthorizationError("AUTH_BINDING_JOB_NOT_QUEUED");
    const inputJson = { ...row.inputJson };
    const manifest = asRecord(inputJson.manifest);
    if (!manifest)
      throw new Spec224AuthorizationError("AGENT_MANIFEST_MISSING");
    const currentProgressBinding = asRecord(
      row.progressJson.spec224Authorization
    )?.binding;
    if (
      !canPersistSpec224PolicyBinding({
        jobStatus: row.status,
        manifestBinding: manifest.policyBinding,
        progressBinding: currentProgressBinding,
        nextBinding: binding,
      })
    ) {
      throw new Spec224AuthorizationError("AUTH_BINDING_IMMUTABLE");
    }
    const validated = validateAgentTaskManifest({
      ...manifest,
      policyBinding: binding,
    } as AgentTaskManifest);
    const manifestHash = createHash("sha256")
      .update(JSON.stringify(validated), "utf8")
      .digest("hex");
    const nextInput = { ...inputJson, manifest: validated, manifestHash };
    const progress = {
      ...row.progressJson,
      spec224Authorization: {
        binding,
        status: "READY_FOR_LIVE",
        updatedAt: new Date().toISOString(),
      },
    };
    await tx
      .update(workerJobs)
      .set({ inputJson: nextInput, progressJson: progress })
      .where(eq(workerJobs.id, loaded.run.workerJobId!));
    await appendJobEvent(tx, {
      workerJobId: loaded.run.workerJobId!,
      eventType: "SPEC224_AUTHORIZATION_BOUND",
      eventIdempotencyKey: `spec224:authorization-bound:${loaded.run.runId}:${binding.budgetReservationRef}`,
      payloadJson: {
        runId: loaded.run.runId,
        runnerId: binding.runnerId,
        runnerSessionId: binding.runnerSessionId,
        capabilitySnapshotId: binding.capabilitySnapshotId,
        capabilitySnapshotRevision: binding.capabilitySnapshotRevision,
        authorizationGrantRef: binding.authorizationGrantRef,
        approvalRef: binding.approvalRef,
        budgetReservationRef: binding.budgetReservationRef,
        workspaceRef: binding.workspaceRef,
        deadline: binding.deadline,
      },
    });
  });
}

export function createSpec224AuthorizationService() {
  async function ensureOwnerBoundedDevelopmentPolicy(input: {
    context: Spec224AuthorizationContext;
    loaded: LoadedRun;
    runnerId: string;
    budgetCapMinorUnits: number;
  }): Promise<void> {
    const { context, loaded, runnerId, budgetCapMinorUnits } = input;
    if (!Number.isSafeInteger(budgetCapMinorUnits) || budgetCapMinorUnits < 1 || budgetCapMinorUnits > 10_000_000)
      throw new Spec224AuthorizationError("SPEC224_DEVELOPMENT_BUDGET_CAP_INVALID");
    const readiness = await service.runnerReadiness({ ...input, workspaceId: loaded.run.workspaceId });
    if (!readiness.ready) throw new Spec224AuthorizationError(readiness.code);
    const node = await defaultRunnerGateway.getNode(runnerId, context.tenantId);
    const snapshot = node?.currentSnapshot;
    const workspace = snapshot?.workspaces?.find(item => item.workspaceId === loaded.run.workspaceId);
    const projectId = workspace?.projectId ?? loaded.run.metadata?.projectId;
    const profileId = snapshot?.platform?.os === "windows"
      ? "spec224-recovery-windows-x64-codex-nonprod" : "spec224-recovery-registered-runner-nonprod";
    const codex = snapshot?.toolInventory?.find(item => item.adapterId === "codex.v1");
    const attemptId = loaded.attemptId;
    const workerJobId = loaded.run.workerJobId;
    if (!projectId || !attemptId || !workerJobId || !workspace || !snapshot?.runnerSessionId || !snapshot.capabilitySnapshotId || !snapshot.revision || !codex?.authorizationEvidenceRef)
      throw new Spec224AuthorizationError("SPEC224_POLICY_RUNTIME_BINDING_REQUIRED");
    const resourceScopes = [
      { kind: "development_run", id: loaded.run.runId },
      { kind: "worker_job", id: workerJobId },
      { kind: "attempt", id: attemptId },
      { kind: "workspace", id: loaded.run.workspaceId },
      { kind: "runner", id: runnerId },
      { kind: "runner_session", id: snapshot.runnerSessionId },
      { kind: "capability_snapshot", id: snapshot.capabilitySnapshotId },
    ];
    const definition = {
      schemaVersion: "spec224.development-policy.v1",
      environmentAllowlist: ["development"],
      profileAllowlist: [profileId],
      initiatorUserIds: [context.actorId],
      operations: ["spec224.development.run"],
      resourceScopes,
      maxBudgetMinorUnits: budgetCapMinorUnits,
      currency: "USD",
      maxTtlSeconds: 3600,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    const rows = await db.instance.execute(sql`
      SELECT id, conditions->'definition' AS definition FROM approval_rules
      WHERE tenant_id = ${context.tenantId} AND project_id = ${projectId}
        AND is_active = true AND conditions->>'schemaVersion' = 'spec224.development-policy.v1'
    `);
    const candidates = Array.from(rows as unknown as Array<{ id: string; definition: Record<string, any> }>);
    const sameRun = candidates.find(row => Array.isArray(row.definition?.resourceScopes)
      && row.definition.resourceScopes.some((scope: { kind?: string; id?: string }) => scope.kind === "development_run" && scope.id === loaded.run.runId));
    if (sameRun) {
      const existing = sameRun.definition;
      if (existing.initiatorUserIds?.includes(context.actorId) !== true
        || existing.maxBudgetMinorUnits !== budgetCapMinorUnits
        || String(existing.currency).toUpperCase() !== "USD"
        || JSON.stringify(existing.resourceScopes) !== JSON.stringify(resourceScopes)
        || Date.parse(existing.expiresAt) <= Date.now())
        throw new Spec224AuthorizationError("SPEC224_RUN_POLICY_ALREADY_CONFIGURED");
    } else {
      const runtime = await getAppRuntimeConfig();
      const response = await fetch(`${runtime.pythonBackendUrl}/api/v1/approvals/spec224/development-policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${requiredToken(context)}` },
        body: JSON.stringify({ projectId, definition }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: unknown } | null;
        const code = typeof detail?.detail === "string" && /^SPEC224_[A-Z0-9_]+$/.test(detail.detail)
          ? detail.detail : response.status === 403 ? "SPEC224_POLICY_TENANT_OWNER_REQUIRED" : "SPEC224_POLICY_CREATE_FAILED";
        throw new Spec224AuthorizationError(code);
      }
      const created = await response.json() as { policyId?: string };
      if (!created.policyId) throw new Spec224AuthorizationError("SPEC224_POLICY_REFERENCE_MISSING");
    }

  }

  const service = {
    async runnerReadiness(input: {
      context: Pick<Spec224AuthorizationContext, "tenantId" | "actorId">;
      runnerId: string;
      workspaceId: string;
      sourceCommit?: string;
    }) {
      const node = await defaultRunnerGateway.getNode(input.runnerId, input.context.tenantId);
      const readiness = evaluateSpec224RunnerReadiness({
        ...input.context,
        runner: mapRunner(node),
        workspaceId: input.workspaceId,
        sourceCommit: input.sourceCommit,
      });
      return { ...readiness,
        projectId: node?.currentSnapshot?.workspaces?.find(item => item.workspaceId === input.workspaceId)?.projectId ?? null,
        profileId: node?.currentSnapshot?.platform?.os === "windows"
          ? "spec224-recovery-windows-x64-codex-nonprod" : "spec224-recovery-registered-runner-nonprod",
      };
    },
    /** Continue a single authenticated Start through existing approval and
     * economic authorities. Never create a policy, fund a budget, or fall
     * back to a new manual approval when the configured policy is denied. */
    async advanceStart(input: {
      context: Spec224AuthorizationContext;
      runId: string;
      runnerId: string;
      budgetCapMinorUnits?: number;
    }): Promise<Spec224AuthorizationResult> {
      const status = () => service.status(input);
      try {
        let current = await status();
        if (current.status === "NOT_CONFIGURED" && current.reasons.includes("RUN_CONFIGURATION_INCOMPLETE")) {
          const interrupted = await loadRun(input.context, input.runId);
          if (interrupted.run.workerJobId) {
            const resumed = await createJobControlPlane(defaultJobControlPlaneRepository).resumeUnstartedAuthorizationHold({
              jobId: interrupted.run.workerJobId, runId: input.runId,
              tenantId: input.context.tenantId, requestedByUserId: input.context.actorId,
            });
            if (resumed?.resumed) current = await status();
          }
          if (!interrupted.attemptId && interrupted.run.workerJobId) {
            await createJobControlPlane().prepareAuthorizationAttempt({ jobId: interrupted.run.workerJobId,
              tenantId: input.context.tenantId, requestedByUserId: input.context.actorId });
            current = await status();
          }
        }
        if (current.status === "READY_FOR_LIVE") {
          const loaded = await loadRun(input.context, input.runId);
          if (!loaded.run.workerJobId) throw new Spec224AuthorizationError("RUN_JOB_REQUIRED");
          const released = await createJobControlPlane(defaultJobControlPlaneRepository).releaseAuthorizationHold({
            jobId: loaded.run.workerJobId,
            tenantId: input.context.tenantId,
            requestedByUserId: input.context.actorId,
          });
          if (!released) throw new Spec224AuthorizationError("HOLD_RELEASE_NOT_ALLOWED");
          return current;
        }
        if (!["APPROVAL_REQUIRED", "BUDGET_REQUIRED"].includes(current.status)) return current;
        let loaded = await loadRun(input.context, input.runId);
        if (loaded.run.workerJobId) {
          const resumed = await createJobControlPlane(defaultJobControlPlaneRepository).resumeUnstartedAuthorizationHold({
            jobId: loaded.run.workerJobId, runId: input.runId,
            tenantId: input.context.tenantId, requestedByUserId: input.context.actorId,
          });
          if (resumed?.resumed) {
            current = await status();
            loaded = await loadRun(input.context, input.runId);
          }
        }
        const readiness = await service.runnerReadiness({ ...input, workspaceId: loaded.run.workspaceId,
          sourceCommit: /^git:([a-f0-9]{40})$/i.exec(loaded.run.baseRevision)?.[1] });
        if (!readiness.ready) return { version: "spec-224-authorization-binding-v1", status: "RUNNER_BINDING_REQUIRED", reasons: [readiness.code] };
        const node = await defaultRunnerGateway.getNode(input.runnerId, input.context.tenantId);
        const workspace = node?.currentSnapshot?.workspaces?.find(item => item.workspaceId === loaded.run.workspaceId);
        const projectId = workspace?.projectId;
        const profileId = node?.currentSnapshot?.platform?.os === "windows"
          ? "spec224-recovery-windows-x64-codex-nonprod" : "spec224-recovery-registered-runner-nonprod";
        if (!projectId) throw new Spec224AuthorizationError("SPEC224_POLICY_PROJECT_REQUIRED");
        const codex = node?.currentSnapshot?.toolInventory?.find(item => item.adapterId === "codex.v1");
        const requiredPolicyScopes = loaded.attemptId && loaded.run.workerJobId && node?.activeSessionId && node.currentSnapshot?.capabilitySnapshotId
          ? [
            { kind: "development_run", id: loaded.run.runId },
            { kind: "worker_job", id: loaded.run.workerJobId },
            { kind: "attempt", id: loaded.attemptId },
            { kind: "workspace", id: loaded.run.workspaceId },
            { kind: "runner", id: input.runnerId },
            { kind: "runner_session", id: node.activeSessionId },
            { kind: "capability_snapshot", id: node.currentSnapshot.capabilitySnapshotId },
          ]
          : [];
        const rows = await db.instance.execute(sql`
          SELECT id, conditions->'definition' AS definition FROM approval_rules
          WHERE tenant_id = ${input.context.tenantId} AND project_id = ${projectId}
            AND is_active = true AND conditions->>'schemaVersion' = 'spec224.development-policy.v1'
          ORDER BY priority DESC, id
        `);
        let selected = Array.from(rows as unknown as Array<{ id: string; definition: Record<string, any> }>).find(row => {
          const value = row.definition;
          return Array.isArray(value?.initiatorUserIds) && value.initiatorUserIds.includes(input.context.actorId) &&
            Array.isArray(value.profileAllowlist) && value.profileAllowlist.includes(profileId) &&
            Array.isArray(value.environmentAllowlist) && value.environmentAllowlist.includes("development") &&
            Array.isArray(value.operations) && value.operations.includes("spec224.development.run") &&
            Number.isSafeInteger(value.maxBudgetMinorUnits) && value.maxBudgetMinorUnits > 0 &&
            Number.isSafeInteger(value.maxTtlSeconds) && value.maxTtlSeconds > 0 &&
            typeof value.currency === "string" && /^[A-Za-z]{3}$/.test(value.currency) &&
            Boolean(codex?.authorizationEvidenceRef) && requiredPolicyScopes.length === 7 &&
            Array.isArray(value.resourceScopes) && requiredPolicyScopes.every(required =>
              value.resourceScopes.some((allowed: { kind?: string; id?: string }) => allowed.kind === required.kind && allowed.id === required.id)) &&
            Date.parse(value.expiresAt) > Date.now();
        });
        if (!selected && input.budgetCapMinorUnits !== undefined) {
          await ensureOwnerBoundedDevelopmentPolicy({ context: input.context, loaded, runnerId: input.runnerId,
            budgetCapMinorUnits: input.budgetCapMinorUnits });
          const configured = await db.instance.execute(sql`
            SELECT id, conditions->'definition' AS definition FROM approval_rules
            WHERE tenant_id = ${input.context.tenantId} AND project_id = ${projectId}
              AND is_active = true AND conditions->>'schemaVersion' = 'spec224.development-policy.v1'
          `);
          selected = Array.from(configured as unknown as Array<{ id: string; definition: Record<string, any> }>).find(row => {
            const value = row.definition;
            return Array.isArray(value?.initiatorUserIds) && value.initiatorUserIds.includes(input.context.actorId) &&
              Array.isArray(value.profileAllowlist) && value.profileAllowlist.includes(profileId) &&
              Array.isArray(value.environmentAllowlist) && value.environmentAllowlist.includes("development") &&
              Array.isArray(value.operations) && value.operations.includes("spec224.development.run") &&
              Number.isSafeInteger(value.maxBudgetMinorUnits) && value.maxBudgetMinorUnits === input.budgetCapMinorUnits &&
              Array.isArray(value.resourceScopes) && requiredPolicyScopes.every(required =>
                value.resourceScopes.some((allowed: { kind?: string; id?: string }) => allowed.kind === required.kind && allowed.id === required.id)) &&
              String(value.currency).toUpperCase() === "USD" && Date.parse(value.expiresAt) > Date.now();
          });
        }
        if (!selected) throw new Spec224AuthorizationError("SPEC224_NONPRODUCTION_POLICY_NOT_CONFIGURED");
        const policy = selected.definition;
        if (String(policy.currency).toUpperCase() !== "USD")
          throw new Spec224AuthorizationError("SPEC224_EXISTING_POLICY_CURRENCY_MISMATCH");
        const budgetCapMinorUnits = input.budgetCapMinorUnits === undefined
          ? policy.maxBudgetMinorUnits
          : Math.min(input.budgetCapMinorUnits, policy.maxBudgetMinorUnits);
        let approvalRef = current.references?.approvalRef;
        if (current.status === "APPROVAL_REQUIRED") {
          if (approvalRef) return current; // Pending/rejected decisions cannot be silently replaced.
          const deadline = new Date(Math.min(Date.now() + Math.min(policy.maxTtlSeconds, 86_400) * 1000, Date.parse(policy.expiresAt))).toISOString();
          const approval = await service.requestApproval({ ...input, provider: "codex", profileId,
            deadline, budgetCapMinorUnits, currency: policy.currency,
            policyId: selected.id, policyOnly: true });
          approvalRef = approval.approvalRef;
          current = await status();
        }
        if (current.status !== "BUDGET_REQUIRED" || !approvalRef) return current;
        let reservation = current.references?.budgetReservationRef;
        if (!reservation) {
          let [budget] = await db.select({ id: economicBudgets.id }).from(economicBudgets).where(and(
            eq(economicBudgets.tenantId, input.context.tenantId), eq(economicBudgets.currency, policy.currency.toUpperCase()),
            eq(economicBudgets.status, "active"),
            or(
              and(eq(economicBudgets.scopeType, "worker_job"), eq(economicBudgets.scopeRef, loaded.run.workerJobId!)),
              and(eq(economicBudgets.scopeType, "user"), eq(economicBudgets.scopeRef, String(input.context.actorId))),
              and(eq(economicBudgets.scopeType, "tenant"), eq(economicBudgets.scopeRef, input.context.tenantId)),
              and(eq(economicBudgets.scopeType, "project"), eq(economicBudgets.scopeRef, projectId)),
            ),
          )).orderBy(sql`CASE ${economicBudgets.scopeType} WHEN 'worker_job' THEN 0 WHEN 'user' THEN 1 WHEN 'project' THEN 2 ELSE 3 END`, economicBudgets.id).limit(1);
          if (!budget && input.budgetCapMinorUnits !== undefined) {
            await provisionEconomicBudget(db.instance, {
              authorization: { tenantId: input.context.tenantId, actorId: input.context.actorId, role: input.context.actorRole ?? "user" },
              scopeType: "worker_job", scopeRef: loaded.run.workerJobId!, currency: policy.currency,
              limitMinorUnits: budgetCapMinorUnits, idempotencyKey: `spec224:${loaded.run.runId}:development-budget`,
            });
            [budget] = await db.select({ id: economicBudgets.id }).from(economicBudgets).where(and(
              eq(economicBudgets.tenantId, input.context.tenantId), eq(economicBudgets.currency, policy.currency.toUpperCase()),
              eq(economicBudgets.scopeType, "worker_job"), eq(economicBudgets.scopeRef, loaded.run.workerJobId!),
              eq(economicBudgets.status, "active"),
            )).limit(1);
          }
          if (!budget) throw new Spec224AuthorizationError("SPEC224_AUTHORIZED_BUDGET_NOT_CONFIGURED");
          const hold = await service.reserveBudget({ ...input, approvalRef, budgetId: budget.id,
            amountMinorUnits: budgetCapMinorUnits, currency: policy.currency });
          reservation = hold.budgetReservationRef;
        }
        return await service.bind({ ...input, approvalRef, budgetReservationRef: reservation });
      } catch (error) {
        if (!(error instanceof Spec224AuthorizationError)) throw error;
        return { version: "spec-224-authorization-binding-v1", status: "NOT_CONFIGURED", reasons: [error.code] };
      }
    },
    async status(input: {
      context: Spec224AuthorizationContext;
      runId: string;
      runnerId?: string;
      provider?: "codex" | "claude_code";
      now?: Date;
    }): Promise<Spec224AuthorizationResult> {
      const loaded = await loadRun(input.context, input.runId);
      if (loaded.pending.status === "REVOKED")
        return {
          version: "spec-224-authorization-binding-v1",
          status: "REVOKED",
          reasons: ["AUTHORIZATION_REVOKED"],
          references: {
            ...(loaded.pending.runnerId
              ? { runnerId: loaded.pending.runnerId }
              : {}),
            ...(loaded.pending.approvalRef
              ? { approvalRef: loaded.pending.approvalRef }
              : {}),
            ...(loaded.pending.budgetReservationRef
              ? { budgetReservationRef: loaded.pending.budgetReservationRef }
              : {}),
          },
        };
      const provider = input.provider ?? "codex";
      const runnerId =
        input.runnerId ??
        loaded.pending.runnerId ??
        loaded.existingBinding?.runnerId;
      const runner = runnerId
        ? mapRunner(
            await defaultRunnerGateway.getNode(runnerId, input.context.tenantId)
          )
        : null;
      const approval = await readApproval(
        input.context,
        loaded.pending.approvalRef ??
          loaded.existingBinding?.approvalRef ??
          null
      );
      const budget = await readBudget(
        input.context,
        loaded.pending.budgetReservationRef ??
          loaded.existingBinding?.budgetReservationRef ??
          null
      );
      const evaluated = evaluateSpec224Authorization({
        now: input.now,
        run: runInput(loaded, provider),
        runner,
        approval,
        budget,
      });
      return {
        ...evaluated,
        references: {
          ...(runnerId ? { runnerId } : {}),
          ...(approval?.approvalRef
            ? { approvalRef: approval.approvalRef }
            : {}),
          ...(budget?.budgetReservationRef
            ? { budgetReservationRef: budget.budgetReservationRef }
            : {}),
        },
      };
    },

    async requestApproval(input: {
      context: Spec224AuthorizationContext;
      runId: string;
      runnerId: string;
      provider: "codex" | "claude_code";
      deadline: string;
      budgetCapMinorUnits: number;
      currency: string;
      profileId: string;
      policyId?: string;
      policyOnly?: boolean;
    }): Promise<Spec224ApprovalEvidence> {
      if (
        !Number.isSafeInteger(input.budgetCapMinorUnits) ||
        input.budgetCapMinorUnits <= 0 ||
        !/^[A-Za-z]{3}$/.test(input.currency)
      )
        throw new Spec224AuthorizationError("APPROVAL_BUDGET_BINDING_INVALID");
      const loaded = await loadRun(input.context, input.runId);
      const runner = mapRunner(
        await defaultRunnerGateway.getNode(
          input.runnerId,
          input.context.tenantId
        )
      );
      if (!runner) throw new Spec224AuthorizationError("RUNNER_NOT_FOUND");
      const check = evaluateSpec224Authorization({
        run: { ...runInput(loaded, input.provider), deadline: input.deadline },
        runner,
        approval: null,
        budget: null,
      });
      if (check.status !== "APPROVAL_REQUIRED")
        throw new Spec224AuthorizationError(check.reasons[0] ?? check.status);
      const policyDecision = input.provider === "codex" ? await createPolicyDecision(
              input.context,
              loaded,
              runner,
              input.profileId,
              input.deadline,
              input.budgetCapMinorUnits,
              input.currency,
              input.policyId
            ) : null;
      if (input.policyOnly && !policyDecision) throw new Spec224AuthorizationError("SPEC224_POLICY_BINDING_REQUIRED");
      const created = policyDecision ?? await createApproval(
              input.context,
              loaded,
              runner,
              input.provider,
              input.profileId,
              input.deadline,
              input.budgetCapMinorUnits,
              input.currency
            );
      await persistAuthorizationProjection(
        input.context,
        loaded,
        {
          status:
            created.status === "approved"
              ? "BUDGET_REQUIRED"
              : "APPROVAL_REQUIRED",
          runnerId: input.runnerId,
          approvalRef: created.approvalRef,
          deadline: input.deadline,
          budgetCapMinorUnits: input.budgetCapMinorUnits,
          currency: input.currency.trim().toUpperCase(),
        },
        `approval:${created.approvalRef}`
      );
      return created;
    },

    async reserveBudget(input: {
      context: Spec224AuthorizationContext;
      runId: string;
      runnerId: string;
      approvalRef: string;
      budgetId: string;
      amountMinorUnits: number;
      currency: string;
    }): Promise<Spec224BudgetEvidence> {
      const loaded = await loadRun(input.context, input.runId);
      const approval = await readApproval(input.context, input.approvalRef);
      const runner = mapRunner(
        await defaultRunnerGateway.getNode(
          input.runnerId,
          input.context.tenantId
        )
      );
      const approvalDeadline =
        typeof approval?.payload.deadline === "string"
          ? approval.payload.deadline
          : undefined;
      const check = evaluateSpec224Authorization({
        run: runInput(loaded, "codex", approvalDeadline),
        runner,
        approval,
        budget: null,
      });
      if (check.status !== "BUDGET_REQUIRED")
        throw new Spec224AuthorizationError(check.reasons[0] ?? check.status);
      if (
        !approval ||
        approval.payload.budgetCapMinorUnits !== input.amountMinorUnits ||
        typeof approval.payload.currency !== "string" ||
        approval.payload.currency.trim().toUpperCase() !==
          input.currency.trim().toUpperCase()
      )
        throw new Spec224AuthorizationError("APPROVAL_BUDGET_BINDING_MISMATCH");
      const reservation = reserveInput(
          input.context,
          loaded,
          input.budgetId,
          input.amountMinorUnits,
          input.currency
        );
      // Preserve the identity of holds created before deterministic intent IDs.
      const [previousHold] = await db.select({ intentId: economicHolds.intentId })
        .from(economicHolds).where(and(
          eq(economicHolds.tenantId, input.context.tenantId),
          eq(economicHolds.idempotencyKey, reservation.idempotencyKey)
        )).limit(1);
      if (previousHold) reservation.intent.intentId = previousHold.intentId;
      const hold = await reserveEconomicHold(db.instance, reservation);
      await persistAuthorizationProjection(
        input.context,
        loaded,
        {
          status: "BUDGET_REQUIRED",
          runnerId: input.runnerId,
          approvalRef: input.approvalRef,
          budgetReservationRef: hold.id,
          budgetCapMinorUnits: input.amountMinorUnits,
          currency: input.currency.trim().toUpperCase(),
          deadline: approvalDeadline,
        },
        `budget:${hold.id}`
      );
      return {
        budgetReservationRef: hold.id,
        tenantId: hold.tenantId,
        workerJobId: loaded.run.workerJobId!,
        attemptId: loaded.attemptId!,
        status: hold.status as Spec224BudgetEvidence["status"],
        amountMinorUnits: hold.amountMinorUnits,
        currency: hold.currency,
        expiresAt: null,
      };
    },

    async revoke(input: {
      context: Spec224AuthorizationContext;
      runId: string;
      approvalRef: string;
      budgetReservationRef: string;
    }): Promise<{
      status: "REVOKED";
      approvalRef: string;
      budgetReservationRef: string;
    }> {
      const loaded = await loadRun(input.context, input.runId);
      const budget = await readBudget(
        input.context,
        input.budgetReservationRef
      );
      if (
        !budget ||
        budget.workerJobId !== loaded.run.workerJobId ||
        budget.attemptId !== loaded.attemptId
      ) {
        throw new Spec224AuthorizationError("BUDGET_BINDING_MISMATCH");
      }
      const debitAccount =
        process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID?.trim();
      const creditAccount =
        process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID?.trim();
      if (!debitAccount || !creditAccount)
        throw new Spec224AuthorizationError(
          "ECONOMIC_LEDGER_ACCOUNTS_NOT_CONFIGURED"
        );
      const releaseInput: DurableReleaseInput = {
        tenantId: input.context.tenantId,
        holdId: input.budgetReservationRef,
        idempotencyKey:
          `spec224:revoke:${input.runId}:${input.budgetReservationRef}`.slice(
            0,
            128
          ),
        actorId: String(input.context.actorId),
        policyVersion: "spec224-authorization-binding-v1",
        journalDescription: `Release revoked Spec 224 Codex execution ${input.runId}`,
        journalLines: [
          {
            accountId: creditAccount,
            tenantId: input.context.tenantId,
            currency: budget.currency,
            debitMinorUnits: budget.amountMinorUnits,
            creditMinorUnits: 0,
          },
          {
            accountId: debitAccount,
            tenantId: input.context.tenantId,
            currency: budget.currency,
            debitMinorUnits: 0,
            creditMinorUnits: budget.amountMinorUnits,
          },
        ],
      };
      await releaseEconomicHold(db.instance, releaseInput);
      const runtime = await getAppRuntimeConfig();
      const response = await fetch(
        `${runtime.pythonBackendUrl}/api/v1/approvals/requests/${encodeURIComponent(input.approvalRef)}/cancel`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${requiredToken(input.context)}` },
        }
      );
      if (!response.ok && response.status !== 404)
        throw new Spec224AuthorizationError("APPROVAL_REVOCATION_REJECTED");
      await persistAuthorizationProjection(
        input.context,
        loaded,
        {
          status: "REVOKED",
          approvalRef: input.approvalRef,
          budgetReservationRef: input.budgetReservationRef,
        },
        `revoked:${input.budgetReservationRef}`
      );
      return {
        status: "REVOKED",
        approvalRef: input.approvalRef,
        budgetReservationRef: input.budgetReservationRef,
      };
    },

    async bind(input: {
      context: Spec224AuthorizationContext;
      runId: string;
      runnerId: string;
      approvalRef: string;
      budgetReservationRef: string;
      now?: Date;
    }): Promise<Spec224AuthorizationResult> {
      const loaded = await loadRun(input.context, input.runId);
      const runner = mapRunner(
        await defaultRunnerGateway.getNode(
          input.runnerId,
          input.context.tenantId
        )
      );
      const approval = await readApproval(input.context, input.approvalRef);
      const budget = await readBudget(
        input.context,
        input.budgetReservationRef
      );
      const approvalDeadline =
        typeof approval?.payload.deadline === "string"
          ? approval.payload.deadline
          : undefined;
      const evaluated = evaluateSpec224Authorization({
        now: input.now,
        run: runInput(loaded, "codex", approvalDeadline),
        runner,
        approval,
        budget,
      });
      if (evaluated.status !== "READY_FOR_LIVE" || !evaluated.binding)
        return evaluated;
      await persistBinding(input.context, loaded, evaluated.binding);
      if (!loaded.run.workerJobId) {
        throw new Spec224AuthorizationError("RUN_JOB_REQUIRED");
      }
      const released = await createJobControlPlane(
        defaultJobControlPlaneRepository
      ).releaseAuthorizationHold({
        jobId: loaded.run.workerJobId,
        tenantId: input.context.tenantId,
        requestedByUserId: input.context.actorId,
      });
      if (!released) {
        throw new Spec224AuthorizationError("HOLD_RELEASE_NOT_ALLOWED");
      }
      return evaluated;
    },
  };
  return service;
}

export const defaultSpec224AuthorizationService =
  createSpec224AuthorizationService();
