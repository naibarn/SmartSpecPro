import { describe, expect, it } from "vitest";
import {
  CONTENT_PROTECTION_JOB_TYPE,
  CONTENT_PROTECTION_PROGRESS_STAGES,
  CONTENT_PROTECTION_VERIFY_PROGRESS_STAGES,
  CONTENT_PROTECTION_VERIFY_JOB_TYPE,
  CONTENT_PROTECTION_VERIFY_CONTRACT_VERSION,
  contentProtectionIntentSchema,
  contentProtectionJobInputSchema,
  contentProtectionJobResultSchema,
  contentProtectionVerificationJobInputSchema,
  isRetryableContentProtectionError,
  redactContentProtectionWorkerPayload,
  validateContentProtectionProgress,
} from "./contentProtectionWorker";

const input = {
  contractVersion: "content-protection.v1",
  jobType: CONTENT_PROTECTION_JOB_TYPE,
  protectionAssetId: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant-a",
  sourceAssetId: 42,
  sourceObjectKey: "tenant-a/source.mp4",
  sourceSha256: "a".repeat(64),
  mimeType: "video/mp4",
  modality: "video" as const,
  effectiveChoice: "on" as const,
  choiceSource: "per_export" as const,
  providerId: "videoseal",
  providerVersion: "1",
  outputObjectKey: "tenant-a/protected.mp4",
  compoundEnvelope: { compoundArtifactId: "compound-1" },
  requireBeforePublish: true,
};

describe("content protection worker intent", () => {
  it("keeps the user-controlled ON/OFF choice bounded and explicit", () => {
    expect(contentProtectionIntentSchema.parse({ choice: "on" })).toEqual({
      choice: "on",
      requireBeforePublish: true,
    });
    expect(
      contentProtectionIntentSchema.parse({
        choice: "off",
        choiceSource: "disabled_by_user",
      })
    ).toEqual({
      choice: "off",
      choiceSource: "disabled_by_user",
      requireBeforePublish: true,
    });
    expect(
      contentProtectionIntentSchema.safeParse({
        choice: "on",
        tenantId: "attacker",
      }).success
    ).toBe(false);
    expect(
      contentProtectionIntentSchema.safeParse({
        choice: "on",
        choiceSource: "disabled_by_user",
      }).success
    ).toBe(false);
  });
});

describe("content protection worker contract", () => {
  it("validates a secret-free protection payload and result", () => {
    expect(contentProtectionJobInputSchema.parse(input)).toEqual(input);
    expect(() =>
      contentProtectionJobInputSchema.parse({ ...input, codeword: "secret" })
    ).toThrow();
    expect(
      contentProtectionJobResultSchema.parse({
        protectionAssetId: input.protectionAssetId,
        modality: "video",
        outputObjectKey: input.outputObjectKey,
        outputSha256: "b".repeat(64),
        providerId: input.providerId,
        providerVersion: input.providerVersion,
        detected: true,
        confidence: 0.97,
        evidence: { detectorVersion: "1" },
      }).detected
    ).toBe(true);
  });

  it("enforces ordered stages and bounded retry classification", () => {
    expect(CONTENT_PROTECTION_PROGRESS_STAGES).toEqual([
      "validate_contract",
      "stage_inputs",
      "create_digital_watermark",
      "self_verify_watermark",
      "fingerprint_and_c2pa",
      "quality_control",
      "publish_artifact",
    ]);
    expect(
      validateContentProtectionProgress(CONTENT_PROTECTION_PROGRESS_STAGES)
    ).toBe(true);
    expect(
      validateContentProtectionProgress(["stage_inputs", "validate_contract"])
    ).toBe(false);
    expect(isRetryableContentProtectionError("STORAGE_TRANSIENT")).toBe(true);
    expect(isRetryableContentProtectionError("STALE_COMPOUND_ENVELOPE")).toBe(
      false
    );
  });

  it("redacts credentials, codewords, and raw media from worker evidence", () => {
    expect(
      redactContentProtectionWorkerPayload({
        providerCredential: "secret",
        codeword: "secret",
        rawBytes: "secret",
        outputSha256: "b".repeat(64),
      })
    ).toEqual({ outputSha256: "b".repeat(64) });
  });
});

describe("content protection verification control-plane contract", () => {
  it("requires a managed query reference and preserves the forensic stage order", () => {
    const parsed = contentProtectionVerificationJobInputSchema.parse({
      contractVersion: CONTENT_PROTECTION_VERIFY_CONTRACT_VERSION,
      jobType: CONTENT_PROTECTION_VERIFY_JOB_TYPE,
      tenantId: "tenant-a",
      runId: "11111111-1111-4111-8111-111111111111",
      requestedByUserId: 42,
      candidateScope: "owner",
      queryObjectKey: "tenant-a/query.mp4",
      querySha256: "a".repeat(64),
      queryPerceptualHash: null,
      modality: "video",
    });
    expect(parsed.queryObjectKey).toBe("tenant-a/query.mp4");
    expect(CONTENT_PROTECTION_VERIFY_PROGRESS_STAGES).toEqual([
      "INGEST",
      "HASH_INPUT",
      "PROBE_MEDIA",
      "VIDEO_FINGERPRINT",
      "AUDIO_FINGERPRINT",
      "CANDIDATE_SEARCH",
      "VIDEO_WATERMARK_DETECT",
      "AUDIO_WATERMARK_DETECT",
      "SEGMENT_ALIGNMENT",
      "C2PA_INSPECT",
      "RESULT_BUILD",
      "COMPLETE",
    ]);
    expect(() => contentProtectionVerificationJobInputSchema.parse({
      ...parsed,
      rawBytes: "forbidden",
    })).toThrow();
  });
});
