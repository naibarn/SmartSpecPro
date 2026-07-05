import "dotenv/config";
import { getDb, db } from "../server/db";
import { and, eq } from "drizzle-orm";
import { verticalDramaSeries, verticalDramaCharacters, mediaModels } from "../drizzle/schema";
import { generateCharacterVisualPrompts } from "../server/services/verticalDramaCharacterImageGeneration";
import { verticalDramaCharacterStockService } from "../server/services/verticalDramaCharacterStock";
import { mediaGenerationService, DEFAULT_MODELS } from "../server/services/mediaGenerationService";
import { calculateCreditCost } from "../server/services/pricingCalculator";
import { hasEnoughCredits, deductCredits } from "../server/services/creditService";
import { signBearerToken } from "../server/_core/tokens";
import crypto from "crypto";

async function main() {
  getDb();
  const tenantId = "tenant-ZCSKEM9s";
  const userId = 1;
  const seriesId = 2;
  const characterId = 1;

  const [character] = await db
    .select()
    .from(verticalDramaCharacters)
    .where(and(eq(verticalDramaCharacters.id, characterId), eq(verticalDramaCharacters.tenantId, tenantId)))
    .limit(1);
  const [seriesRow] = await db
    .select({ title: verticalDramaSeries.title, genre: verticalDramaSeries.genre, tone: verticalDramaSeries.tone })
    .from(verticalDramaSeries)
    .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
    .limit(1);

  console.log("Character:", character.name, character.role);

  const promptResult = await generateCharacterVisualPrompts({
    userId, tenantId, seriesId, characterId,
    characterKey: character.characterKey, name: character.name, role: character.role,
    storyContext: seriesRow ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined } : undefined,
  });
  console.log("Prompt fields present:", {
    portrait: Boolean(promptResult.portraitPrompt),
    turnaround: Boolean(promptResult.turnaroundPrompt),
    fullBody: Boolean(promptResult.fullBodyPrompt),
    expression: Boolean(promptResult.expressionSheetPrompt),
    outfit: Boolean(promptResult.outfitSheetPrompt),
  });

  const referencePortraitUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
    { tenantId, userId, seriesId }, characterId
  );
  console.log("Has reference portrait:", Boolean(referencePortraitUrl));

  const personality = "warm-hearted but firm when protecting her family";
  const statsBlock = `Role: ${character.role}. Personality: ${personality}.`;
  const sheetPrompt = [
    `Design a professional character reference sheet (production "character sheet" infographic layout) for a character named exactly "${character.name}" — do not translate or alter the name, render it exactly as given.`,
    `All stat labels and text on the sheet must be in English. The character's name itself is the one exception — always show it exactly as given, untranslated.`,
    "Layout: a large portrait panel on one side; a 3-pose turnaround row (front view, side view, back view) using this reference: " + promptResult.turnaroundPrompt + ".",
    "A facial-expression grid (at least 4 small panels) using this reference: " + promptResult.expressionSheetPrompt + ".",
    "An outfit/full-body panel using this reference: " + promptResult.outfitSheetPrompt + " and " + promptResult.fullBodyPrompt + ".",
    `A compact stats sidebar with these details, formatted as short labeled lines: ${statsBlock}.`,
    "Keep the SAME character identity, face, and wardrobe consistent across every panel on the sheet.",
    "Clean, professional infographic background (light neutral), clear panel dividers, small section headers above each panel.",
  ].join(" ");
  const renderSheetPrompt = referencePortraitUrl
    ? `${sheetPrompt} Use the attached reference image as this character's exact identity across every panel — match face shape, skin tone, hairstyle precisely; do not alter identity.`
    : sheetPrompt;

  const [pricingRow] = await db
    .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
    .from(mediaModels).where(eq(mediaModels.modelId, DEFAULT_MODELS.image)).limit(1);
  const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
  const sheetCreditCost = calculateCreditCost(pricingModel, { numImages: 2 });
  console.log("Sheet credit cost:", sheetCreditCost);
  const hasCredits = await hasEnoughCredits(userId, sheetCreditCost);
  if (!hasCredits) { console.log("STOP: insufficient credits"); process.exit(1); }

  await deductCredits({
    userId, tenantId, amount: sheetCreditCost,
    description: `Vertical Drama — generate character sheet (character #${characterId}, reserved) [test]`,
    sourceType: "media_image",
    metadata: { feature: "vertical_drama_character_sheet", seriesId, characterId, type: "reservation", creditCost: sheetCreditCost },
  });
  console.log("Reserved credits.");

  const userToken = signBearerToken(
    { sub: String(userId), type: "access", scopes: ["media:generate"], jti: `test_sheet_${Date.now()}` },
    "15m"
  );

  const task = await mediaGenerationService.generateImageAsync(
    {
      prompt: renderSheetPrompt,
      negativePrompt: promptResult.negativePrompt,
      numImages: 1,
      aspectRatio: "9:16",
      ...(referencePortraitUrl ? { referenceImageUrls: [referencePortraitUrl] } : {}),
      auditContext: { userId, traceId: crypto.randomUUID(), source: "test-script-sheet", stage: "submission" },
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
