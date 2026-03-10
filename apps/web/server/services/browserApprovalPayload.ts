import crypto from "crypto";

import {
  BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD,
  type BrowserApprovalPayload,
  browserApprovalPayloadSchema,
  validateBrowserApprovalTtlSeconds,
} from "../../shared/browserPolicy";

export interface BrowserApprovalPayloadInput {
  actionDescription: string;
  executionId: string;
  targetOrigin: string;
  reasonCodes: string[];
  normalizedAction: Record<string, unknown>;
  payloadPreview: Record<string, unknown>;
  domFingerprint: string;
  screenshotHash?: string;
  approvalTtlSeconds?: number | null;
}

export interface BrowserApprovalValidationInput {
  stored: Pick<BrowserApprovalPayload, "actionDigest" | "domFingerprint" | "targetOrigin">;
  observed: Pick<BrowserApprovalPayload, "actionDigest" | "domFingerprint" | "targetOrigin">;
  domDrift: number;
  revoked?: boolean;
}

export interface BrowserApprovalValidationResult {
  valid: boolean;
  reasonCode?: string;
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildBrowserApprovalPayload(
  input: BrowserApprovalPayloadInput,
): BrowserApprovalPayload {
  return browserApprovalPayloadSchema.parse({
    actionDescription: input.actionDescription,
    actionDigest: stableHash(input.normalizedAction),
    payloadPreviewHash: stableHash(input.payloadPreview),
    domFingerprint: input.domFingerprint,
    screenshotHash: input.screenshotHash,
    targetOrigin: input.targetOrigin,
    executionId: input.executionId,
    reasonCodes: input.reasonCodes,
    approvalTtlSeconds: validateBrowserApprovalTtlSeconds(input.approvalTtlSeconds),
  });
}

export function getBrowserApprovalCorrelationKey(payload: Pick<
  BrowserApprovalPayload,
  "executionId" | "actionDigest" | "targetOrigin"
>): string {
  return `${payload.executionId}:${payload.targetOrigin}:${payload.actionDigest}`;
}

export function validateBrowserApprovalContext(
  input: BrowserApprovalValidationInput,
): BrowserApprovalValidationResult {
  if (input.revoked) {
    return { valid: false, reasonCode: "approval_revoked" };
  }

  if (input.stored.targetOrigin !== input.observed.targetOrigin) {
    return { valid: false, reasonCode: "approval_context_changed" };
  }

  if (input.stored.actionDigest !== input.observed.actionDigest) {
    return { valid: false, reasonCode: "approval_context_changed" };
  }

  if (input.stored.domFingerprint !== input.observed.domFingerprint && input.domDrift > BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD) {
    return { valid: false, reasonCode: "approval_context_changed" };
  }

  return { valid: true };
}
