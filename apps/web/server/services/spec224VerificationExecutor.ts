import type { JobExecutor } from "./jobExecutor";
import { SPEC224_FULL_VERIFICATION_CONTRACT } from "./spec224VerificationJob";

function parseFullVerificationEnvelope(value: unknown): {
  runId: string;
  requesterId: number;
  requestedRevision: number;
  requestedFencingVersion: number;
  admissionEventKey: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const expectedKeys = [
    "contractVersion", "runId", "requesterId", "requestedRevision",
    "requestedFencingVersion", "profile", "admissionEventKey",
  ];
  if (
    Object.keys(input).length !== expectedKeys.length ||
    Object.keys(input).some(key => !expectedKeys.includes(key)) ||
    input.contractVersion !== SPEC224_FULL_VERIFICATION_CONTRACT ||
    input.profile !== "full" ||
    typeof input.runId !== "string" || !/^run-[a-f0-9]{40}$/.test(input.runId) ||
    !Number.isSafeInteger(input.requesterId) || Number(input.requesterId) < 1 ||
    !Number.isSafeInteger(input.requestedRevision) || Number(input.requestedRevision) < 0 ||
    !Number.isSafeInteger(input.requestedFencingVersion) || Number(input.requestedFencingVersion) < 0 ||
    typeof input.admissionEventKey !== "string" || !/^spec224-full:[a-f0-9]{64}$/.test(input.admissionEventKey)
  ) return null;
  return {
    runId: input.runId,
    requesterId: Number(input.requesterId),
    requestedRevision: Number(input.requestedRevision),
    requestedFencingVersion: Number(input.requestedFencingVersion),
    admissionEventKey: input.admissionEventKey,
  };
}

/** Fail-closed executor. A production workspace runtime has not been bound yet. */
export const executeSpec224FullVerification: JobExecutor = async ({
  context,
  lease,
  reporter,
}) => {
  const envelope = parseFullVerificationEnvelope(context.input);
  if (!envelope) {
    throw Object.assign(new Error("SPEC224_VERIFICATION_ENVELOPE_INVALID"), { class: "permanent" });
  }
  await reporter.assertActive(lease);
  const { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } =
    await import("./spec224DevelopmentRunPersistence");
  const service = createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);
  await service.recordVerificationEvent({
    runId: envelope.runId,
    tenantId: context.tenantId,
    actorId: envelope.requesterId,
    idempotencyKey: `${envelope.admissionEventKey}:outcome`,
    type: "VERIFICATION_OUTCOME",
    payload: {
      profile: "full",
      result: "NOT_CONFIGURED",
      reason: "FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED",
      requestJobId: context.jobId,
      requestedRevision: envelope.requestedRevision,
      requestedFencingVersion: envelope.requestedFencingVersion,
    },
  });
  await reporter.assertActive(lease);
  return {
    output: {
      profile: "full",
      result: "NOT_CONFIGURED",
      reason: "FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED",
    },
  };
};
