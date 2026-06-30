import { createHash } from "node:crypto";

import {
  type StoryboardPreviewMatchCaptureFailureCode,
  type StoryboardPreviewMatchCaptureQuality,
} from "../../shared/storyboardPreviewMatchCapture";

export type PreviewMatchCaptureArtifact = {
  id?: string | null;
  url?: string | null;
  storageKey?: string | null;
  contentHash?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  hasAudio?: boolean | null;
};

export type PreviewMatchCaptureEvidence = Record<string, unknown>;

export type PreviewMatchCaptureVerificationResult = {
  ok: boolean;
  failureCode: StoryboardPreviewMatchCaptureFailureCode | null;
  safeDiagnostics: string[];
  quality: ReturnType<typeof resolvePreviewMatchCaptureQualityPolicy>;
  publishableArtifactIds: string[];
  evidenceRef: string;
  evidence: PreviewMatchCaptureEvidence;
};

export function resolvePreviewMatchCaptureQualityPolicy(
  quality: StoryboardPreviewMatchCaptureQuality,
) {
  return quality === "high"
    ? {
        quality,
        crf: 18,
        minWidth: 720,
        minHeight: 720,
        maxFpsDrift: 1,
        requireAudioTrack: false,
      }
    : {
        quality,
        crf: 23,
        minWidth: 540,
        minHeight: 540,
        maxFpsDrift: 2,
        requireAudioTrack: false,
      };
}

function hashEvidenceRef(value: unknown): string {
  return `spmc_ev_${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 32)}`;
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|signature|authorization|cookie|signed|storageKey|localPath|html/i.test(key);
}

function isSensitiveString(value: string): boolean {
  return /X-Amz-|Signature=|Bearer\s+|Cookie:|localhost|127\.0\.0\.1|file:\/\//i.test(value);
}

export function redactPreviewMatchCaptureEvidence(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactPreviewMatchCaptureEvidence(item));
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && isSensitiveString(value)) return "[redacted]";
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : redactPreviewMatchCaptureEvidence(child),
    ]),
  );
}

export function verifyPreviewMatchCaptureArtifacts(input: {
  captureJobId: string;
  quality: StoryboardPreviewMatchCaptureQuality;
  expected: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    previewCompositionHash: string;
    timelineHash: string;
    requireAudioTrack?: boolean;
  };
  artifact: PreviewMatchCaptureArtifact | null | undefined;
  evidence?: PreviewMatchCaptureEvidence | null;
}): PreviewMatchCaptureVerificationResult {
  const policy = resolvePreviewMatchCaptureQualityPolicy(input.quality);
  const safeDiagnostics: string[] = [];
  const artifact = input.artifact ?? null;
  const publishableArtifactIds: string[] = [];

  if (!artifact) {
    safeDiagnostics.push("No encoded MP4 artifact was provided by the capture worker.");
    return {
      ok: false,
      failureCode: "verification_failed",
      safeDiagnostics,
      quality: policy,
      publishableArtifactIds,
      evidenceRef: hashEvidenceRef({ captureJobId: input.captureJobId, reason: "missing_artifact" }),
      evidence: redactPreviewMatchCaptureEvidence(input.evidence ?? {}) as PreviewMatchCaptureEvidence,
    };
  }

  if (artifact.mimeType && artifact.mimeType !== "video/mp4") {
    safeDiagnostics.push("Encoded artifact is not video/mp4.");
  }
  if (!artifact.contentHash) {
    safeDiagnostics.push("Encoded artifact is missing a content hash.");
  }
  if (Number(artifact.width ?? 0) < Math.min(input.expected.width, policy.minWidth)) {
    safeDiagnostics.push("Encoded artifact width is below the requested output policy.");
  }
  if (Number(artifact.height ?? 0) < Math.min(input.expected.height, policy.minHeight)) {
    safeDiagnostics.push("Encoded artifact height is below the requested output policy.");
  }
  if (Math.abs(Number(artifact.fps ?? 0) - input.expected.fps) > policy.maxFpsDrift) {
    safeDiagnostics.push("Encoded artifact FPS does not match the preview timeline policy.");
  }
  if (Math.abs(Number(artifact.durationSeconds ?? 0) - input.expected.durationSeconds) > 0.75) {
    safeDiagnostics.push("Encoded artifact duration does not match the preview timeline policy.");
  }
  if (input.expected.requireAudioTrack && artifact.hasAudio !== true) {
    safeDiagnostics.push("Encoded artifact is missing the required audio stream.");
  }

  if (safeDiagnostics.length === 0 && artifact.id) {
    publishableArtifactIds.push(String(artifact.id));
  }

  const sanitizedEvidence = redactPreviewMatchCaptureEvidence({
    ...(input.evidence ?? {}),
    captureJobId: input.captureJobId,
    expected: input.expected,
    artifact: {
      id: artifact.id ?? null,
      contentHash: artifact.contentHash ?? null,
      mimeType: artifact.mimeType ?? null,
      sizeBytes: artifact.sizeBytes ?? null,
      durationSeconds: artifact.durationSeconds ?? null,
      width: artifact.width ?? null,
      height: artifact.height ?? null,
      fps: artifact.fps ?? null,
      hasAudio: artifact.hasAudio ?? null,
    },
    policy: {
      ...policy,
      requireAudioTrack: Boolean(input.expected.requireAudioTrack),
    },
  }) as PreviewMatchCaptureEvidence;

  return {
    ok: safeDiagnostics.length === 0,
    failureCode: safeDiagnostics.length === 0 ? null : "verification_failed",
    safeDiagnostics,
    quality: policy,
    publishableArtifactIds,
    evidenceRef: hashEvidenceRef(sanitizedEvidence),
    evidence: sanitizedEvidence,
  };
}
