import type { JobControlPlane } from "./jobControlPlane";
import { getAppRuntimeConfig, getCachedPreferredInternalToken } from "./appRuntimeConfig";
import { createHash } from "node:crypto";

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
  decisionDelivery?: { event: Record<string, unknown>; canonicalPayload: string; payloadDigest: string };
};

type ApprovalLookupScope = { tenantId: string; jobId: string; operationId: string };

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
  get(approvalRef: string, scope: ApprovalLookupScope): Promise<ApprovalRecord | null>;
  acknowledge(input: ApprovalLookupScope & { approvalRef: string; deliveryId: string; payloadDigest: string; receipt: Record<string, unknown> }): Promise<void>;
};

type ControlPlane = Pick<
  JobControlPlane,
  "requestComputerUseApproval" | "resolveComputerUseApproval" | "failExternalWait" | "recordSpec224ApprovalDelivery"
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
    async get(approvalRef: string, scope: ApprovalLookupScope): Promise<ApprovalRecord | null> {
      const runtime = await getAppRuntimeConfig();
      const token = getCachedPreferredInternalToken();
      if (!token) throw new Error("SPEC224_APPROVAL_INTERNAL_TOKEN_REQUIRED");
      const query = new URLSearchParams({ tenantId: scope.tenantId, jobId: scope.jobId, operationId: scope.operationId });
      const response = await fetch(
        `${runtime.pythonBackendUrl}/api/v1/approvals/internal/spec224-external/requests/${encodeURIComponent(approvalRef)}/decision?${query}`,
        { headers: { "x-internal-token": token } },
      );
      if (!response.ok) throw new Error("SPEC224_APPROVAL_LOOKUP_REJECTED");
      const body = await response.json().catch(() => ({})) as {
        status?: string;
        correlation?: Record<string, unknown>;
        delivery?: { event?: Record<string, unknown>; canonicalPayload?: string; payloadDigest?: string } | null;
      };
      const delivery = body.delivery;
      if (!delivery?.event || typeof delivery.canonicalPayload !== "string" || typeof delivery.payloadDigest !== "string") {
        if (body.status === "pending") {
          return {
            id: approvalRef,
            status: "pending",
            tenantId: scope.tenantId,
            executionId: scope.jobId,
            payload: {
              kind: "spec224_external_agent_approval",
              spec224ExternalAgentResume: body.correlation,
            },
          };
        }
        return null;
      }
      let canonicalEvent: unknown;
      try { canonicalEvent = JSON.parse(delivery.canonicalPayload); }
      catch { throw new Error("SPEC224_APPROVAL_DELIVERY_CANONICAL_INVALID"); }
      if (!canonicalEvent || typeof canonicalEvent !== "object" || Array.isArray(canonicalEvent))
        throw new Error("SPEC224_APPROVAL_DELIVERY_CANONICAL_INVALID");
      const event = canonicalEvent as Record<string, unknown>;
      if (createHash("sha256").update(delivery.canonicalPayload, "utf8").digest("hex") !== delivery.payloadDigest)
        throw new Error("SPEC224_APPROVAL_DELIVERY_DIGEST_MISMATCH");
      if (
        event.schemaVersion !== "spec224.approval-decision.v1"
        || event.decisionEpoch !== 1
        || event.approvalRequestId !== approvalRef
        || event.tenantId !== scope.tenantId
        || event.jobId !== scope.jobId
        || event.operationId !== scope.operationId
      ) throw new Error("SPEC224_APPROVAL_DELIVERY_SCOPE_MISMATCH");
      const correlation = event.correlation;
      if (!correlation || typeof correlation !== "object" || Array.isArray(correlation))
        throw new Error("SPEC224_APPROVAL_DELIVERY_CORRELATION_INVALID");
      const decision = event.decision;
      const status = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : decision === "expired" ? "expired" : decision === "cancelled" ? "cancelled" : null;
      if (!status) throw new Error("SPEC224_APPROVAL_DELIVERY_DECISION_INVALID");
      return {
        id: approvalRef,
        status,
        tenantId: scope.tenantId,
        executionId: scope.jobId,
        approverId: typeof event.actorId === "number" ? event.actorId : null,
        payload: { kind: "spec224_external_agent_approval", spec224ExternalAgentResume: correlation },
        decisionDelivery: { event, canonicalPayload: delivery.canonicalPayload, payloadDigest: delivery.payloadDigest },
      };
    },
    async acknowledge(input: ApprovalLookupScope & { approvalRef: string; deliveryId: string; payloadDigest: string; receipt: Record<string, unknown> }) {
      const runtime = await getAppRuntimeConfig();
      const token = getCachedPreferredInternalToken();
      if (!token) throw new Error("SPEC224_APPROVAL_INTERNAL_TOKEN_REQUIRED");
      const response = await fetch(
        `${runtime.pythonBackendUrl}/api/v1/approvals/internal/spec224-external/requests/${encodeURIComponent(input.approvalRef)}/decision/ack`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-token": token },
          body: JSON.stringify({ ...input, tenantId: input.tenantId, jobId: input.jobId, operationId: input.operationId }),
        },
      );
      if (!response.ok) throw new Error("SPEC224_APPROVAL_ACK_REJECTED");
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
        provider: input.provider,
      });
      if (projected === "ignored") throw new Error("SPEC224_APPROVAL_PROJECTION_REJECTED");
      return { approvalRef: created.id, status: "pending" };
    },

    async resolve(input: { approvalRef: string; tenantId: string; jobId: string; operationId: string }): Promise<Spec224ApprovalContinuationResult> {
      assertText(input.approvalRef, "approval_ref");
      assertText(input.tenantId, "tenant_id");
      assertText(input.jobId, "job_id");
      assertText(input.operationId, "operation_id");
      const record = await deps.authority.get(input.approvalRef, {
        tenantId: input.tenantId,
        jobId: input.jobId,
        operationId: input.operationId,
      });
      if (!record || record.id !== input.approvalRef || record.tenantId !== input.tenantId)
        return await deps.controlPlane.failExternalWait(
          input.jobId,
          "SPEC224_APPROVAL_AUTHORITY_RECORD_MISSING_OR_MISMATCHED",
          true,
          now(),
          input.operationId,
        ) === "failed" ? "operator_review" : "ignored";
      const correlation = correlationFromPayload(record.payload);
      if (!correlation || correlation.tenantId !== input.tenantId || record.executionId !== correlation.jobId)
        return await deps.controlPlane.failExternalWait(
          input.jobId,
          "SPEC224_APPROVAL_CORRELATION_INVALID",
          true,
          now(),
          input.operationId,
        ) === "failed" ? "operator_review" : "ignored";
      if (record.status === "pending") return "pending";
      const delivery = record.decisionDelivery;
      const event = delivery?.event;
      if (!delivery || !event || typeof event.deliveryId !== "string" || typeof event.decisionEpoch !== "number")
        return "operator_review";
      const deliveryId = event.deliveryId;
      const payloadDigest = delivery.payloadDigest;
      let result: Spec224ApprovalContinuationResult;
      if (record.status === "expired" || record.status === "cancelled") {
        const terminalDelivery = {
          jobId: correlation.jobId,
          tenantId: correlation.tenantId,
          approvalRequestId: record.id,
          operationId: correlation.operationKey,
          decision: record.status,
          deliveryId,
          decisionEpoch: event.decisionEpoch,
          payloadDigest,
          result: "operator_review" as const,
        };
        const failed = await deps.controlPlane.failExternalWait(
          correlation.jobId,
          record.status === "expired" ? "SPEC224_APPROVAL_EXPIRED" : "SPEC224_APPROVAL_CANCELLED",
          true,
          now(),
          correlation.operationKey,
          undefined,
          terminalDelivery,
        );
        if (failed !== "failed") throw new Error("SPEC224_APPROVAL_TERMINAL_OUTCOME_AMBIGUOUS");
        result = "operator_review";
      } else {
        if (record.status !== "approved" && record.status !== "rejected") return "operator_review";
        if (!Number.isSafeInteger(record.approverId) || (record.approverId ?? 0) <= 0)
          return "operator_review";
        const resolved = await deps.controlPlane.resolveComputerUseApproval({
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
          schemaVersion: "spec224.approval-decision.v1",
          deliveryId,
          decisionEpoch: event.decisionEpoch,
          payloadDigest,
          capabilitySnapshotId: correlation.capabilitySnapshotId,
          capabilitySnapshotRevision: correlation.capabilitySnapshotRevision,
          providerRequestId: correlation.providerRequestId,
          provider: correlation.provider,
        });
        if (resolved === "ignored") {
          const failed = await deps.controlPlane.failExternalWait(
            correlation.jobId,
            "SPEC224_APPROVAL_RESUME_FENCED",
            true,
            now(),
            correlation.operationKey,
            undefined,
            {
              jobId: correlation.jobId,
              tenantId: correlation.tenantId,
              approvalRequestId: record.id,
              operationId: correlation.operationKey,
              decision: record.status,
              deliveryId,
              decisionEpoch: event.decisionEpoch,
              payloadDigest,
              result: "operator_review",
            },
          );
          if (failed !== "failed") throw new Error("SPEC224_APPROVAL_RESUME_OUTCOME_AMBIGUOUS");
          result = "operator_review";
        } else {
          result = resolved;
        }
      }
      const receiptInput = {
        jobId: correlation.jobId,
        tenantId: correlation.tenantId,
        approvalRequestId: record.id,
        operationId: correlation.operationKey,
        decision: record.status,
        deliveryId,
        decisionEpoch: event.decisionEpoch,
        payloadDigest,
        result,
      } as const;
      if (!await deps.controlPlane.recordSpec224ApprovalDelivery(receiptInput))
        throw new Error("SPEC224_APPROVAL_DELIVERY_RECEIPT_CONFLICT");
      const receipt = { deliveryId, payloadDigest, result, acknowledgedAt: now().toISOString() };
      await deps.authority.acknowledge({ ...input, deliveryId, payloadDigest, receipt });
      if (!await deps.controlPlane.recordSpec224ApprovalDelivery({ ...receiptInput, acknowledged: true }))
        throw new Error("SPEC224_APPROVAL_ACK_RECEIPT_CONFLICT");
      return result;
    },
  };
}
