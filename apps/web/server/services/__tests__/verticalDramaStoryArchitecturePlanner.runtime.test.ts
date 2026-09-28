import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  assertRecommended: vi.fn(async () => undefined),
  resolveRecommended: vi.fn(async () => "openai/gpt-5.6-luna"),
}));

vi.mock("../verticalDramaStoryBible", () => ({
  VD_COMPACT_JSON_INSTRUCTION: "compact-json",
  executeJsonPlanningCallWithRetry: mocks.execute,
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  assertVerticalDramaRecommendedDraftModel: mocks.assertRecommended,
  resolveVerticalDramaRecommendedDraftModel: mocks.resolveRecommended,
}));

import { planVerticalDramaStoryArchitecture } from "../verticalDramaStoryArchitecturePlanner";

const contract = {
  contractVersion: 1,
  premiseAnchor: "A creator builds a community project under pressure.",
  requiredArcTypes: ["other"],
  audiencePromise: {
    genrePromise: "Warm grounded drama",
    emotionalPromise: "Hope earned through setbacks",
    coreQuestion: "Can the project survive the next test?",
  },
  protagonistArc: {
    startingState: "Capable but isolated",
    shortTermGoal: "Complete the first working prototype",
    internalNeed: "Ask for help before the crisis grows",
    longTermDestination: "Lead a sustainable community project",
    transformationStages: [
      {
        phase: "attempt",
        beliefBefore: "I must do it alone",
        change: "Makes a risky attempt",
        evidence: "The first prototype fails",
      },
      {
        phase: "cost",
        beliefBefore: "Failure proves I am unfit",
        change: "Learns from the constraint",
        evidence: "A collaborator identifies the real issue",
      },
      {
        phase: "payoff",
        beliefBefore: "Trust slows the work",
        change: "Shares ownership",
        evidence: "The team delivers a viable solution",
      },
    ],
    endState: "A capable leader who builds with others",
  },
  primaryEngine: {
    statement:
      "Each episode tests the project with a harder real-world constraint.",
    repeatableEpisodeMechanism:
      "A new constraint forces an experiment, setback, and decision.",
    escalationLadder: [
      {
        phase: "setup",
        pressure: "Time is short",
        cost: "A small delay",
        turningPoint: "The first plan breaks",
      },
      {
        phase: "pressure",
        pressure: "Resources are cut",
        cost: "A visible failure",
        turningPoint: "The team changes method",
      },
      {
        phase: "crisis",
        pressure: "The final test arrives",
        cost: "The project may close",
        turningPoint: "The team proves its value",
      },
    ],
  },
  arcBundles: [
    {
      id: "other",
      label: "Community project arc",
      required: true,
      startingState: "The project is at risk",
      turningPoints: ["The first test fails", "The team unites"],
      failureOrCost: "A failed demonstration costs the team its last chance.",
      payoff: "The repaired project earns a fair hearing.",
      endState: "The project continues with shared ownership.",
    },
  ],
  realityFailureModel: {
    realWorldConstraints: ["Limited time and budget"],
    failedAttempts: ["The first prototype overheats"],
    lessonsLearned: ["Test the weakest assumption first"],
  },
  destination: {
    seasonEndpoint: "The community approves a sustainable next phase.",
    longTermEndpoint: "The project becomes a model others can adopt.",
    horizon: "series",
    finalImage: "The team opens the project doors together.",
    meaning: "Progress is strongest when responsibility is shared.",
  },
  promisePayoffMap: [
    {
      promiseId: "shared-work",
      setup: "The creator resists help.",
      payoff: "The team succeeds through shared ownership.",
    },
  ],
  storyGuardrails: ["Keep the project problem as the primary engine."],
};

describe("Vertical Drama story architecture runtime contract", () => {
  it("repairs a stale seeded contract directly without spending a fresh plan call", async () => {
    mocks.execute.mockReset();
    const repairedContract = {
      ...contract,
      requiredArcTypes: ["romance"],
      arcBundles: [
        {
          ...contract.arcBundles[0],
          id: "romance",
          label: "Romance arc",
        },
      ],
    };
    mocks.execute.mockResolvedValue({
      data: repairedContract,
      response: { usage: { prompt_tokens: 11, completion_tokens: 21 } },
    });

    const result = await planVerticalDramaStoryArchitecture({
      userId: 7,
      model: "openai/gpt-5.6-luna",
      locale: "en",
      userPremise: "Two creators learn to trust each other.",
      genreHint: "romance",
      selectedCategories: ["romance"],
      selectedPresets: [],
      targetEpisodeCount: 10,
      existingContract: contract,
    });

    expect(result.contract?.requiredArcTypes).toEqual(["romance"]);
    expect(result.repairRounds).toBe(0);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0].userPrompt).toContain(
      "ARCHITECTURE REPAIR MODE"
    );
  });

  it("does not call the model when the seeded contract is already ready", async () => {
    mocks.execute.mockReset();

    const result = await planVerticalDramaStoryArchitecture({
      userId: 7,
      model: "openai/gpt-5.6-luna",
      locale: "en",
      userPremise: "A creator builds a community project under pressure.",
      selectedCategories: [],
      selectedPresets: [],
      targetEpisodeCount: 10,
      existingContract: contract,
    });

    expect(result.contract).toEqual(contract);
    expect(result.repairRounds).toBe(0);
    expect(result.promptTokens).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("pins the selected recommended model and sends structured output without provider fallback", async () => {
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue({
      data: contract,
      response: { usage: { prompt_tokens: 10, completion_tokens: 20 } },
    });

    await planVerticalDramaStoryArchitecture({
      userId: 7,
      model: "openai/gpt-5.6-luna",
      locale: "en",
      userPremise: "A creator builds a community project under pressure.",
      selectedCategories: [],
      selectedPresets: [],
      targetEpisodeCount: 10,
    });

    const call = mocks.execute.mock.calls[0][0];
    expect(call.model).toBe("openai/gpt-5.6-luna");
    expect(call.maxTokens).toBe(9000);
    expect(call.retryMaxTokens).toBe(16000);
    expect(call.maxSchemaRetries).toBe(2);
    expect(call.maxTransientRetries).toBe(0);
    expect(call.modelFallbackPolicy).toBeUndefined();
    expect(call.modelFallbackOnSchema).toBeUndefined();
    expect(call.schemaRetryContract).toContain(
      "audiencePromise requires genrePromise, emotionalPromise, coreQuestion"
    );
    expect(call.disableProviderFallbacks).toBe(true);
    expect(call.extraBodyParams.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "vertical_drama_story_architecture_v1",
        strict: false,
      },
    });
    expect(
      call.extraBodyParams.response_format.json_schema.schema.required
    ).toEqual(
      expect.arrayContaining([
        "contractVersion",
        "premiseAnchor",
        "primaryEngine",
      ])
    );
  });
});
