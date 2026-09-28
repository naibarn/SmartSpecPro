import {
  assertEditorialEvidence,
  type EditorialEvidenceBundle,
} from "@smartspec/shared";

export interface EditorialEvidenceBinding {
  tenantId: string;
  projectId: string;
  revisionId: string;
  snapshotId: string;
  sourceFingerprint: string;
}

export function bindEditorialEvidence(
  value: unknown,
  binding: EditorialEvidenceBinding
): EditorialEvidenceBundle {
  const evidence = assertEditorialEvidence(value);
  if (
    evidence.tenantId !== binding.tenantId ||
    evidence.projectId !== binding.projectId ||
    evidence.revisionId !== binding.revisionId ||
    evidence.snapshotId !== binding.snapshotId ||
    evidence.sourceFingerprint !== binding.sourceFingerprint
  ) {
    throw new Error("EVIDENCE_STALE");
  }
  return evidence;
}

export function assertExecutableEvidence(
  value: unknown,
  minimumConfidence = 0.7
): EditorialEvidenceBundle {
  const evidence = assertEditorialEvidence(value);
  if (
    evidence.status !== "available" ||
    evidence.confidence < minimumConfidence
  )
    throw new Error("EVIDENCE_NOT_EXECUTABLE");
  return evidence;
}
