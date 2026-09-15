import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { dataPromotionBatches, dataPromotionDispositions, dataPromotions } from "../../drizzle/schema";

export type PromotionValidationResult = {
  promotionId: string;
  status: "passed" | "blocked" | "unknown";
  batchCount: number;
  completedBatchCount: number;
  dispositionCount: number;
  safeReason: string;
  manifestDigest: string;
};

export function deterministicPromotionDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export async function validatePromotion(input: { promotionId: string; requireTargetEvidence?: boolean }): Promise<PromotionValidationResult> {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  const [promotion] = await database.select().from(dataPromotions).where(eq(dataPromotions.id, input.promotionId)).limit(1);
  if (!promotion) throw new Error("PROMOTION_NOT_FOUND");
  const batches = await database.select().from(dataPromotionBatches).where(eq(dataPromotionBatches.promotionId, input.promotionId));
  const dispositions = await database.select({ id: dataPromotionDispositions.id }).from(dataPromotionDispositions).where(eq(dataPromotionDispositions.promotionId, input.promotionId));
  const completed = batches.filter(batch => batch.status === "completed").length;
  const hasFailure = batches.some(batch => ["failed", "quarantined"].includes(batch.status));
  const targetEvidenceMissing = input.requireTargetEvidence !== false && (!promotion.targetWatermark || promotion.validationState === "unknown");
  const status = hasFailure ? "blocked" : batches.length === 0 || targetEvidenceMissing ? "unknown" : completed !== batches.length ? "blocked" : "passed";
  const safeReason = hasFailure ? "Promotion contains failed or quarantined batches" : targetEvidenceMissing ? "Target watermark and validation evidence are incomplete" : completed !== batches.length ? "Promotion has incomplete batches" : "All recorded promotion batches are complete";
  return {
    promotionId: promotion.id, status, batchCount: batches.length, completedBatchCount: completed,
    dispositionCount: dispositions.length, safeReason,
    manifestDigest: deterministicPromotionDigest({ promotionId: promotion.id, phase: promotion.phase, batches: batches.map(batch => ({ key: batch.batchKey, status: batch.status, digest: batch.digest, end: batch.endWatermark })) }),
  };
}
