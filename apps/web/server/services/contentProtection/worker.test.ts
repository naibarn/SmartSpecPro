import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createDeterministicTestProvider } from "./provider";
import { runContentProtectionWorker } from "./worker";

const sourceBytes = new TextEncoder().encode("worker-source");
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

describe("content protection worker operation", () => {
  it("runs the ordered stages and verifies final output bytes", async () => {
    const stages: string[] = [];
    const result = await runContentProtectionWorker({
      contractVersion: "content-protection.v1",
      jobType: "content_protection.protect",
      protectionAssetId: "11111111-1111-4111-8111-111111111111",
      tenantId: "tenant-a",
      sourceAssetId: 42,
      sourceObjectKey: "tenant-a/source.mp4",
      sourceSha256,
      modality: "video",
      effectiveChoice: "on",
      choiceSource: "per_export",
      providerId: "deterministic-test",
      providerVersion: "1",
      outputObjectKey: "tenant-a/protected.mp4",
      mimeType: "video/mp4",
      requireBeforePublish: true,
    }, {
      sourceBytes,
      provider: createDeterministicTestProvider({ outputBytes: new TextEncoder().encode("protected-video") }),
      onStage: stage => { stages.push(stage); },
    });
    expect(stages).toEqual([
      "validate_contract",
      "stage_inputs",
      "create_digital_watermark",
      "self_verify_watermark",
      "fingerprint_and_c2pa",
      "quality_control",
      "publish_artifact",
    ]);
    expect(result.detected).toBe(true);
    expect(result.outputSha256).toBe(createHash("sha256").update("protected-video").digest("hex"));
  });

  it("fails closed on stale source bytes and unavailable capability", async () => {
    await expect(runContentProtectionWorker({
      contractVersion: "content-protection.v1", jobType: "content_protection.protect",
      protectionAssetId: "11111111-1111-4111-8111-111111111111", tenantId: "tenant-a",
      sourceAssetId: 42,
      sourceObjectKey: "tenant-a/source.mp4", sourceSha256: "a".repeat(64), modality: "video",
      effectiveChoice: "on", choiceSource: "per_export", providerId: "deterministic-test", providerVersion: "1",
      outputObjectKey: "tenant-a/protected.mp4", mimeType: "video/mp4", requireBeforePublish: true,
    }, { sourceBytes, provider: createDeterministicTestProvider() })).rejects.toThrow("SOURCE_HASH_MISMATCH");
  });
});
