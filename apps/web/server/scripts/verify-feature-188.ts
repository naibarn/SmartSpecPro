import { validatePromotion } from "../services/promotionValidation";

export async function verifyFeature188Promotion(promotionId: string) {
  if (!promotionId?.trim()) throw new Error("PROMOTION_ID_REQUIRED");
  return validatePromotion({ promotionId: promotionId.trim(), requireTargetEvidence: true });
}

if (process.argv[1]?.endsWith("verify-feature-188.ts")) {
  verifyFeature188Promotion(process.argv[2] || "").then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
