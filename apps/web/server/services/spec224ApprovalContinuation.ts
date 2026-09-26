import type { JobControlPlane } from "./jobControlPlane";
import { getAppRuntimeConfig, getCachedPreferredInternalToken } from "./appRuntimeConfig";

const SECRET_KEY = /(?:access[_-]?token|api[_-]?key|authorization|credential|password|private[_-]?key|refresh[_-]?token|secret|token)/i;

export type Spec224ExternalApprovalCorrelation = {
  jobId: string;
  tenantId: string;
  operationKey: string;
  provider: "codex" | "claude_code";
  providerRequestId: string;
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  fencingVersion: number;
  actionId: string;
  requesterId: number;
  semanticState: Record<string, unknown>;
};

type ApprovalRecord = {
  id: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  tenantId: string | null;
  executionId: string | null;
  requesterId?: number | null;
  approverId?: number | null;
  payload: Record<string, unknown>;
};

type ApprovalAuthority = {
  create(input: {
    tenantId: string;
    requesterId: number;
    executionId: string;
    requestType: "code_execution";
    riskLevel: "high";
    title: string;
    description: string;
    payload: Record<string, unknown>;
    timeoutMinutes: number;
  }): Promise<{ id: string; status: "pending"; tenantId?: string | null; executionId?: string | null }>;
  get(approvalRef: string): Promise<ApprovalRecord | null>;
};

type ControlPlane = Pick<
  JobControlPlane,
  "requestComputerUseApproval" | "resolveComputerUseApproval" | "failExternalWait"
>;

export type Spec224ApprovalContinuationDeps = {
  authority: ApprovalAuthority;
  controlPlane: ControlPlane;
};

export type Spec224ApprovalContinuationOptions = {
  now?: () => Date;
};

export type Spec224ApprovalContinuationResult =
  | "pending"
  | "resumed"
  | "failed"
  | "duplicate"
  | "ignored"
  | "operator_review";

function assertText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 255)
    throw new Error(`SPEC224_APPROVAL_${field.toUpperCase()}_INVALID`);
}

function assertSafePayload(value: unknown, depth = 0): void {
  if (depth > 6) throw new Error("SPEC224_APPROVAL_PAYLOAD_TOO_DEEP");
  if (Array.isArray(value)) {
    value.forEach(item => assertSafePayload(item, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error("SPEC224_APPROVAL_SECRET_FIELD");
    assertSafePayload(child, depth + 1);
  }
}

function validateCorrelation(input: Spec224ExternalApprovalCorrelation): void {
  for (const [value, field] of [
    [input.jobId, "job_id"],
    [input.tenantId, "tenant_id"],
    [input.operationKey, "operation_key"],
    [input.providerRequestId, "provider_request_id"],
    [input.runnerId, "runner_id"],
    [input.runnerSessionId, "runner_session_id"],
    [input.capabilitySnapshotId, "capability_snapshot_id"],
    [input.capabilitySnapshotRevision, "capability_snapshot_revision"],
    [input.actionId, "action_id"],
  ] as const) assertText(value, field);
  if (!Number.isSafeInteger(input.fencingVersion) || input.fencingVersion < 0)
    throw new Error("SPEC224_APPROVAL_FENCE_INVALID");
  if (!Number.isSafeInteger(input.requesterId) || input.requesterId <= 0)
    throw new Error("SPEC224_APPROVAL_REQUESTER_INVALID");
  assertSafePayload(input.semanticState);
}

function correlationFromPayload(payload: Record<string, unknown>): Spec224ExternalApprovalCorrelation | null {
  if (payload.kind !== "spec224_external_agent_approval") return null;
  const raw = payload.spec224ExternalAgentResume;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const correlation = raw as Spec224ExternalApprovalCorrelation;
    validateCorrelation(correlation);
    return correlation;
  } catch {
    return null;
  }
}

export function parseSpec224ExternalApprovalPayload(
  payload: unknown,
): Spec224ExternalApprovalCorrelation | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  const candidate = raw.spec224ExternalAgentResume ?? raw.correlation ?? raw;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  try {
    const correlation = candidate as Spec224ExternalApprovalCorrelation;
    validateCorrelation(correlation);
    return correlation;
  } catch {
    return null;
  }
}

export function createSpec224ExternalApprovalAuthority() {
  return {
    async create(input: Parameters<ApprovalAuthority["create"]>[0]) {
      const runtime = await getAppRuntimeConfig();
      const token = getCachedPreferredInternalToken();
      if (!token) throw new Error("SPEC224_APPROVAL_INTERNAL_TOKEN_REQUIRED");
      const correlation = parseSpec224ExternalApprovalPayload(input.payload);
      if (!correlation) throw new Error("SPEC224_APPROVAL_CORRELATION_INVALID");
      const configuredApprover = Number.parseInt(
        process.env.SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID ?? "",
        10,
      );
      const response = await fetch(`${runtime.pythonBackendUrl}/api/v1/approvals/internal/spec224-external/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-token": token },
        body: JSON.stringify({
          ...correlation,
          requesterId: correlation.requesterId,
          correlationKey: `spec224:${correlation.jobId}:${correlation.providerRequestId}`.slice(0, 255),
          approvers: Number.isSafeInteger(configuredApprover) && configuredApprover > 0
            ? [configuredApprover]
            : [],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.approvalRequestId !== "string" || data.status !== "pending")
        throw new Error("SPEC224_APPROVAL_CREATE_REJECTED");
      return {
        id: data.approvalRequestId,
        status: "pending" as const,
        tenantId: input.tenantId,
        executionId: input.executionId,
      };
    },
    async get(): Promise<ApprovalRecord | null> {
      throw new Error("SPEC224_APPROVAL_LOOKUP_REQUIRES_AUTHORITY_CONTEXT");
    },
  } satisfies ApprovalAuthority;
}

function sameCorrelation(
  expected: Spec224ExternalApprovalCorrelation,
  actual: Spec224ExternalApprovalCorrelation,
): boolean {
  return expected.jobId === actual.jobId
    && expected.tenantId === actual.tenantId
    && expected.operationKey === actual.operationKey
    && expected.provider === actual.provider
    && expected.providerRequestId === actual.providerRequestId
    && expected.runnerId === actual.runnerId
    && expected.runnerSessionId === actual.runnerSessionId
    && expected.capabilitySnapshotId === actual.capabilitySnapshotId
    && expected.capabilitySnapshotRevision === actual.capabilitySnapshotRevision
    && expected.fencingVersion === actual.fencingVersion
    && expected.actionId === actual.actionId;
}

export function createSpec224ApprovalContinuation(
  deps: Spec224ApprovalContinuationDeps,
  options: Spec224ApprovalContinuationOptions = {},
) {
  const now = options.now ?? (() => new Date());

  return {
    async request(input: Spec224ExternalApprovalCorrelation): Promise<{ approvalRef: string; status: "pending" }> {
      validateCorrelation(input);
      const created = await deps.authority.create({
        tenantId: input.tenantId,
        requesterId: input.requesterId,
        executionId: input.jobId,
        requestType: "code_execution",
        riskLevel: "high",
        title: `Approve ${input.provider} tool request for ${input.jobId}`,
        description: "An external agent requested owner approval for a bounded operation.",
        timeoutMinutes: 15,
        payload: {
          kind: "spec224_external_agent_approval",
          provider: input.provider,
          operationKey: input.operationKey,
          spec224ExternalAgentResume: input,
        },
      });
      assertText(created.id, "approval_ref");
      if (created.status !== "pending") throw new Error("SPEC224_APPROVAL_NOT_PENDING");
      const projected = await deps.controlPlane.requestComputerUseApproval(input.jobId, {
        tenantId: input.tenantId,
        operationKey: input.operationKey,
        approvalRequestId: created.id,
        runnerId: input.runnerId,
        runnerSessionId: input.runnerSessionId,
        capabilitySnapshotId: input.capabilitySnapshotId,
        capabilitySnapshotRevision: input.capabilitySnapshotRevision,
        currentCommandId: input.providerRequestId,
        actionId: input.actionId,
        semanticState: input.semanticState,
      });
      if (projected === "ignored") throw new Error("SPEC224_APPROVAL_PROJECTION_REJECTED");
      return { approvalRef: created.id, status: "pending" };
    },

    async resolve(input: { approvalRef: string; tenantId: string }): Promise<Spec224ApprovalContinuationResult> {
      assertText(input.approvalRef, "approval_ref");
      assertText(input.tenantId, "tenant_id");
      const record = await deps.authority.get(input.approvalRef);
      if (!record || record.id !== input.approvalRef || record.tenantId !== input.tenantId)
        return "ignored";
      const correlation = correlationFromPayload(record.payload);
      if (!correlation || correlation.tenantId !== input.tenantId || record.executionId !== correlation.jobId)
        return "ignored";
      if (record.status === "pending") return "pending";
      if (record.status === "expired" || record.status === "cancelled") {
        await deps.controlPlane.failExternalWait(
          correlation.jobId,
          record.status === "expired" ? "SPEC224_APPROVAL_EXPIRED" : "SPEC224_APPROVAL_CANCELLED",
          true,
          now(),
          correlation.operationKey,
        );
        return "operator_review";
      }
      if (record.status !== "approved" && record.status !== "rejected") return "operator_review";
      if (!Number.isSafeInteger(record.approverId) || (record.approverId ?? 0) <= 0)
        return "operator_review";
      const result = await deps.controlPlane.resolveComputerUseApproval({
        jobId: correlation.jobId,
        tenantId: correlation.tenantId,
        operationKey: correlation.operationKey,
        approvalRequestId: record.id,
        decision: record.status,
        runnerId: correlation.runnerId,
        adapter: correlation.provider === "codex" ? "codex.v1" : "claude.v1",
        actionId: correlation.actionId,
        runnerSessionId: correlation.runnerSessionId,
        fencingVersion: correlation.fencingVersion,
        approverId: record.approverId,
      });
      return result;
    },
  };
}
