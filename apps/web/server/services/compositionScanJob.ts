import { createHash } from "node:crypto";
import { createFeature186VerticalDramaJob } from "./feature186VerticalDramaJobAdapter";

export const COMPOSITION_SCAN_JOB_TYPE = "video.composition_scan" as const;

export type CompositionScanJobInput = {
  jobId: string;
  tenantId: string;
  userId?: number;
  projectRevisionId?: string;
  sourceFingerprint: string;
  markRevision: number;
  policyFingerprint: string;
  capabilityProfileFingerprint: string;
  analysisMode: "quick" | "full_scan";
  trimRange: { startMs: number; endMs: number };
  aspectProfile: string;
  durationMs: number;
  evidenceRef?: string;
  compositionContractVersion?: "feature-191.v1";
};

export function validateCompositionScanInput(input: CompositionScanJobInput): void {
  if (!input.jobId || input.jobId.length > 256 || !input.tenantId || input.tenantId.length > 256
    || (input.projectRevisionId !== undefined && (!input.projectRevisionId || input.projectRevisionId.length > 160))
    || !input.sourceFingerprint || input.sourceFingerprint.length > 256
    || !input.policyFingerprint || input.policyFingerprint.length > 256
    || !input.capabilityProfileFingerprint || input.capabilityProfileFingerprint.length > 256) {
    throw new Error("COMPOSITION_SCAN_INPUT_INVALID");
  }
  if (!Number.isSafeInteger(input.markRevision) || input.markRevision < 0) throw new Error("COMPOSITION_SCAN_MARK_REVISION_INVALID");
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs <= 0 || input.durationMs > 86_400_000) throw new Error("COMPOSITION_SCAN_DURATION_INVALID");
  if (input.analysisMode !== "quick" && input.analysisMode !== "full_scan") throw new Error("COMPOSITION_SCAN_MODE_INVALID");
  if (!input.aspectProfile || !input.aspectProfile.trim() || input.aspectProfile.length > 80) throw new Error("COMPOSITION_SCAN_ASPECT_PROFILE_INVALID");
  if (!Number.isSafeInteger(input.trimRange?.startMs) || !Number.isSafeInteger(input.trimRange?.endMs)
    || input.trimRange.startMs < 0 || input.trimRange.endMs <= input.trimRange.startMs
    || input.trimRange.endMs > input.durationMs) {
    throw new Error("COMPOSITION_SCAN_TRIM_RANGE_INVALID");
  }
  if (input.evidenceRef && input.evidenceRef.length > 256) throw new Error("COMPOSITION_SCAN_EVIDENCE_REF_INVALID");
  if (input.compositionContractVersion && input.compositionContractVersion !== "feature-191.v1") throw new Error("COMPOSITION_SCAN_CONTRACT_VERSION_INVALID");
}

/** Creates the canonical Feature 186 row; transport selection remains server-owned. */
export async function enqueueCompositionScanJob(input: CompositionScanJobInput): Promise<string> {
  validateCompositionScanInput(input);
  const idempotencyTuple = JSON.stringify({
    jobId: input.jobId,
    projectRevisionId: input.projectRevisionId ?? null,
    sourceFingerprint: input.sourceFingerprint,
    trimRange: input.trimRange,
    aspectProfile: input.aspectProfile,
    markRevision: input.markRevision,
    analysisMode: input.analysisMode,
    policyFingerprint: input.policyFingerprint,
    capabilityProfileFingerprint: input.capabilityProfileFingerprint,
  });
  const tupleDigest = createHash("sha256").update(idempotencyTuple, "utf8").digest("hex").slice(0, 48);
  await createFeature186VerticalDramaJob({
    jobId: input.jobId,
    tenantId: input.tenantId,
    userId: input.userId,
    jobType: COMPOSITION_SCAN_JOB_TYPE,
    executionClass: "long",
    idempotencyKey: `feature-191:composition-scan:${tupleDigest}`,
    payload: {
      contractVersion: "feature-186-v1",
      compositionContractVersion: "feature-191.v1",
      sourceFingerprint: input.sourceFingerprint,
      projectRevisionId: input.projectRevisionId ?? null,
      markRevision: input.markRevision,
      policyFingerprint: input.policyFingerprint,
      capabilityProfileFingerprint: input.capabilityProfileFingerprint,
      analysisMode: input.analysisMode,
      trimRange: input.trimRange,
      aspectProfile: input.aspectProfile,
      durationMs: input.durationMs,
      evidenceRef: input.evidenceRef ?? null,
    },
  });
  return input.jobId;
}
