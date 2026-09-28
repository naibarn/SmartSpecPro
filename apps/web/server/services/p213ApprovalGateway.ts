import { getCachedPreferredInternalToken, getCachedPythonBackendUrl } from "./appRuntimeConfig";
import { assertP213CertificationDescriptor, type P213CertificationDescriptor } from "./p213CertificationApproval";

export type P213ApprovalRequestInput = {
  jobId: string;
  tenantId: string;
  requesterId: number;
  approvalDescriptor: P213CertificationDescriptor;
  operationKey: string;
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  fencingVersion: number;
  actionId: string;
  actionDescription: string;
  actionDigest: string;
  domFingerprint: string;
  screenshotHash?: string;
  correlationKey: string;
};

export type P213ApprovalRequestResult = {
  approvalRequestId: string;
  status: "pending" | "approved" | "rejected";
  correlationKey: string;
};

function configuredApprovers(requesterId: number): number[] {
  const value = Number.parseInt(process.env.P213_CERTIFICATION_APPROVER_USER_ID ?? "", 10);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("P213_CERTIFICATION_APPROVER_NOT_CONFIGURED");
  if (value === requesterId) throw new Error("P213_CERTIFICATION_APPROVER_MUST_BE_DISTINCT");
  return [value];
}

function requireRemoteApprovalServiceUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("P213_APPROVAL_GATEWAY_DOMAIN_REQUIRED");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase())) {
    throw new Error("P213_APPROVAL_GATEWAY_DOMAIN_REQUIRED");
  }
  return parsed.toString().replace(/\/+$/, "");
}

/** Node-to-Python bridge to the existing durable ApprovalDBService. */
export async function createP213ApprovalRequest(input: P213ApprovalRequestInput): Promise<P213ApprovalRequestResult> {
  assertP213CertificationDescriptor(input.approvalDescriptor, {
    tenantId: input.tenantId,
    requesterId: input.requesterId,
  });
  const baseUrl = requireRemoteApprovalServiceUrl(getCachedPythonBackendUrl());
  const token = getCachedPreferredInternalToken();
  if (!baseUrl || !token) throw new Error("P213_APPROVAL_GATEWAY_NOT_CONFIGURED");
  const response = await fetch(`${baseUrl}/api/v1/approvals/internal/p213/requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": token,
    },
    body: JSON.stringify({
      tenantId: input.tenantId,
      requesterId: input.requesterId,
      projectRef: input.approvalDescriptor.projectRef,
      purpose: input.approvalDescriptor.purpose,
      fixture: input.approvalDescriptor.fixture,
      riskClass: input.approvalDescriptor.riskClass,
      issuedBy: input.approvalDescriptor.issuedBy,
      jobId: input.jobId,
      operationKey: input.operationKey,
      runnerId: input.runnerId,
      runnerSessionId: input.runnerSessionId,
      capabilitySnapshotId: input.capabilitySnapshotId,
      capabilitySnapshotRevision: input.capabilitySnapshotRevision,
      fencingVersion: input.fencingVersion,
      actionId: input.actionId,
      actionDescription: input.actionDescription,
      actionDigest: input.actionDigest,
      domFingerprint: input.domFingerprint,
      ...(input.screenshotHash ? { screenshotHash: input.screenshotHash } : {}),
      correlationKey: input.correlationKey,
      approvers: configuredApprovers(input.requesterId),
    }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : "P213_APPROVAL_CREATE_FAILED";
    throw new Error(detail);
  }
  if (typeof body.approvalRequestId !== "string" || typeof body.status !== "string" || typeof body.correlationKey !== "string") {
    throw new Error("P213_APPROVAL_RESPONSE_INVALID");
  }
  if (body.status !== "pending" && body.status !== "approved" && body.status !== "rejected") {
    throw new Error("P213_APPROVAL_RESPONSE_STATUS_INVALID");
  }
  return {
    approvalRequestId: body.approvalRequestId,
    status: body.status,
    correlationKey: body.correlationKey,
  };
}
