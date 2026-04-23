import { describe, expect, it } from "vitest";

import { compareTeamReplaySnapshots } from "../agentRuntime/teamRuntimeOrchestrator";

describe("compareTeamReplaySnapshots", () => {
  it("detects review verdict drift", () => {
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

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["review_verdict_drift"],
    });
  });

  it("detects runtime status drift", () => {
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
        reviewVerdict: "pass",
        status: "failed",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["status_drift"],
    });
  });
});
