import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SERVICE_DIR = path.resolve(process.cwd(), "server/services");

const WRAPPED_CALLS = [
  "verticalDramaStoryBible.ts",
  "verticalDramaScriptGeneration.ts",
  "verticalDramaStoryboardGeneration.ts",
  "verticalDramaStartFrameGeneration.ts",
  "verticalDramaDialogueAudio.ts",
  "verticalDramaVideoMotionPromptGeneration.ts",
  "verticalDramaCharacterPromptSkill.ts",
  "verticalDramaCharacterImageGeneration.ts",
  "verticalDramaCharacterLookDesigner.ts",
  "verticalDramaCharacterMerge.ts",
  "verticalDramaCharacterVariantPlanner.ts",
  "verticalDramaLocationDetector.ts",
  "verticalDramaLocationImageGeneration.ts",
  "verticalDramaSeriesMemoryPlanning.ts",
  "verticalDramaEpisodeQualityReview.ts",
  "verticalDramaEpisodeContinuation.ts",
  "verticalDramaSpecialEdition.ts",
  "verticalDramaSpecialSkillAdapter.ts",
  "verticalDramaGenreProposal.ts",
  "verticalDramaPromptExpansionService.ts",
  "verticalDramaPromptQc.ts",
  "verticalDramaShotImageAction.ts",
  "verticalDramaLedgerPlanner.ts",
  "verticalDramaSeasonCarryOver.ts",
  "verticalDramaDraftCompletion.ts",
  "verticalDramaDraftQualityQc.ts",
  "verticalDramaStoryArchitecturePlanner.ts",
  "verticalDramaMarketplaceReviewSkillAdapter.ts",
  "verticalDramaPresetSynthesis.ts",
] as const;

describe("Vertical Drama LLM call-site coverage", () => {
  it("keeps every JSON planning caller on the task-aware policy path", () => {
    for (const fileName of WRAPPED_CALLS) {
      const source = fs.readFileSync(path.join(SERVICE_DIR, fileName), "utf8");
      expect(source, fileName).toMatch(/verticalDramaContext|resolveVerticalDramaLlmExtraBodyParams/);
    }
  });
});
