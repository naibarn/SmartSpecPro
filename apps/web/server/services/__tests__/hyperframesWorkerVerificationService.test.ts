import { describe, expect, it } from "vitest";

import {
  HyperframesWorkerVerificationError,
  verifyHyperframesWorkerArtifacts,
} from "../hyperframesWorkerVerificationService";

const now = new Date("2026-06-22T12:00:00.000Z");
const checksum = "a".repeat(64);

function job(overrides: Record<string, any> = {}) {
  return {
    id: "job-hf-1",
    tenantId: "tenant-1",
    requestedByUserId: 7,
    workerId: "worker-1",
    runtimeType: "desktop_zeroclaw_managed",
    jobType: "hyperframes_final_composite",
    inputJson: {
      finalVideoLengthSec: 30,
      outputRequirements: {
        aspectRatio: "9:16",
        fps: 30,
      },
    },
    outputJson: {
      assignmentAttempt: "attempt_1",
    },
    ...overrides,
  };
}

function artifacts(overrides: Record<string, any> = {}) {
  const base = [
    {
      id: "artifact-final",
      artifactType: "hyperframes_final_video",
      metadataJson: {
        assignmentAttempt: "attempt_1",
        checksumSha256: checksum,
        contentType: "video/mp4",
        sizeBytes: 1024,
      },
    },
    {
      id: "artifact-manifest",
      artifactType: "hyperframes_render_manifest",
      metadataJson: {
        assignmentAttempt: "attempt_1",
        checksumSha256: "b".repeat(64),
        contentType: "application/json",
        sizeBytes: 256,
        finalVideoChecksumSha256: checksum,
      },
    },
    {
      id: "artifact-doctor",
      artifactType: "hyperframes_runtime_doctor",
      metadataJson: {
        assignmentAttempt: "attempt_1",
        checksumSha256: "c".repeat(64),
        contentType: "application/json",
        sizeBytes: 256,
        officialHyperframesRuntime: true,
      },
    },
    {
      id: "artifact-probe",
      artifactType: "hyperframes_probe_report",
      metadataJson: {
        assignmentAttempt: "attempt_1",
        checksumSha256: "d".repeat(64),
        contentType: "application/json",
        sizeBytes: 256,
        durationSec: 30.2,
        aspectRatio: "9:16",
        fps: 30,
      },
    },
  ];
  return base.map((artifact) => ({
    ...artifact,
    ...(overrides[artifact.artifactType] ?? {}),
    metadataJson: {
      ...artifact.metadataJson,
      ...(overrides[artifact.artifactType]?.metadataJson ?? {}),
    },
  }));
}

describe("hyperframesWorkerVerificationService", () => {
  it("passes complete official HyperFrames artifacts and returns only the final video as publishable", () => {
    const report = verifyHyperframesWorkerArtifacts({
      job: job(),
      artifacts: artifacts(),
      now,
    });

    expect(report).toEqual(expect.objectContaining({
      status: "passed",
      publishableArtifactIds: ["artifact-final"],
      failureCode: null,
      safeMessage: "HyperFrames output passed server verification.",
    }));
    expect(report.actual).toEqual(expect.objectContaining({
      durationSec: 30.2,
      aspectRatio: "9:16",
      fps: 30,
      finalVideoChecksumSha256: checksum,
    }));
  });

  it("rejects missing required artifacts", () => {
    expect(() => verifyHyperframesWorkerArtifacts({
      job: job(),
      artifacts: artifacts().filter((artifact) => artifact.artifactType !== "hyperframes_runtime_doctor"),
      now,
    })).toThrowError(HyperframesWorkerVerificationError);
  });

  it("rejects stale assignment attempts", () => {
    expect(() => verifyHyperframesWorkerArtifacts({
      job: job(),
      artifacts: artifacts({
        hyperframes_final_video: {
          metadataJson: { assignmentAttempt: "attempt_old" },
        },
      }),
      now,
    })).toThrowError(expect.objectContaining({
      code: "stale_assignment_attempt",
    }));
  });

  it("rejects manifest hash mismatch and fallback output", () => {
    expect(() => verifyHyperframesWorkerArtifacts({
      job: job(),
      artifacts: artifacts({
        hyperframes_render_manifest: {
          metadataJson: { finalVideoChecksumSha256: "e".repeat(64) },
        },
      }),
      now,
    })).toThrowError(expect.objectContaining({
      code: "final_video_hash_mismatch",
    }));

    expect(() => verifyHyperframesWorkerArtifacts({
      job: job(),
      artifacts: artifacts({
        hyperframes_runtime_doctor: {
          metadataJson: { ffmpegAssFallback: true },
        },
      }),
      now,
    })).toThrowError(expect.objectContaining({
      code: "fallback_output_rejected",
    }));
  });

  it("rejects duration mismatch against the requested final composite length", () => {
    expect(() => verifyHyperframesWorkerArtifacts({
      job: job(),
      artifacts: artifacts({
        hyperframes_probe_report: {
          metadataJson: { durationSec: 50 },
        },
      }),
      now,
    })).toThrowError(expect.objectContaining({
      code: "duration_mismatch",
    }));
  });
});
