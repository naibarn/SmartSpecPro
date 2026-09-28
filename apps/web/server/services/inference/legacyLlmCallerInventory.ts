/**
 * Direct legacy Web callsites that still bypass the Spec 231 plan pipeline.
 * Runtime/billing/job owners are intentionally tracked in the implementation
 * research ledger until each path is source-traced and safely adopted.
 */
export const legacyLlmCallerInventory = [
  { sourcePath: "server/_core/mcpRegistry.ts", functionName: "executeGatewayChat", callsiteCount: 1 },
  { sourcePath: "server/services/verticalDramaAdBanner.ts", functionName: "generateAdBannerPrompt", callsiteCount: 1 },
  { sourcePath: "server/services/verticalDramaStoryBible.ts", functionName: "executeJsonPlanningCallWithRetry", callsiteCount: 1 },
  { sourcePath: "server/services/verticalDramaStoryBible.ts", functionName: "runVisionAwareJsonAttempt", callsiteCount: 1 },
  { sourcePath: "server/services/marketplaceAutoReviewService.ts", functionName: "rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill", callsiteCount: 1 },
  { sourcePath: "server/services/marketplaceAutoReviewService.ts", functionName: "generateMarketplaceSequentialShotTextWithSkill", callsiteCount: 1 },
  { sourcePath: "server/routers/skills.ts", functionName: "callLLMWithVision", callsiteCount: 2 },
  { sourcePath: "server/services/skillModelFallback.ts", functionName: "executeSkillLlmWithFallback", callsiteCount: 1 },
  { sourcePath: "server/services/llmRoutesHandler.ts", functionName: "handleChatWithRouter", callsiteCount: 1 },
  { sourcePath: "server/services/llmRoutesHandler.ts", functionName: "handleStreamWithRouter", callsiteCount: 1 },
  { sourcePath: "server/services/productReviewSequentialStoryboardSkillRunner.ts", functionName: "invokeStartFramePromptEngineSkillCall", callsiteCount: 1 },
  { sourcePath: "server/services/productReviewSequentialStoryboardSkillRunner.ts", functionName: "buildProductionSequentialSingleShotRefreshEffects", callsiteCount: 1 },
  { sourcePath: "server/services/productReferenceStoryboardSkillRunner.ts", functionName: "optimizeProductReferenceStoryboardPrompt", callsiteCount: 1 },
  { sourcePath: "server/services/productReferenceStoryboardSkillRunner.ts", functionName: "runProductReferenceStoryboardPromptSkill", callsiteCount: 1 },
  { sourcePath: "server/services/callLLMStructured.ts", functionName: "callLLMStructuredLegacy", callsiteCount: 1 },
  { sourcePath: "server/services/aiPresentationService.ts", functionName: "invokeSkillTextLLM", callsiteCount: 1 },
  { sourcePath: "server/services/channelGateway.ts", functionName: "processMessageServerSide", callsiteCount: 2 },
  { sourcePath: "server/services/productVideoMotionPromptSkillRunner.ts", functionName: "runProductVideoMotionPromptSkill", callsiteCount: 1 },
] as const;
