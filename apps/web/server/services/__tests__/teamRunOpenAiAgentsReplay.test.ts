import { describe, expect, it } from "vitest";

import { compareTeamReplaySnapshots } from "../agentRuntime/teamRuntimeOrchestrator";

describe("team run OpenAI Agents replay", () => {
  it("detects review verdict drift in the run replay", () => {
    const result = compareTeamReplaySnapshots(
      {
        selectedSkillSlug: "plan-decompose",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
        reviewVerdict: "pass",
        status: "completed",
      },
      {
        selectedSkillSlug: "plan-decompose",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
        reviewVerdict: "needs_repair",
        status: "completed",
      },
    );

    expect(result.matches).toBe(false);
    expect(result.mismatchCodes).toContain("review_verdict_drift");
  });
});
