import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  economicHolds,
  workerJobAttempts,
  workerJobs,
} from "../../drizzle/schema";
import { db, getDb } from "../db";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { appendJobEvent } from "./jobControlPlane";
import {
  releaseEconomicHold,
  reserveEconomicHold,
  type DurableReserveInput,
  type DurableReleaseInput,
} from "./economicDurableService";
import {
  type AgentTaskManifest,
  validateAgentTaskManifest,
} from "./agentControlPlaneContracts";
import {
  defaultRunnerGateway,
  type RunnerGatewayNode,
} from "./runnerGateway";
import {
  evaluateSpec224Authorization,
  type Spec224ApprovalEvidence,
  type Spec224AuthorizationInput,
  type Spec224AuthorizationResult,
  type Spec224AuthorizationRun,
  type Spec224AuthorizationRunner,
  type Spec224BudgetEvidence,
  type Spec224PolicyBinding,
} from "./spec224AuthorizationBinding";
import type { DevelopmentRun } from "./spec224DevelopmentRunContracts";

export class Spec224AuthorizationError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "Spec224AuthorizationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type Spec224AuthorizationContext = {
  tenantId: string;
  actorId: number;
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
    spendCeilingMicros?: number;
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
    typeof raw.spendCeilingMicros !== "number" ||
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
    provider,
    deadline:
      deadline ??
      loaded.pending.deadline ??
      loaded.existingBinding?.deadline ??
      new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

function mapRunner(node: RunnerGatewayNode | null): Spec224AuthorizationRunner | null {
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
  deadline: string,
  spendCeilingMicros: number
): Promise<Spec224ApprovalEvidence> {
  const runtime = await getAppRuntimeConfig();
  const response = await fetch(`${runtime.pythonBackendUrl}/api/v1/approvals/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requiredToken(ctx)}`,
    },
    body: JSON.stringify({
      request_type: "code_execution",
      title: `Approve ${provider} execution for ${loaded.run.runId}`,
      description: "Owner approval for a bounded Spec 224 external-agent run.",
      execution_id: loaded.run.workerJobId,
      risk_level: "high",
      required_approvers: 1,
      timeout_minutes: Math.max(5, Math.min(10080, Math.ceil((Date.parse(deadline) - Date.now()) / 60000))),
      payload: {
        runId: loaded.run.runId,
        provider,
        workspaceId: loaded.run.workspaceId,
        runnerId: runner.runnerId,
        runnerSessionId: runner.activeSessionId,
        capabilitySnapshotId: runner.snapshot?.capabilitySnapshotId,
        capabilitySnapshotRevision: runner.snapshot?.revision,
        authorizationGrantRef:
          runner.snapshot?.toolInventory?.find(
            tool => tool.toolId === provider || tool.adapterId === `${provider}.v1`
          )?.authorizationEvidenceRef,
        spendCeilingMicros,
        deadline,
      },
    }),
  });
  if (!response.ok)
    throw new Spec224AuthorizationError("APPROVAL_REQUEST_REJECTED");
  const data = await response.json();
  const mapped = mapApproval(data, String(data.id ?? ""));
  if (!mapped?.approvalRef)
    throw new Spec224AuthorizationError("APPROVAL_REFERENCE_MISSING");
  return mapped;
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
        eq(workerJobs.id, runId),
        eq(workerJobs.tenantId, ctx.tenantId),
        eq(workerJobs.requestedByUserId, ctx.actorId)
      )
    )
    .limit(1);

  let job = row;
  if (!job) {
    const rows = await db
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
          eq(workerJobs.requestedByUserId, ctx.actorId)
        )
      )
      .limit(100);
    job = rows.find(candidate => {
      const projection = asRecord(candidate.progressJson?.spec224);
      const inputRun = asRecord(candidate.inputJson?.spec224Run);
      return projection?.runId === runId || inputRun?.runId === runId;
    });
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
      runnerId: typeof pending.runnerId === "string" ? pending.runnerId : undefined,
      approvalRef: typeof pending.approvalRef === "string" ? pending.approvalRef : undefined,
      budgetReservationRef:
        typeof pending.budgetReservationRef === "string"
          ? pending.budgetReservationRef
          : undefined,
      deadline: typeof pending.deadline === "string" ? pending.deadline : undefined,
      spendCeilingMicros:
        typeof pending.spendCeilingMicros === "number"
          ? pending.spendCeilingMicros
          : undefined,
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
      .select({ progressJson: workerJobs.progressJson, status: workerJobs.status })
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
    .where(and(eq(economicHolds.id, ref), eq(economicHolds.tenantId, ctx.tenantId)))
    .limit(1);
  return mapHold(row);
}

function reserveInput(
  ctx: Spec224AuthorizationContext,
  loaded: LoadedRun,
  budgetId: string,
  amountMinorUnits: number,
  currency: string
): DurableReserveInput {
  const debitAccount = process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID?.trim();
  const creditAccount = process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID?.trim();
  if (!debitAccount || !creditAccount)
    throw new Spec224AuthorizationError("ECONOMIC_LEDGER_ACCOUNTS_NOT_CONFIGURED");
  if (!loaded.run.workerJobId || !loaded.attemptId)
    throw new Spec224AuthorizationError("RUN_ATTEMPT_REQUIRED");
  const normalizedCurrency = currency.trim().toUpperCase();
  const idempotencyKey = `spec224:codex:${loaded.run.runId}:${loaded.attemptId}:${amountMinorUnits}`.slice(0, 128);
  return {
    budgetId,
    idempotencyKey,
    intent: {
      intentId: randomUUID(),
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
    },
    journalDescription: `Reserve Spec 224 Codex execution ${loaded.run.runId}`,
    journalLines: [
      { accountId: debitAccount, tenantId: ctx.tenantId, currency: normalizedCurrency, debitMinorUnits: amountMinorUnits, creditMinorUnits: 0 },
      { accountId: creditAccount, tenantId: ctx.tenantId, currency: normalizedCurrency, debitMinorUnits: 0, creditMinorUnits: amountMinorUnits },
    ],
  };
}

async function persistBinding(
  ctx: Spec224AuthorizationContext,
  loaded: LoadedRun,
  binding: Spec224PolicyBinding
): Promise<void> {
  if (!loaded.run.workerJobId) throw new Spec224AuthorizationError("RUN_JOB_REQUIRED");
  await db.transaction(async tx => {
    const [row] = await tx
      .select({ inputJson: workerJobs.inputJson, progressJson: workerJobs.progressJson, status: workerJobs.status })
      .from(workerJobs)
      .where(and(eq(workerJobs.id, loaded.run.workerJobId!), eq(workerJobs.tenantId, ctx.tenantId), eq(workerJobs.requestedByUserId, ctx.actorId)))
      .for("update")
      .limit(1);
    if (!row) throw new Spec224AuthorizationError("RUN_NOT_FOUND");
    if (row.status !== "pending" && row.status !== "queued")
      throw new Spec224AuthorizationError("AUTH_BINDING_JOB_NOT_QUEUED");
    const inputJson = { ...row.inputJson };
    const manifest = asRecord(inputJson.manifest);
    if (!manifest) throw new Spec224AuthorizationError("AGENT_MANIFEST_MISSING");
    const validated = validateAgentTaskManifest({ ...manifest, policyBinding: binding } as AgentTaskManifest);
    const manifestHash = createHash("sha256").update(JSON.stringify(validated), "utf8").digest("hex");
    const nextInput = { ...inputJson, manifest: validated, manifestHash };
    const progress = { ...row.progressJson, spec224Authorization: { binding, status: "READY_FOR_LIVE", updatedAt: new Date().toISOString() } };
    await tx.update(workerJobs).set({ inputJson: nextInput, progressJson: progress }).where(eq(workerJobs.id, loaded.run.workerJobId!));
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
  return {
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
            ...(loaded.pending.runnerId ? { runnerId: loaded.pending.runnerId } : {}),
            ...(loaded.pending.approvalRef ? { approvalRef: loaded.pending.approvalRef } : {}),
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
        ? mapRunner(await defaultRunnerGateway.getNode(runnerId, input.context.tenantId))
        : null;
      const approval = await readApproval(
        input.context,
        loaded.pending.approvalRef ?? loaded.existingBinding?.approvalRef ?? null
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
          ...(approval?.approvalRef ? { approvalRef: approval.approvalRef } : {}),
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
      spendCeilingMicros: number;
    }): Promise<Spec224ApprovalEvidence> {
      const loaded = await loadRun(input.context, input.runId);
      const runner = mapRunner(await defaultRunnerGateway.getNode(input.runnerId, input.context.tenantId));
      if (!runner) throw new Spec224AuthorizationError("RUNNER_NOT_FOUND");
      const check = evaluateSpec224Authorization({
        run: { ...runInput(loaded, input.provider), deadline: input.deadline },
        runner,
        approval: null,
        budget: null,
      });
      if (check.status !== "APPROVAL_REQUIRED")
        throw new Spec224AuthorizationError(check.reasons[0] ?? check.status);
      const created = await createApproval(
        input.context,
        loaded,
        runner,
        input.provider,
        input.deadline,
        input.spendCeilingMicros
      );
      await persistAuthorizationProjection(
        input.context,
        loaded,
        {
          status: "APPROVAL_REQUIRED",
          runnerId: input.runnerId,
          approvalRef: created.approvalRef,
          deadline: input.deadline,
          spendCeilingMicros: input.spendCeilingMicros,
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
      const runner = mapRunner(await defaultRunnerGateway.getNode(input.runnerId, input.context.tenantId));
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
      const hold = await reserveEconomicHold(db, reserveInput(input.context, loaded, input.budgetId, input.amountMinorUnits, input.currency));
      await persistAuthorizationProjection(
        input.context,
        loaded,
        {
          status: "BUDGET_REQUIRED",
          runnerId: input.runnerId,
          approvalRef: input.approvalRef,
          budgetReservationRef: hold.id,
          spendCeilingMicros: input.amountMinorUnits,
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
    }): Promise<{ status: "REVOKED"; approvalRef: string; budgetReservationRef: string }> {
      const loaded = await loadRun(input.context, input.runId);
      const budget = await readBudget(input.context, input.budgetReservationRef);
      if (
        !budget ||
        budget.workerJobId !== loaded.run.workerJobId ||
        budget.attemptId !== loaded.attemptId
      ) {
        throw new Spec224AuthorizationError("BUDGET_BINDING_MISMATCH");
      }
      const debitAccount = process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID?.trim();
      const creditAccount = process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID?.trim();
      if (!debitAccount || !creditAccount)
        throw new Spec224AuthorizationError("ECONOMIC_LEDGER_ACCOUNTS_NOT_CONFIGURED");
      const releaseInput: DurableReleaseInput = {
        tenantId: input.context.tenantId,
        holdId: input.budgetReservationRef,
        idempotencyKey: `spec224:revoke:${input.runId}:${input.budgetReservationRef}`.slice(0, 128),
        journalDescription: `Release revoked Spec 224 Codex execution ${input.runId}`,
        journalLines: [
          { accountId: creditAccount, tenantId: input.context.tenantId, currency: budget.currency, debitMinorUnits: budget.amountMinorUnits, creditMinorUnits: 0 },
          { accountId: debitAccount, tenantId: input.context.tenantId, currency: budget.currency, debitMinorUnits: 0, creditMinorUnits: budget.amountMinorUnits },
        ],
      };
      await releaseEconomicHold(db, releaseInput);
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
      const runner = mapRunner(await defaultRunnerGateway.getNode(input.runnerId, input.context.tenantId));
      const approval = await readApproval(input.context, input.approvalRef);
      const budget = await readBudget(input.context, input.budgetReservationRef);
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
      return evaluated;
    },
  };
}

export const defaultSpec224AuthorizationService = createSpec224AuthorizationService();
