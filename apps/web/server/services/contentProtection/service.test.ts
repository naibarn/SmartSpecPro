import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  CompoundArtifactEnvelope,
  ContentProtectionModality,
  WatermarkChoice,
} from "@smartspec/shared";
import {
  createDeterministicTestProvider,
  getConfiguredProtectionProvider,
  ProtectionProviderUnavailableError,
} from "./provider";
import {
  createProtectionRequest,
  processProtectionAsset,
  redactProtectionDetails,
  type ProtectionAssetRecord,
  type ProtectionRepository,
} from "./service";

const SOURCE = new TextEncoder().encode("source-bytes");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function repository(): ProtectionRepository & {
  records: Map<string, ProtectionAssetRecord>;
} {
  const records = new Map<string, ProtectionAssetRecord>();
  return {
    records,
    findByIdempotency: vi.fn(async (_tenantId, key) =>
      [...records.values()].find(record => record.idempotencyKey === key) ?? null
    ),
    insertQueued: vi.fn(async record => {
      records.set(record.id, record);
      return record;
    }),
    markProtected: vi.fn(async (id, patch) => {
      const record = records.get(id);
      if (!record) throw new Error("NOT_FOUND");
      const updated = { ...record, ...patch, status: "PROTECTED" as const };
      records.set(id, updated);
      return updated;
    }),
    markFailed: vi.fn(async (id, patch) => {
      const record = records.get(id);
      if (!record) throw new Error("NOT_FOUND");
      const updated = { ...record, ...patch, status: patch.status ?? "FAILED" };
      records.set(id, updated);
      return updated;
    }),
  };
}

async function makeRequest(
  repo: ProtectionRepository,
  overrides: Partial<{
    modality: ContentProtectionModality;
    perExportChoice: WatermarkChoice;
    userDefaultChoice: WatermarkChoice;
    idempotencyKey: string;
    sourceBytes: Uint8Array;
    compoundEnvelope: CompoundArtifactEnvelope;
  }> = {}
) {
  return createProtectionRequest({
    tenantId: "tenant-a",
    ownerUserId: 7,
    modality: overrides.modality ?? "image",
    sourceBytes: overrides.sourceBytes ?? SOURCE,
    sourceObjectKey: "tenant-a/source.bin",
    profileId: "content-protection-default",
    profileVersion: "1",
    perExportChoice: overrides.perExportChoice,
    userDefaultChoice: overrides.userDefaultChoice ?? "on",
    idempotencyKey: overrides.idempotencyKey ?? "asset-201-test-1",
    compoundEnvelope: overrides.compoundEnvelope,
    repository: repo,
  });
}

describe("content protection service", () => {
  it("resolves the user choice and reaches PROTECTED only after self-detect", async () => {
    const repo = repository();
    const request = await makeRequest(repo);
    expect(request.choiceSource).toBe("user_default");
    expect(request.status).toBe("QUEUED");

    const result = await processProtectionAsset({
      record: request,
      sourceBytes: SOURCE,
      provider: createDeterministicTestProvider({ outputBytes: new TextEncoder().encode("image-out") }),
      repository: repo,
    });
    expect(result.status).toBe("PROTECTED");
    expect(result.protectedSha256).toBe(sha256(new TextEncoder().encode("image-out")));
    expect(result.channel).toBe("image");
  });

  it("maps explicit OFF to an inspectable unprotected state", async () => {
    const repo = repository();
    const result = await makeRequest(repo, { perExportChoice: "off" });
    expect(result.status).toBe("UNPROTECTED_BY_USER_CHOICE");
    expect(result.choice).toBe("off");
    expect(repo.insertQueued).not.toHaveBeenCalled();
  });

  it("rejects provider mismatch and self-detect mismatch without publishing", async () => {
    const repo = repository();
    const request = await makeRequest(repo, { modality: "video" });
    const result = await processProtectionAsset({
      record: request,
      sourceBytes: SOURCE,
      provider: createDeterministicTestProvider({ detect: false }),
      repository: repo,
    });
    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.errorCode).toBe("SELF_DETECT_MISMATCH");

    const imageOnly = createDeterministicTestProvider({ supportedModalities: ["image"] });
    const videoRequest = await makeRequest(repo, { modality: "video", idempotencyKey: "asset-201-test-2" });
    const unavailable = await processProtectionAsset({
      record: videoRequest,
      sourceBytes: SOURCE,
      provider: imageOnly,
      repository: repo,
    });
    expect(unavailable.status).toBe("FAILED");
    expect(unavailable.errorCode).toBe("PROVIDER_MODALITY_UNSUPPORTED");
  });

  it("rejects stale compound input, output hash mismatch, and duplicate idempotency", async () => {
    const repo = repository();
    await expect(makeRequest(repo, {
      idempotencyKey: "asset-201-test-3",
      sourceBytes: new TextEncoder().encode("different"),
      compoundEnvelope: {
        compoundArtifactId: "compound-1",
        sourceAssetIds: ["source-1"],
        sourceAssetHashes: [sha256(SOURCE)],
        sourceSegments: [{ sourceAssetId: "source-1", timelineIndex: 0, trimStartMs: 0, trimEndMs: 1000 }],
        compoundPlanDigest: "plan-1",
        preProtectionSha256: sha256(SOURCE),
      },
    })).rejects.toThrow("STALE_COMPOUND_ENVELOPE");
    const first = await makeRequest(repo, { idempotencyKey: "asset-201-test-4" });
    const second = await makeRequest(repo, { idempotencyKey: "asset-201-test-4" });
    expect(second.id).toBe(first.id);

    const mismatch = await processProtectionAsset({
      record: first,
      sourceBytes: SOURCE,
      provider: createDeterministicTestProvider({ outputBytes: new TextEncoder().encode("bad") }),
      repository: repo,
      expectedOutputSha256: sha256(new TextEncoder().encode("expected")),
    });
    expect(mismatch.status).toBe("FAILED");
    expect(mismatch.errorCode).toBe("OUTPUT_HASH_MISMATCH");
  });

  it("fails closed when production provider is not configured and redacts sensitive fields", () => {
    const previous = process.env.CONTENT_PROTECTION_PROVIDER;
    delete process.env.CONTENT_PROTECTION_PROVIDER;
    expect(() => getConfiguredProtectionProvider()).toThrow(ProtectionProviderUnavailableError);
    if (previous === undefined) delete process.env.CONTENT_PROTECTION_PROVIDER;
    else process.env.CONTENT_PROTECTION_PROVIDER = previous;

    const safe = redactProtectionDetails({ codeword: "secret", privateKey: "secret", token: "secret", confidence: 0.8 });
    expect(safe).toEqual({ confidence: 0.8 });
  });

  it("keeps image and video provider channels separate", async () => {
    const repo = repository();
    const image = await makeRequest(repo, { idempotencyKey: "asset-201-test-5", modality: "image" });
    const video = await makeRequest(repo, { idempotencyKey: "asset-201-test-6", modality: "video" });
    const provider = createDeterministicTestProvider();
    const [imageResult, videoResult] = await Promise.all([
      processProtectionAsset({ record: image, sourceBytes: SOURCE, provider, repository: repo }),
      processProtectionAsset({ record: video, sourceBytes: SOURCE, provider, repository: repo }),
    ]);
    expect(imageResult.channel).toBe("image");
    expect(videoResult.channel).toBe("video");
  });
});
