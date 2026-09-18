import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq, inArray, or } from "drizzle-orm";

import { findSimilarAssets } from "../mediaAssetService";
import { getDb } from "../../db";
import { storageStreamFile } from "../../storage";
import {
  contentProtectionAssets,
  contentVerificationMatches,
  contentVerificationRuns,
} from "../../../drizzle/schema";
import {
  CONTENT_PROTECTION_VERIFY_PROGRESS_STAGES,
  contentProtectionVerificationJobInputSchema,
} from "../../../shared/contentProtectionWorker";
import type { LeaseContext } from "../jobControlPlaneTypes";

type VerificationExecutorInput = {
  context: { input: unknown };
  lease: LeaseContext;
  reporter: {
    progress: (
      lease: LeaseContext,
      update: { progress: number; stage: string; message?: string },
    ) => Promise<void>;
    assertActive: (lease: LeaseContext) => Promise<void>;
  };
};

const MAX_VERIFICATION_BYTES = 512 * 1024 * 1024;

async function hashManagedObject(storageKey: string): Promise<string> {
  const stored = await storageStreamFile(storageKey);
  if (!stored) throw new Error("VERIFICATION_INPUT_UNAVAILABLE");
  const hash = createHash("sha256");
  let totalBytes = 0;
  const consume = (chunk: Buffer | Uint8Array | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_VERIFICATION_BYTES) {
      throw new Error("VERIFICATION_INPUT_TOO_LARGE");
    }
    hash.update(buffer);
  };
  const stream = stored.stream as any;
  if (typeof stream?.[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) consume(chunk);
  } else if (typeof stream?.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        consume(next.value);
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    throw new Error("VERIFICATION_INPUT_UNAVAILABLE");
  }
  if (totalBytes === 0) throw new Error("VERIFICATION_INPUT_EMPTY");
  return hash.digest("hex");
}

function stageProgress(stage: number): number {
  return Math.round((stage / CONTENT_PROTECTION_VERIFY_PROGRESS_STAGES.length) * 100);
}

async function reportStage(
  input: VerificationExecutorInput,
  stageIndex: number,
  message?: string,
): Promise<void> {
  await input.reporter.assertActive(input.lease);
  const stage = CONTENT_PROTECTION_VERIFY_PROGRESS_STAGES[stageIndex];
  await input.reporter.progress(input.lease, {
    progress: stageProgress(stageIndex + 1),
    stage,
    ...(message ? { message } : {}),
  });
}

async function markFailed(runId: string, tenantId: string, error: unknown): Promise<void> {
  const database = await getDb();
  await database.update(contentVerificationRuns).set({
    status: "FAILED",
    resultSummary: {
      technicalOnly: true,
      errorCode: error instanceof Error ? error.message.slice(0, 120) : "VERIFICATION_FAILED",
      verificationJob: "content_protection.verify",
    },
    completedAt: new Date(),
  }).where(and(eq(contentVerificationRuns.id, runId), eq(contentVerificationRuns.tenantId, tenantId)));
}

export async function executeContentProtectionVerificationJob(
  rawInput: VerificationExecutorInput,
): Promise<{ resultRef: string; output: Record<string, unknown> }> {
  const input = contentProtectionVerificationJobInputSchema.parse(rawInput.context.input);
  const database = await getDb();

  try {
    await reportStage(rawInput, 0, "Loading the managed verification input");
    const [run] = await database.select({
      id: contentVerificationRuns.id,
      status: contentVerificationRuns.status,
    }).from(contentVerificationRuns).where(and(
      eq(contentVerificationRuns.id, input.runId),
      eq(contentVerificationRuns.tenantId, input.tenantId),
    )).limit(1);
    if (!run) throw new Error("VERIFICATION_RUN_NOT_FOUND");
    if (run.status === "COMPLETED") {
      return { resultRef: input.runId, output: { runId: input.runId, status: "COMPLETED", idempotent: true } };
    }

    await database.update(contentVerificationRuns).set({ status: "PROCESSING" })
      .where(and(eq(contentVerificationRuns.id, input.runId), eq(contentVerificationRuns.tenantId, input.tenantId)));

    await reportStage(rawInput, 1, "Hashing the managed query input");
    const actualSha256 = await hashManagedObject(input.queryObjectKey);
    if (actualSha256 !== input.querySha256) throw new Error("QUERY_HASH_MISMATCH");

    await reportStage(rawInput, 2, "Resolving managed media metadata");
    await reportStage(rawInput, 3, input.modality === "video" ? "Video fingerprint detector is provider-gated" : "Video fingerprint not applicable");
    await reportStage(rawInput, 4, input.modality === "audio" ? "Audio fingerprint detector is provider-gated" : "Audio fingerprint not applicable");
    await reportStage(rawInput, 5, "Searching the tenant-owned protected library");

    const candidatePredicates = [
      eq(contentProtectionAssets.tenantId, input.tenantId),
      eq(contentProtectionAssets.modality, input.modality),
      inArray(contentProtectionAssets.status, ["PROTECTED", "PROTECTED_WITH_WARNINGS"]),
      or(
        eq(contentProtectionAssets.sourceSha256, input.querySha256),
        eq(contentProtectionAssets.protectedSha256, input.querySha256),
      ),
    ];
    if (input.candidateScope === "owner") {
      if (!input.requestedByUserId) throw new Error("VERIFICATION_OWNER_SCOPE_INVALID");
      candidatePredicates.push(eq(contentProtectionAssets.ownerUserId, input.requestedByUserId));
    }
    const candidates = await database.select({
      id: contentProtectionAssets.id,
      sourceSha256: contentProtectionAssets.sourceSha256,
      protectedSha256: contentProtectionAssets.protectedSha256,
      sourceAssetId: contentProtectionAssets.sourceAssetId,
      status: contentProtectionAssets.status,
      modality: contentProtectionAssets.modality,
    }).from(contentProtectionAssets).where(and(...candidatePredicates));

    await database.delete(contentVerificationMatches).where(and(
      eq(contentVerificationMatches.runId, input.runId),
      eq(contentVerificationMatches.tenantId, input.tenantId),
    ));

    const matchedIds = new Set<string>();
    for (const candidate of candidates) {
      const matchType = candidate.protectedSha256 === input.querySha256
        ? "exact_protected_sha256"
        : "exact_source_sha256";
      await database.insert(contentVerificationMatches).values({
        id: randomUUID(),
        tenantId: input.tenantId,
        runId: input.runId,
        protectedAssetId: candidate.id,
        matchType,
        confidence: 1,
        evidenceJson: {
          modality: candidate.modality,
          querySha256: input.querySha256,
          matchedSha256: input.querySha256,
          status: candidate.status,
          method: "tenant_library_exact_hash",
        },
      });
      matchedIds.add(candidate.id);
    }

    await reportStage(rawInput, 6, input.modality === "video" ? "Video watermark detector is provider-gated" : "Video watermark detection not applicable");
    await reportStage(rawInput, 7, input.modality === "audio" ? "Audio watermark detector is provider-gated" : "Audio watermark detection not applicable");

    let perceptualMatchCount = 0;
    if (input.modality === "image" && input.queryPerceptualHash) {
      const similarAssets = await findSimilarAssets(input.queryPerceptualHash, input.tenantId, 12);
      const similarAssetIds = new Set(similarAssets.map(asset => asset.id));
      for (const candidate of candidates) {
        if (matchedIds.has(candidate.id) || !candidate.sourceAssetId || !similarAssetIds.has(candidate.sourceAssetId)) continue;
        const similar = similarAssets.find(asset => asset.id === candidate.sourceAssetId);
        if (!similar) continue;
        await database.insert(contentVerificationMatches).values({
          id: randomUUID(),
          tenantId: input.tenantId,
          runId: input.runId,
          protectedAssetId: candidate.id,
          matchType: "perceptual_image_similarity",
          confidence: Math.max(0.5, Math.min(0.99, 1 - similar.distance / 64)),
          evidenceJson: {
            modality: "image",
            querySha256: input.querySha256,
            sourceAssetId: candidate.sourceAssetId,
            hammingDistance: similar.distance,
            threshold: 12,
            method: "tenant_library_image_dhash",
          },
        });
        perceptualMatchCount += 1;
        matchedIds.add(candidate.id);
      }
    }

    await reportStage(rawInput, 8, "Segment alignment is not available without the forensic detector runtime");
    await reportStage(rawInput, 9, "C2PA trust inspection is not available without a configured trust chain");
    const matchCount = matchedIds.size;
    const resultSummary = {
      verificationJob: "content_protection.verify",
      verificationStages: [...CONTENT_PROTECTION_VERIFY_PROGRESS_STAGES],
      technicalOnly: true,
      method: input.modality === "image" && input.queryPerceptualHash
        ? "tenant_library_exact_hash_plus_image_dhash"
        : "tenant_library_exact_hash",
      exactHashMatches: candidates.length,
      perceptualImageMatches: perceptualMatchCount,
      transformedCopyDetection: input.modality === "image" && input.queryPerceptualHash ? "image_dhash" : "not_available",
      videoFingerprint: "not_available",
      audioFingerprint: "not_available",
      watermarkDetection: "not_available",
      c2paInspection: "not_available",
    };

    await reportStage(rawInput, 10, "Building the verification result");
    await database.update(contentVerificationRuns).set({
      status: "COMPLETED",
      matchCount,
      resultSummary,
      completedAt: new Date(),
    }).where(and(eq(contentVerificationRuns.id, input.runId), eq(contentVerificationRuns.tenantId, input.tenantId)));
    await reportStage(rawInput, 11, "Verification completed");
    return { resultRef: input.runId, output: { runId: input.runId, status: "COMPLETED", matchCount } };
  } catch (error) {
    await markFailed(input.runId, input.tenantId, error).catch(() => undefined);
    throw error;
  }
}
