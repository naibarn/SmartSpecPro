/** Property order is part of the existing emergency case hash-chain contract. */
export function emergencyIntakeEvent(input: {
  tenantId: string; caseId: string; previousHash: string | null; revision: number; createdAt: string;
}) {
  const payload = { revision: input.revision, intakeStatus: "triage_available", reportStatus: "triage" };
  return {
    tenantId: input.tenantId, caseId: input.caseId, previousHash: input.previousHash, revision: input.revision,
    eventType: "triage_available", reason: "Emergency report is durably queued for human triage",
    actorType: "system", actorRef: "spec260.emergency-report-intake", payload, createdAt: input.createdAt,
  };
}
