import "dotenv/config";
import { getDb, db } from "../server/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  verticalDramaEpisodes,
  verticalDramaCharacters,
  mediaAssets,
  mediaModels,
} from "../drizzle/schema";
import { mediaGenerationService, DEFAULT_MODELS } from "../server/services/mediaGenerationService";
import { calculateCreditCost } from "../server/services/pricingCalculator";
import { hasEnoughCredits, deductCredits } from "../server/services/creditService";
import { signBearerToken } from "../server/_core/tokens";
import { verticalDramaCharacterStockService } from "../server/services/verticalDramaCharacterStock";
import crypto from "crypto";

async function main() {
  getDb();
  const tenantId = "tenant-ZCSKEM9s";
  const userId = 1;
  const seriesId = 2;
  const episodeId = 1;
  const shotNumber = 1;

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
  console.log("Has credits:", hasCredits, "cost:", imageCreditCost);
  if (!hasCredits) { console.log("STOP: insufficient credits"); process.exit(1); }

  const userToken = signBearerToken(
    { sub: String(userId), type: "access", scopes: ["media:generate"], jti: `test_${Date.now()}` },
    "15m"
  );

  const renderResult = await mediaGenerationService.generateImage(
    {
      prompt: frame.imagePrompt,
      negativePrompt: frame.negativePrompt,
      numImages: 1,
      aspectRatio: "9:16",
      auditContext: { userId, traceId: crypto.randomUUID(), source: "test-script", stage: "submission" },
    },
    userToken
  );
  console.log("Render result:", JSON.stringify({ model: renderResult.model, creditsUsed: renderResult.creditsUsed, url: renderResult.data?.[0]?.url }, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
