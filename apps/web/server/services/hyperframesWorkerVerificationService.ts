import { HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC } from "../../shared/hyperframes/limits";
import { isPlainObject, sanitizeWorkerPayload } from "./workerPayloadSanitizer";

type WorkerJobRecord = Record<string, any>;
type WorkerArtifactRecord = Record<string, any>;

export const HYPERFRAMES_WORKER_REQUIRED_ARTIFACT_TYPES = [
  "hyperframes_final_video",
  "hyperframes_render_manifest",
  "hyperframes_runtime_doctor",
  "hyperframes_probe_report",
] as const;

export type HyperframesWorkerVerificationStatus = "passed" | "failed";

export interface HyperframesWorkerVerificationReport {
  status: HyperframesWorkerVerificationStatus;
  checkedAt: string;
  publishableArtifactIds: string[];
  safeMessage: string;
  failureCode: string | null;
  expected: {
    durationSec: number | null;
    aspectRatio: string | null;
    fps: number | null;
    assignmentAttempt: string | null;
  };
  actual: {
    durationSec: number | null;
    aspectRatio: string | null;
    fps: number | null;
    finalVideoChecksumSha256: string | null;
  };
  artifactIds: Record<string, string>;
}

export class HyperframesWorkerVerificationError extends Error {
  code: string;
  report: HyperframesWorkerVerificationReport;

  constructor(code: string, message: string, report: HyperframesWorkerVerificationReport) {
    super(message);
    this.name = "HyperframesWorkerVerificationError";
    this.code = code;
    this.report = report;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeHash(value: unknown): string | null {
  const hash = asString(value)?.toLowerCase() ?? null;
  return hash && /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function normalizeContentType(value: unknown): string | null {
  return asString(value)?.toLowerCase() ?? null;
}

function artifactMetadata(artifact: WorkerArtifactRecord): Record<string, unknown> {
  return asRecord(artifact.metadataJson);
}

function findArtifact(
  artifacts: WorkerArtifactRecord[],
  artifactType: string,
): WorkerArtifactRecord | null {
  return artifacts.find((artifact) => artifact.artifactType === artifactType) ?? null;
}

function getExpectedDurationSec(job: WorkerJobRecord): number | null {
  const inputJson = asRecord(job.inputJson);
  const renderConfig = asRecord(inputJson.renderConfig);
  const outputJson = asRecord(job.outputJson);
  return asNumber(inputJson.finalVideoLengthSec)
    ?? asNumber(renderConfig.finalVideoLengthSec)
    ?? asNumber(outputJson.finalVideoLengthSec);
}

function getExpectedAssignmentAttempt(job: WorkerJobRecord): string | null {
  const outputJson = asRecord(job.outputJson);
  return asString(outputJson.assignmentAttempt)
    ?? asString(outputJson.lastAssignmentAttempt);
}

function getExpectedAspectRatio(job: WorkerJobRecord): string | null {
  const outputRequirements = asRecord(asRecord(job.inputJson).outputRequirements);
  return asString(outputRequirements.aspectRatio)
    ?? asString(outputRequirements.outputAspectRatio)
    ?? asString(asRecord(job.inputJson).aspectRatio)
    ?? "9:16";
}

function getExpectedFps(job: WorkerJobRecord): number | null {
  const outputRequirements = asRecord(asRecord(job.inputJson).outputRequirements);
  return asNumber(outputRequirements.fps)
    ?? asNumber(asRecord(job.inputJson).fps)
    ?? 30;
}

function reportBase(input: {
  job: WorkerJobRecord;
  artifacts: WorkerArtifactRecord[];
  now: Date;
  failureCode?: string | null;
  safeMessage?: string;
  status?: HyperframesWorkerVerificationStatus;
  publishableArtifactIds?: string[];
  finalVideoChecksumSha256?: string | null;
  durationSec?: number | null;
  aspectRatio?: string | null;
  fps?: number | null;
}): HyperframesWorkerVerificationReport {
  return {
    status: input.status ?? "failed",
    checkedAt: input.now.toISOString(),
    publishableArtifactIds: input.publishableArtifactIds ?? [],
    safeMessage: input.safeMessage ?? "HyperFrames worker output verification failed.",
    failureCode: input.failureCode ?? null,
    expected: {
      durationSec: getExpectedDurationSec(input.job),
      aspectRatio: getExpectedAspectRatio(input.job),
      fps: getExpectedFps(input.job),
      assignmentAttempt: getExpectedAssignmentAttempt(input.job),
    },
    actual: {
      durationSec: input.durationSec ?? null,
      aspectRatio: input.aspectRatio ?? null,
      fps: input.fps ?? null,
      finalVideoChecksumSha256: input.finalVideoChecksumSha256 ?? null,
    },
    artifactIds: Object.fromEntries(
      input.artifacts
        .filter((artifact) => typeof artifact.artifactType === "string")
        .map((artifact) => [artifact.artifactType, artifact.id]),
    ),
  };
}

function fail(input: {
  job: WorkerJobRecord;
  artifacts: WorkerArtifactRecord[];
  now: Date;
  code: string;
  message: string;
  finalVideoChecksumSha256?: string | null;
  durationSec?: number | null;
  aspectRatio?: string | null;
  fps?: number | null;
}): never {
  const report = reportBase({
    job: input.job,
    artifacts: input.artifacts,
    now: input.now,
    failureCode: input.code,
    safeMessage: input.message,
    finalVideoChecksumSha256: input.finalVideoChecksumSha256 ?? null,
    durationSec: input.durationSec ?? null,
    aspectRatio: input.aspectRatio ?? null,
    fps: input.fps ?? null,
  });
  throw new HyperframesWorkerVerificationError(input.code, input.message, report);
}

function readManifestFinalChecksum(manifestArtifact: WorkerArtifactRecord): string | null {
  const metadata = artifactMetadata(manifestArtifact);
  const manifestJson = asRecord(metadata.manifestJson);
  const outputs = asRecord(manifestJson.outputs);
  const finalVideo = asRecord(outputs.finalVideo);
  return normalizeHash(metadata.finalVideoChecksumSha256)
    ?? normalizeHash(finalVideo.checksumSha256)
    ?? normalizeHash(finalVideo.sha256);
}

function readProbeDuration(probeArtifact: WorkerArtifactRecord): number | null {
  const metadata = artifactMetadata(probeArtifact);
  const probeJson = asRecord(metadata.probeJson);
  return asNumber(metadata.durationSec)
    ?? asNumber(probeJson.durationSec)
    ?? asNumber(probeJson.duration);
}

function readProbeAspectRatio(probeArtifact: WorkerArtifactRecord): string | null {
  const metadata = artifactMetadata(probeArtifact);
  const probeJson = asRecord(metadata.probeJson);
  return asString(metadata.aspectRatio)
    ?? asString(probeJson.aspectRatio)
    ?? asString(probeJson.displayAspectRatio);
}

function readProbeFps(probeArtifact: WorkerArtifactRecord): number | null {
  const metadata = artifactMetadata(probeArtifact);
  const probeJson = asRecord(metadata.probeJson);
  return asNumber(metadata.fps)
    ?? asNumber(probeJson.fps)
    ?? asNumber(probeJson.avgFrameRate);
}

function hasFallbackEvidence(artifacts: WorkerArtifactRecord[]): boolean {
  return artifacts.some((artifact) => {
    const metadata = artifactMetadata(artifact);
    return metadata.fallbackRender === true
      || metadata.fallbackRenderer === true
      || metadata.ffmpegAssFallback === true
      || asString(metadata.rendererMode) === "ffmpeg_ass_fallback"
      || asString(metadata.runtimeMode) === "fallback";
  });
}

function hasOfficialRuntimeEvidence(doctorArtifact: WorkerArtifactRecord): boolean {
  const metadata = artifactMetadata(doctorArtifact);
  const doctorJson = asRecord(metadata.doctorJson);
  return metadata.officialHyperframesRuntime === true
    || doctorJson.officialHyperframesRuntime === true
    || asString(metadata.runtimeKind) === "official_hyperframes"
    || asString(doctorJson.runtimeKind) === "official_hyperframes";
}

function ensureAssignmentAttemptMatches(
  job: WorkerJobRecord,
  artifacts: WorkerArtifactRecord[],
  now: Date,
) {
  const expectedAssignmentAttempt = getExpectedAssignmentAttempt(job);
  if (!expectedAssignmentAttempt) {
    fail({
      job,
      artifacts,
      now,
      code: "assignment_attempt_missing",
      message: "Worker output cannot be verified because the assignment attempt is missing.",
    });
  }

  for (const artifact of artifacts) {
    const actualAttempt = asString(artifactMetadata(artifact).assignmentAttempt);
    if (actualAttempt !== expectedAssignmentAttempt) {
      fail({
        job,
        artifacts,
        now,
        code: "stale_assignment_attempt",
        message: "Worker output belongs to an old assignment and was rejected.",
      });
    }
  }
}

export function verifyHyperframesWorkerArtifacts(input: {
  job: WorkerJobRecord;
  artifacts: WorkerArtifactRecord[];
  now?: Date;
}): HyperframesWorkerVerificationReport {
  const now = input.now ?? new Date();
  if (input.job.jobType !== "hyperframes_final_composite") {
    return reportBase({
      job: input.job,
      artifacts: input.artifacts,
      now,
      status: "passed",
      safeMessage: "Not a HyperFrames final composite job.",
      publishableArtifactIds: input.artifacts.map((artifact) => artifact.id),
    });
  }

  ensureAssignmentAttemptMatches(input.job, input.artifacts, now);

  const missing = HYPERFRAMES_WORKER_REQUIRED_ARTIFACT_TYPES
    .filter((artifactType) => !findArtifact(input.artifacts, artifactType));
  if (missing.length > 0) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "missing_required_artifact",
      message: `HyperFrames output is missing required artifact: ${missing[0]}`,
    });
  }

  const finalVideo = findArtifact(input.artifacts, "hyperframes_final_video")!;
  const manifest = findArtifact(input.artifacts, "hyperframes_render_manifest")!;
  const doctor = findArtifact(input.artifacts, "hyperframes_runtime_doctor")!;
  const probe = findArtifact(input.artifacts, "hyperframes_probe_report")!;

  const finalMetadata = artifactMetadata(finalVideo);
  const finalChecksum = normalizeHash(finalMetadata.checksumSha256);
  const manifestChecksum = readManifestFinalChecksum(manifest);
  const durationSec = readProbeDuration(probe);
  const aspectRatio = readProbeAspectRatio(probe);
  const fps = readProbeFps(probe);

  if (normalizeContentType(finalMetadata.contentType) !== "video/mp4") {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "final_video_mime_mismatch",
      message: "HyperFrames final video must be an MP4 file.",
      finalVideoChecksumSha256: finalChecksum,
    });
  }

  if (!finalChecksum || !manifestChecksum || finalChecksum !== manifestChecksum) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "final_video_hash_mismatch",
      message: "HyperFrames final video hash does not match the render manifest.",
      finalVideoChecksumSha256: finalChecksum,
    });
  }

  if (!hasOfficialRuntimeEvidence(doctor)) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "official_runtime_missing",
      message: "HyperFrames official runtime evidence is missing.",
      finalVideoChecksumSha256: finalChecksum,
    });
  }

  if (hasFallbackEvidence(input.artifacts)) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "fallback_output_rejected",
      message: "Fallback-rendered output was rejected. Render again with the official HyperFrames runtime.",
      finalVideoChecksumSha256: finalChecksum,
    });
  }

  if (!durationSec || durationSec <= 0 || durationSec > HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC + 1) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "duration_probe_invalid",
      message: "HyperFrames probe report has an invalid duration.",
      finalVideoChecksumSha256: finalChecksum,
      durationSec,
      aspectRatio,
      fps,
    });
  }

  const expectedDurationSec = getExpectedDurationSec(input.job);
  if (expectedDurationSec && Math.abs(durationSec - expectedDurationSec) > Math.max(2, expectedDurationSec * 0.03)) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "duration_mismatch",
      message: "HyperFrames output duration does not match the requested final composite length.",
      finalVideoChecksumSha256: finalChecksum,
      durationSec,
      aspectRatio,
      fps,
    });
  }

  const expectedAspectRatio = getExpectedAspectRatio(input.job);
  if (expectedAspectRatio && aspectRatio && aspectRatio !== expectedAspectRatio) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "aspect_ratio_mismatch",
      message: "HyperFrames output aspect ratio does not match the requested render.",
      finalVideoChecksumSha256: finalChecksum,
      durationSec,
      aspectRatio,
      fps,
    });
  }

  const expectedFps = getExpectedFps(input.job);
  if (expectedFps && fps && Math.abs(fps - expectedFps) > 0.75) {
    fail({
      job: input.job,
      artifacts: input.artifacts,
      now,
      code: "fps_mismatch",
      message: "HyperFrames output frame rate does not match the requested render.",
      finalVideoChecksumSha256: finalChecksum,
      durationSec,
      aspectRatio,
      fps,
    });
  }

  return reportBase({
    job: input.job,
    artifacts: input.artifacts,
    now,
    status: "passed",
    safeMessage: "HyperFrames output passed server verification.",
    publishableArtifactIds: [finalVideo.id],
    finalVideoChecksumSha256: finalChecksum,
    durationSec,
    aspectRatio,
    fps,
  });
}
