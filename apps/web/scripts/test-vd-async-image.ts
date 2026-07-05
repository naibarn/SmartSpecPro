import "dotenv/config";
import { getDb, db } from "../server/db";
import { and, eq } from "drizzle-orm";
import { verticalDramaEpisodes, mediaModels } from "../drizzle/schema";
import { mediaGenerationService, DEFAULT_MODELS } from "../server/services/mediaGenerationService";
import { calculateCreditCost } from "../server/services/pricingCalculator";
import { hasEnoughCredits, deductCredits, refundCredits } from "../server/services/creditService";
import { signBearerToken } from "../server/_core/tokens";
import crypto from "crypto";

async function main() {
  getDb();
  const tenantId = "tenant-ZCSKEM9s";
  const userId = 1;
  const seriesId = 2;
  const episodeId = 1;
  const shotNumber = 2; // different shot than the earlier sync test

  const [row] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(and(eq(verticalDramaEpisodes.id, episodeId), eq(verticalDramaEpisodes.tenantId, tenantId)))
    .limit(1);
  const plan = row.startFramePlan as any;
  const frame = plan.frames.find((f: any) => f.shotNumber === shotNumber);
  console.log("Prompt:", frame.imagePrompt);

  const [pricingRow] = await db
    .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
    .from(mediaModels)
    .where(eq(mediaModels.modelId, DEFAULT_MODELS.image))
    .limit(1);
  const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
  const imageCreditCost = calculateCreditCost(pricingModel, { numImages: 1 });
  const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
  console.log("Has credits:", hasCredits, "reserving:", imageCreditCost);
  if (!hasCredits) { console.log("STOP"); process.exit(1); }

  await deductCredits({
    userId, tenantId, amount: imageCreditCost,
    description: `Vertical Drama — start frame render (episode #${episodeId}, shot ${shotNumber}, reserved) [test]`,
    sourceType: "media_image",
    metadata: { feature: "vertical_drama_series", seriesId, episodeId, shotNumber, type: "reservation", creditCost: imageCreditCost },
  });
  console.log("Reserved credits.");

  const userToken = signBearerToken(
    { sub: String(userId), type: "access", scopes: ["media:generate"], jti: `test_async_${Date.now()}` },
    "15m"
  );

  let task;
  try {
    task = await mediaGenerationService.generateImageAsync(
      {
        prompt: frame.imagePrompt,
        negativePrompt: frame.negativePrompt,
        numImages: 1,
        aspectRatio: "9:16",
        auditContext: { userId, traceId: crypto.randomUUID(), source: "test-script-async", stage: "submission" },
      },
      userToken
    );
  } catch (err) {
    console.log("SUBMIT FAILED, refunding:", err);
    await refundCredits({ userId, amount: imageCreditCost, description: "Refund: test submit failed", sourceType: "media_image" });
    process.exit(1);
  }
  console.log("Task submitted:", JSON.stringify({ id: task.id, status: task.status }));

  // Poll for completion
  for (let i = 0; i < 60; i++) {
    const polled = await mediaGenerationService.getTask(task.id, userToken, {
      userId, source: "test-script-poll", stage: "poll",
    });
    console.log(`Poll ${i}: status=${polled?.status}`);
    if (polled?.status === "completed") {
      console.log("COMPLETED. resultUrl:", polled.resultUrl);
      break;
    }
    if (polled?.status === "failed") {
      console.log("FAILED:", polled.errorMessage);
      break;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
