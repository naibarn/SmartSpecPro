import { createHash, randomUUID } from "node:crypto";

import {
  contentProtectionJobInputSchema,
  contentProtectionJobResultSchema,
  type ContentProtectionJobInput,
  type ContentProtectionJobResult,
  CONTENT_PROTECTION_PROGRESS_STAGES,
} from "../../../shared/contentProtectionWorker";
import type {
  ContentProtectionProvider,
  ProtectionProviderResult,
} from "./provider";

export type ContentProtectionWorkerDependencies = {
  sourceBytes: Uint8Array;
  provider: ContentProtectionProvider;
  onStage?: (
    stage: (typeof CONTENT_PROTECTION_PROGRESS_STAGES)[number],
    progress: number
  ) => void | Promise<void>;
  publishOutput?: (bytes: Uint8Array, mimeType: string) => void | Promise<void>;
};

function sourceIdentity(input: ContentProtectionJobInput): string {
  return createHash("sha256")
    .update(
      `${input.tenantId}:${input.protectionAssetId}:${input.sourceSha256}`,
      "utf8"
    )
    .digest("hex");
}

function selectProviderOperation(
  provider: ContentProtectionProvider,
  input: ContentProtectionJobInput
): {
  embed: (
    value: Parameters<ContentProtectionProvider["embedImage"]>[0]
  ) => Promise<ProtectionProviderResult>;
  detect: (
    bytes: Uint8Array,
    watermarkId: string
  ) => ReturnType<ContentProtectionProvider["detectImage"]>;
} {
  switch (input.modality) {
    case "image":
      return {
        embed: provider.embedImage.bind(provider),
        detect: provider.detectImage.bind(provider),
      };
    case "video":
      return {
        embed: provider.embedVideo.bind(provider),
        detect: provider.detectVideo.bind(provider),
      };
    case "audio":
      return {
        embed: provider.embedAudio.bind(provider),
        detect: provider.detectAudio.bind(provider),
      };
  }
}

async function stage(
  deps: ContentProtectionWorkerDependencies,
  stageName: (typeof CONTENT_PROTECTION_PROGRESS_STAGES)[number],
  progress: number
): Promise<void> {
  await deps.onStage?.(stageName, progress);
}

export async function runContentProtectionWorker(
  rawInput: ContentProtectionJobInput,
  deps: ContentProtectionWorkerDependencies
): Promise<ContentProtectionJobResult> {
  const input = contentProtectionJobInputSchema.parse(rawInput);
  await stage(deps, "validate_contract", 5);
  const actualSourceSha256 = createHash("sha256")
    .update(deps.sourceBytes)
    .digest("hex");
  if (actualSourceSha256 !== input.sourceSha256)
    throw new Error("SOURCE_HASH_MISMATCH");
  if (!deps.provider.supportedModalities.has(input.modality))
    throw new Error("PROVIDER_MODALITY_UNSUPPORTED");

  await stage(deps, "stage_inputs", 15);
  const { embed, detect } = selectProviderOperation(deps.provider, input);
  const output = await embed({
    assetId: input.protectionAssetId,
    bytes: deps.sourceBytes,
    watermarkId: sourceIdentity(input),
    profileId: input.providerId,
    algorithmVersion: input.providerVersion,
  });
  if (output.channel !== input.modality)
    throw new Error("PROVIDER_CHANNEL_MISMATCH");
  await stage(deps, "create_digital_watermark", 45);

  const detection = await detect(output.bytes, sourceIdentity(input));
  await stage(deps, "self_verify_watermark", 60);
  if (!detection.detected || detection.confidence < 0.5)
    throw new Error("SELF_DETECT_MISMATCH");

  const outputSha256 = createHash("sha256").update(output.bytes).digest("hex");
  await stage(deps, "fingerprint_and_c2pa", 72);
  await stage(deps, "quality_control", 88);
  if (output.bytes.byteLength === 0) throw new Error("EMPTY_PROTECTED_OUTPUT");
  await deps.publishOutput?.(output.bytes, input.mimeType);
  await stage(deps, "publish_artifact", 100);

  return contentProtectionJobResultSchema.parse({
    protectionAssetId: input.protectionAssetId,
    modality: input.modality,
    outputObjectKey: input.outputObjectKey,
    outputSha256,
    providerId: output.provider,
    providerVersion: output.algorithmVersion,
    detected: detection.detected,
    confidence: detection.confidence,
    evidence: {
      ...output.selfVerifyMetrics,
      detectorEvidence: detection.evidence,
      sourceSha256: input.sourceSha256,
      mimeType: input.mimeType,
      requireBeforePublish: input.requireBeforePublish,
    },
  });
}

/** Capability is advertised only after the actual provider worker is enabled. */
export function isContentProtectionCapabilityAdvertised(): boolean {
  const provider =
    process.env.CONTENT_PROTECTION_PROVIDER?.trim().toLowerCase();
  const providerCommand = process.env.CONTENT_PROTECTION_PROVIDER_COMMAND?.trim();
  return (
    process.env.CONTENT_PROTECTION_WORKER_CAPABILITY === "true" &&
    Boolean(providerCommand) &&
    (provider === "videoseal" || provider === "pixelseal")
  );
}

export function contentProtectionCapabilityManifest(): Record<string, unknown> {
  return {
    contentProtection: {
      available: isContentProtectionCapabilityAdvertised(),
      provider:
        process.env.CONTENT_PROTECTION_PROVIDER?.trim().toLowerCase() || null,
      contractVersion: "content-protection.v1",
      modalities: ["image", "video", "audio"],
    },
  };
}

async function readSourceBytes(storageKey: string): Promise<Uint8Array> {
  const { storageStreamFile } = await import("../../storage");
  const stored = await storageStreamFile(storageKey);
  if (!stored) throw new Error("STORAGE_TRANSIENT");
  const stream = stored.stream as any;
  const chunks: Buffer[] = [];
  let total = 0;
  if (typeof stream?.[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream as AsyncIterable<
      Buffer | Uint8Array | string
    >) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > 512 * 1024 * 1024) throw new Error("SOURCE_TOO_LARGE");
      chunks.push(buffer);
    }
  } else if (typeof stream?.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const buffer = Buffer.from(next.value);
        total += buffer.byteLength;
        if (total > 512 * 1024 * 1024) throw new Error("SOURCE_TOO_LARGE");
        chunks.push(buffer);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } else {
    throw new Error("STORAGE_TRANSIENT");
  }
  return Buffer.concat(chunks);
}

export async function executeContentProtectionJob(input: {
  context: { input: unknown };
  lease: any;
  reporter: {
    progress: (
      lease: any,
      update: { progress: number; stage: string; message?: string }
    ) => Promise<void>;
    assertActive: (lease: any) => Promise<void>;
  };
}): Promise<{ resultRef: string; output: Record<string, unknown> }> {
  const jobInput = contentProtectionJobInputSchema.parse(input.context.input);
  if (!isContentProtectionCapabilityAdvertised()) {
    throw new Error("PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE");
  }
  const { getConfiguredProtectionProvider } = await import("./provider");
  const { storagePut } = await import("../../storage");
  const sourceBytes = await readSourceBytes(jobInput.sourceObjectKey);
  const provider = getConfiguredProtectionProvider();
  const result = await runContentProtectionWorker(jobInput, {
    sourceBytes,
    provider,
    onStage: (stageName, progress) =>
      input.reporter.progress(input.lease, { progress, stage: stageName }),
    publishOutput: async (bytes, mimeType) => {
      await storagePut(jobInput.outputObjectKey, bytes, mimeType);
    },
  });
  await input.reporter.assertActive(input.lease);

  const { getDb } = await import("../../db");
  const { workerArtifacts } = await import("../../../drizzle/schema");
  const database = await getDb();
  await database
    .insert(workerArtifacts)
    .values({
      id: randomUUID(),
      workerJobId: input.lease.jobId,
      artifactType: "content_protection_protected",
      storageRef: result.outputObjectKey,
      metadataJson: {
        kind: "content_protection_protected",
        protectionAssetId: result.protectionAssetId,
        sourceAssetId: jobInput.sourceAssetId,
        sourceArtifactId: jobInput.sourceArtifactId,
        sourceSha256: jobInput.sourceSha256,
        outputObjectKey: result.outputObjectKey,
        outputSha256: result.outputSha256,
        checksumSha256: result.outputSha256,
        watermarkId: `wm-${result.protectionAssetId}`,
        providerId: result.providerId,
        providerVersion: result.providerVersion,
        modality: result.modality,
        detected: result.detected,
        confidence: result.confidence,
        evidence: result.evidence,
        compoundEnvelope: jobInput.compoundEnvelope,
        requireBeforePublish: jobInput.requireBeforePublish,
      },
      publishedItemId: null,
    })
    .onConflictDoNothing();
  return { resultRef: result.outputObjectKey, output: result };
}
