import type { CameraMotionPlan } from "./cameraMotion";

export const COMPOSITION_SCAN_JOB_TYPE = "video.composition_scan" as const;
export const COMPOSITION_SCAN_CONTRACT_VERSION = "feature-191.v1" as const;

export interface CompositionScanJobEnvelope {
  jobId: string;
  contractVersion: typeof COMPOSITION_SCAN_CONTRACT_VERSION;
  tenantId: string;
  sourceFingerprint: string;
  markRevision: number;
  policyFingerprint: string;
  capabilityProfileFingerprint: string;
  analysisMode: "quick" | "full_scan";
  trimRange: { startMs: number; endMs: number };
  aspectProfile: string;
  durationMs: number;
  checkpointCursorMs?: number;
}

export interface CompositionScanCheckpoint {
  jobId: string;
  sourceFingerprint: string;
  markRevision: number;
  policyFingerprint: string;
  capabilityProfileFingerprint: string;
  analysisMode: "quick" | "full_scan";
  trimRange: { startMs: number; endMs: number };
  aspectProfile: string;
  cursorMs: number;
  evidenceRef: string;
  planFingerprint?: string;
  status: "running" | "approved" | "degraded" | "stale";
}

export function compositionScanDedupeKey(input: Pick<CompositionScanJobEnvelope, "jobId" | "sourceFingerprint" | "trimRange" | "aspectProfile" | "markRevision" | "analysisMode" | "policyFingerprint" | "capabilityProfileFingerprint">): string {
  return [
    COMPOSITION_SCAN_JOB_TYPE,
    input.jobId,
    input.sourceFingerprint,
    `${input.trimRange.startMs}-${input.trimRange.endMs}`,
    input.aspectProfile,
    input.markRevision,
    input.analysisMode,
    input.policyFingerprint,
    input.capabilityProfileFingerprint,
  ].join(":");
}

export function canPromoteCompositionScan(
  checkpoint: CompositionScanCheckpoint,
  current: Pick<CompositionScanJobEnvelope, "jobId" | "sourceFingerprint" | "trimRange" | "aspectProfile" | "markRevision" | "analysisMode" | "policyFingerprint" | "capabilityProfileFingerprint">,
  plan: CameraMotionPlan,
): boolean {
  if (checkpoint.status !== "approved" && checkpoint.status !== "degraded") return false;
  if (checkpoint.jobId !== current.jobId || checkpoint.sourceFingerprint !== current.sourceFingerprint) return false;
  if (checkpoint.markRevision !== current.markRevision) return false;
  if (checkpoint.analysisMode !== current.analysisMode) return false;
  if (checkpoint.aspectProfile !== current.aspectProfile) return false;
  if (checkpoint.trimRange.startMs !== current.trimRange.startMs || checkpoint.trimRange.endMs !== current.trimRange.endMs) return false;
  if (checkpoint.policyFingerprint !== current.policyFingerprint) return false;
  if (checkpoint.capabilityProfileFingerprint !== current.capabilityProfileFingerprint) return false;
  return plan.evidence?.evidenceRef === checkpoint.evidenceRef;
}

export function nextCompositionCheckpoint(
  previous: CompositionScanCheckpoint | null,
  envelope: CompositionScanJobEnvelope,
  cursorMs: number,
  evidenceRef: string,
): CompositionScanCheckpoint {
  if (previous && previous.jobId !== envelope.jobId) {
    throw new Error("composition_scan_checkpoint_job_mismatch");
  }
  return {
    jobId: envelope.jobId,
    sourceFingerprint: envelope.sourceFingerprint,
    markRevision: envelope.markRevision,
    policyFingerprint: envelope.policyFingerprint,
    capabilityProfileFingerprint: envelope.capabilityProfileFingerprint,
    analysisMode: envelope.analysisMode,
    trimRange: envelope.trimRange,
    aspectProfile: envelope.aspectProfile,
    cursorMs: Math.max(previous?.cursorMs ?? 0, Math.min(envelope.durationMs, Math.max(0, Math.round(cursorMs)))),
    evidenceRef,
    planFingerprint: previous?.planFingerprint,
    status: "running",
  };
}
