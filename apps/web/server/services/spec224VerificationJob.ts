import { createHash } from "node:crypto";

import type { JobDefinition } from "./jobControlPlaneTypes";

export const SPEC224_FULL_VERIFICATION_JOB_TYPE = "spec224.verification.full";
export const SPEC224_FULL_VERIFICATION_CONTRACT = "spec224-verification-v1";

export function buildSpec224FullVerificationJobDefinition(input: {
  tenantId: string;
  actorId: number;
  runId: string;
  expectedRevision: number;
  expectedFencingVersion: number;
  admissionEventKey: string;
}): JobDefinition {
  const runDigest = createHash("sha256").update(input.runId, "utf8").digest("hex").slice(0, 40);
  return {
    contractVersion: SPEC224_FULL_VERIFICATION_CONTRACT,
    tenantId: input.tenantId,
    requestedByUserId: input.actorId,
    jobType: SPEC224_FULL_VERIFICATION_JOB_TYPE,
    executionClass: "long",
    priority: 20,
    input: {
      contractVersion: SPEC224_FULL_VERIFICATION_CONTRACT,
      runId: input.runId,
      requesterId: input.actorId,
      requestedRevision: input.expectedRevision,
      requestedFencingVersion: input.expectedFencingVersion,
      profile: "full",
      admissionEventKey: input.admissionEventKey,
    },
    idempotencyKey: input.admissionEventKey,
    activeDedupeKey: `spec224-verification:${runDigest}`,
    retryPolicy: {
      maxAttempts: 1,
      baseDelayMs: 1_000,
      maxDelayMs: 1_000,
      jitter: "bounded",
      deadlineMs: 3 * 60 * 60_000,
      allowedErrorClasses: [],
    },
    timeoutPolicy: { softTimeoutMs: 60_000, hardTimeoutMs: 3 * 60 * 60_000 },
  };
}
