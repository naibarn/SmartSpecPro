import "dotenv/config";
import { getDb, db } from "../server/db";
import { and, eq } from "drizzle-orm";
import { verticalDramaEpisodes, mediaModels } from "../drizzle/schema";
import { mediaGenerationService, DEFAULT_MODELS } from "../server/services/mediaGenerationService";
import { calculateCreditCost } from "../server/services/pricingCalculator";
import { hasEnoughCredits, deductCredits } from "../server/services/creditService";
import { signBearerToken } from "../server/_core/tokens";
import crypto from "crypto";

async function main() {
  getDb();
  const tenantId = "tenant-ZCSKEM9s";
  const userId = 1;
  const episodeId = 1;
  const shotNumber = 3;

  const [row] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(and(eq(verticalDramaEpisodes.id, episodeId), eq(verticalDramaEpisodes.tenantId, tenantId)))
    .limit(1);
  const plan = row.startFramePlan as any;
  const frame = plan.frames.find((f: any) => f.shotNumber === shotNumber);

  const gridPrompt = [
    frame.imagePrompt,
    "",
    "Render this EXACT same scene, subject, wardrobe, lighting, and moment as a single image containing a 3x3 grid of 9 panels — 3 rows, 3 columns, each panel a full 9:16 vertical frame with a thin visible divider between panels.",
    "Each of the 9 panels must show the SAME moment from a DIFFERENT camera angle/framing — for example: wide establishing shot, medium shot, close-up, over-the-shoulder, low angle, high angle, dutch angle, extreme close-up, three-quarter profile.",
    "Keep character identity, wardrobe, and lighting perfectly consistent across all 9 panels — only the camera position/framing changes.",
  ].join(" ");
  console.log("Grid prompt length:", gridPrompt.length);

  const [pricingRow] = await db
    .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
    .from(mediaModels)
    .where(eq(mediaModels.modelId, DEFAULT_MODELS.image))
    .limit(1);
  const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
  const gridCreditCost = calculateCreditCost(pricingModel, { numImages: 2 });
  console.log("Grid credit cost:", gridCreditCost);
  const hasCredits = await hasEnoughCredits(userId, gridCreditCost);
  if (!hasCredits) { console.log("STOP: insufficient credits"); process.exit(1); }

  await deductCredits({
    userId, tenantId, amount: gridCreditCost,
    description: `Vertical Drama — multi-angle grid render (episode #${episodeId}, shot ${shotNumber}, reserved) [test]`,
    sourceType: "media_image",
    metadata: { feature: "vertical_drama_series", seriesId: 2, episodeId, shotNumber, type: "reservation", creditCost: gridCreditCost },
  });
  console.log("Reserved credits.");

  const userToken = signBearerToken(
    { sub: String(userId), type: "access", scopes: ["media:generate"], jti: `test_angle_${Date.now()}` },
    "15m"
  );

  const task = await mediaGenerationService.generateImageAsync(
    {
      prompt: gridPrompt,
      negativePrompt: frame.negativePrompt,
      numImages: 1,
      aspectRatio: "9:16",
      auditContext: { userId, traceId: crypto.randomUUID(), source: "test-script-angles", stage: "submission" },
    },
    userToken
  );
  console.log("Task submitted:", JSON.stringify({ id: task.id, status: task.status }));

  for (let i = 0; i < 60; i++) {
    const polled = await mediaGenerationService.getTask(task.id, userToken, { userId, source: "test-poll", stage: "poll" });
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
