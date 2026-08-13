import { describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(
      () =>
        "---\nname: vertical-drama-preset-synthesizer\n---\nCompletion skill"
    ),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "Completion skill" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/skill.md"),
}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(() => 1),
  resolveModel: vi.fn(async () => "openai/gpt-5.6-luna"),
}));

vi.mock("../verticalDramaStoryBible", () => ({
  executeJsonPlanningCallWithRetry: mocks.execute,
}));
vi.mock("../creditService", () => ({
  deductCredits: mocks.deductCredits,
  calculateCreditsForLLM: mocks.calculateCreditsForLLM,
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaRecommendedDraftModel: mocks.resolveModel,
}));

import {
  completeVerticalDramaDraft,
  materializeVerticalDramaDraftFoundation,
  verticalDramaDraftCompletionResponseSchema,
} from "../verticalDramaDraftCompletion";
import { inspectVerticalDramaDraftCompleteness } from "@shared/verticalDramaSeries/draftCompletion";

const PROOF_OF_US_PREMISE = `
Proof of Us is a Young Adult campus romance and academic-rivalry drama about a
mathematics prodigy from rural Asia who earns a scholarship to a top US
university despite weak spoken English. An American star student becomes her
rival and then her collaborator and love interest. Her journey grows from
solving textbook problems into mathematical optimization for structural
engineering, numerical computation, and computer-aided design. Early models
fail because real structures must handle material limits, wind, vibration,
weight, lifespan, and construction constraints. Years later, researchers,
structural engineers, architects, and material specialists use her method on a
real large-scale structure. The theme is that learning matters when it lets us
ask questions that no textbook has answered. Tagline: She understands every
equation—until she finds one the world hasn't solved yet.
`;

const STORY_ARCHITECTURE = {
  contractVersion: 1 as const,
  premiseAnchor:
    "A rural Asian mathematics prodigy turns outsiderhood into a new engineering method.",
  requiredArcTypes: [
    "romance",
    "academic",
    "professional_innovation",
    "underdog_identity",
  ] as const,
  audiencePromise: {
    genrePromise:
      "Campus romance grows into an engineering innovation journey.",
    emotionalPromise:
      "An overlooked outsider earns belonging without losing her origin.",
    coreQuestion:
      "Can a beautiful mathematical idea survive the limits of the real world?",
  },
  protagonistArc: {
    startingState:
      "A brilliant rural student is isolated by language and unequal opportunity.",
    shortTermGoal:
      "Prove she belongs in the university and finish the first team project.",
    internalNeed:
      "Learn that collaboration and translation are strengths, not concessions.",
    longTermDestination:
      "Create a structural optimization method that engineers can actually build.",
    transformationStages: [
      {
        phase: "outsider",
        beliefBefore: "Only perfect answers protect me.",
        change: "She risks showing unfinished work.",
        evidence: "A classroom solution earns reluctant respect.",
      },
      {
        phase: "collaborator",
        beliefBefore: "Others will only slow the mathematics.",
        change: "She accepts engineering and emotional partners.",
        evidence: "The team finds a flaw her equations missed.",
      },
      {
        phase: "creator",
        beliefBefore: "A proof is enough.",
        change: "She designs for failure, cost, and construction.",
        evidence: "A tested prototype survives a real constraint.",
      },
    ],
    endState:
      "She becomes a researcher whose ideas connect mathematics, people, and built reality.",
  },
  primaryEngine: {
    statement:
      "Each episode turns a mathematical insight into a harder human or real-world test.",
    repeatableEpisodeMechanism:
      "A new academic, relationship, or engineering constraint exposes a flaw and forces a better choice.",
    escalationLadder: [
      {
        phase: "campus",
        pressure: "Language and status hide her ability.",
        cost: "She loses trust and access.",
        turningPoint: "A rival sees the quality of her reasoning.",
      },
      {
        phase: "research",
        pressure: "The first optimization model fails in simulation.",
        cost: "Her credibility and relationship fracture.",
        turningPoint: "She learns to include the engineers' constraints.",
      },
      {
        phase: "impact",
        pressure:
          "A real project must choose between elegance, safety, and cost.",
        cost: "The team risks a public failure.",
        turningPoint: "A tested compromise makes the method buildable.",
      },
    ],
  },
  arcBundles: [
    {
      id: "romance",
      label: "Rivalry to partnership",
      required: true,
      startingState: "They compete for status.",
      turningPoints: [
        "He witnesses her insight.",
        "They choose honest collaboration.",
      ],
      failureOrCost: "Pride and translation gaps damage their trust.",
      payoff: "They become partners who challenge and protect one another.",
      endState: "Love is built through earned respect.",
      episodeWindow: { startEpisode: 1, endEpisode: 10 },
    },
    {
      id: "academic",
      label: "Belonging in the classroom",
      required: true,
      startingState: "She is underestimated.",
      turningPoints: [
        "She solves the unsolved problem.",
        "She leads a difficult research defense.",
      ],
      failureOrCost: "A brilliant answer cannot hide communication gaps.",
      payoff: "Her peers value both her mind and her voice.",
      endState: "She belongs without becoming someone else.",
      episodeWindow: { startEpisode: 1, endEpisode: 6 },
    },
    {
      id: "professional_innovation",
      label: "From theorem to structure",
      required: true,
      startingState: "Her model is elegant but unbuildable.",
      turningPoints: [
        "Simulation exposes failure.",
        "A prototype survives testing.",
      ],
      failureOrCost:
        "Material, wind, vibration, and construction limits defeat the first model.",
      payoff:
        "A multidisciplinary team validates the method on a real project.",
      endState: "Mathematics becomes a tool for the built world.",
      episodeWindow: { startEpisode: 5, endEpisode: 10 },
    },
    {
      id: "underdog_identity",
      label: "The outsider claims her future",
      required: true,
      startingState: "She treats difference as a weakness.",
      turningPoints: [
        "She names the unfair gap.",
        "She chooses her own definition of success.",
      ],
      failureOrCost:
        "Isolation makes every setback feel like proof she does not belong.",
      payoff: "Her origin becomes part of the perspective she contributes.",
      endState: "She creates from a place of belonging.",
      episodeWindow: { startEpisode: 1, endEpisode: 10 },
    },
  ],
  realityFailureModel: {
    realWorldConstraints: [
      "Material limits",
      "Wind and vibration",
      "Construction cost and lifespan",
    ],
    failedAttempts: [
      "The first simulation optimizes strength but cannot be fabricated.",
      "The prototype fails under combined loading.",
    ],
    lessonsLearned: [
      "Safety and constructability are first-class constraints.",
      "A theorem needs experiments and collaborators.",
    ],
  },
  destination: {
    seasonEndpoint:
      "The team validates the first buildable version and the relationship survives the cost.",
    longTermEndpoint:
      "Years later, the method helps engineers design a large real structure.",
    horizon: "series" as const,
    finalImage:
      "She stands before steel and concrete rising from equations once written in a rural notebook.",
    meaning: "Learning matters when it creates answers the world can build.",
  },
  promisePayoffMap: [
    {
      promiseId: "outsider-genius",
      setup: "The student solves what the room cannot.",
      payoff: "Her way of seeing becomes a new research method.",
      payoffWindow: { startEpisode: 1, endEpisode: 3 },
    },
    {
      promiseId: "equation-to-world",
      setup: "The model must survive reality.",
      payoff: "A large structure is built with the method.",
      payoffWindow: { startEpisode: 8, endEpisode: 10 },
    },
  ],
  storyGuardrails: [
    "Keep the academic romance and engineering innovation as connected but distinct arcs.",
    "Do not treat mathematical elegance as proof of practical safety.",
  ],
};

const STORY_DESIGN = {
  contractVersion: 1 as const,
  primaryEngine: STORY_ARCHITECTURE.primaryEngine.statement,
  secondaryEngines: [
    "Rivalry-to-romance progression",
    "Scholarship and belonging pressure",
  ],
  pressureThreads: [
    {
      threadId: "research-model",
      label: "Model to prototype",
      description:
        "Turn the optimization model into a tested buildable method.",
      category: "external_goal" as const,
      episodeWindow: { startEpisode: 5, endEpisode: 10 },
    },
    {
      threadId: "rivalry-romance",
      label: "Rivalry to trust",
      description:
        "Earn partnership through intellectual and emotional honesty.",
      category: "romance" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 10 },
    },
  ],
  earlyPayoff: {
    promise: "The overlooked student solves the problem no one else can.",
    episodeWindow: { startEpisode: 1, endEpisode: 2 },
    evidence:
      "Her proof changes the room's view before the first campus arc ends.",
  },
  romanceProgression: [
    {
      phase: "friction" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 3 },
      pair: ["Lina Viriya", "Ethan Cole"] as [string, string],
      purpose: "Competition exposes their unequal advantages.",
      allowPause: true,
    },
    {
      phase: "trust_shift" as const,
      episodeWindow: { startEpisode: 4, endEpisode: 7 },
      pair: ["Lina Viriya", "Ethan Cole"] as [string, string],
      purpose: "They protect each other's unfinished work.",
      allowPause: true,
    },
    {
      phase: "commitment" as const,
      episodeWindow: { startEpisode: 8, endEpisode: 10 },
      pair: ["Lina Viriya", "Ethan Cole"] as [string, string],
      purpose: "They choose the work and relationship honestly.",
      allowPause: true,
    },
  ],
  advantageBeats: [
    {
      episodeNumber: 1,
      advantagedSide: "protagonist" as const,
      cost: "Recognition makes her a target.",
      opponentResponse: "The rival raises the difficulty.",
    },
    {
      episodeNumber: 5,
      advantagedSide: "antagonist" as const,
      cost: "The model fails under physical constraints.",
      opponentResponse: "The team demands evidence, not elegance.",
    },
    {
      episodeNumber: 9,
      advantagedSide: "shared" as const,
      cost: "Validation requires compromise.",
      opponentResponse: "The real project accepts the tested method.",
    },
  ],
  conflictGuardrails: [
    "Keep disagreement rooted in goals, opportunity, language confidence, systems, and choices.",
    "Never equate English fluency with mathematical ability.",
    "Require engineering evidence before claiming a safe structure.",
  ],
  storyControlSeed: {
    contractVersion: 1 as const,
    premiseAnchor: STORY_ARCHITECTURE.premiseAnchor,
    canonicalCharacterKeys: ["Lina Viriya", "Ethan Cole", "Dr. Maya Chen"],
    threadCandidates: [],
    romancePhaseSkeleton: [],
    advantageIntent: [],
  },
};

const INCOMPLETE_PROOF_OF_US_DRAFT = {
  contract_version: 1,
  title: "Proof of Us",
  titleOptions: [
    "Proof of Us",
    "The Unsolved Equation",
    "Built from Numbers",
    "Between Two Proofs",
  ],
  category: "Young Adult Campus Romance Academic Rivalry",
  logline:
    "A rural mathematics prodigy and her American rival turn a campus rivalry into a method that can change the built world.",
  mainPlot: PROOF_OF_US_PREMISE,
  seasonArc:
    "A scholarship student earns belonging, survives a failed model, and begins the path from theorem to structure.",
  tone: "Earnest, intelligent, romantic, and grounded in real consequences.",
  cliffhangerStyle:
    "End on a new constraint, a relationship reversal, or evidence that the model may fail.",
  creatorSummary: {
    whatItIsAbout:
      "A mathematics prodigy learns to turn insight into collaboration and practical innovation.",
    protagonistAndGoal:
      "Lina Viriya wants to belong, then wants to make structural design safer and more efficient.",
    conflictAndDiscovery:
      "Language, status, rivalry, and failed simulations force her to value engineering evidence and human trust.",
    centralMystery:
      "Can an elegant optimization idea survive the constraints of the real world?",
    decisionNotes: [
      "The campus romance is the emotional bridge to the engineering journey.",
    ],
  },
  characters: [
    {
      name: "Lina Viriya",
      role: "protagonist",
      description: "A self-taught mathematics prodigy from rural Asia.",
      occupation: "Scholarship mathematics student",
      narrativeRole: "protagonist",
      roleTier: "tier_1",
    },
    {
      name: "Ethan Cole",
      role: "rival",
      description:
        "A confident American star student who must learn to collaborate.",
      occupation: "Structural engineering student",
      narrativeRole: "romantic_lead",
      roleTier: "tier_1",
    },
    {
      name: "Dr. Maya Chen",
      role: "mentor",
      description:
        "A researcher who connects mathematical theory to physical testing.",
      occupation: "Applied mathematics professor",
      narrativeRole: "mentor",
      roleTier: "tier_2",
    },
  ],
  locations: [
    {
      name: "Northbridge University",
      description:
        "An elite US campus where language and status shape belonging.",
    },
    {
      name: "Computational Structures Lab",
      description:
        "A lab where simulations expose the gap between elegance and buildability.",
    },
    {
      name: "The Prototype Yard",
      description:
        "A testing site where steel, concrete, wind, and vibration make ideas physical.",
    },
  ],
  visualBible:
    "Contemporary US university, warm rural memory fragments, cool computational spaces, and monumental steel-and-concrete construction.",
  storyContext: {
    contractVersion: 1,
    targetMarket: {
      value: "Global young-adult streaming audience",
      source: "ai_inferred",
      confidence: "high",
      rationale:
        "The premise combines accessible campus romance with an international innovation journey.",
    },
    storySetting: {
      value:
        "A top US university and later an international structural-engineering research project",
      source: "user_provided",
      confidence: "high",
      rationale:
        "The premise explicitly places the scholarship and university in the United States and expands into real projects.",
    },
    leadBackground: {
      value: "Self-taught mathematics prodigy from a rural Asian community",
      source: "user_provided",
      confidence: "high",
      rationale:
        "The premise directly establishes her rural upbringing and independent education.",
    },
    leadOrigin: {
      value: "Rural Asia; specific country intentionally open",
      source: "user_provided",
      confidence: "high",
      rationale: "The premise specifies Asia but does not name a country.",
    },
    spokenDialogue: {
      value:
        "Natural contemporary American English on campus, with multilingual traces where story-justified",
      source: "user_provided",
      confidence: "high",
      rationale:
        "The wizard setting selects English dialogue and the premise makes language a meaningful challenge.",
    },
    namingPolicy: {
      value:
        "Keep Lina Viriya and Ethan Cole stable; use names consistent with each character's established background without inferring nationality from UI language.",
      source: "ai_inferred",
      confidence: "high",
      rationale:
        "Stable identity is required for continuity and the premise leaves the lead's country open.",
    },
  },
  mixRecipe: {
    primaryFlavor: "Proof of Us premise",
    supportingFlavors: [],
    rationale: "The user premise is the primary story spine.",
  },
  warnings: [],
};

describe("Proof of Us draft completion regression", () => {
  it("rejects an empty storyDesign instead of allowing it to reach the final completeness loop", () => {
    expect(
      verticalDramaDraftCompletionResponseSchema.safeParse({
        draft: { storyDesign: {} },
      }).success
    ).toBe(false);
    expect(
      verticalDramaDraftCompletionResponseSchema.safeParse({
        draft: { storyDesign: STORY_DESIGN },
      }).success
    ).toBe(true);
  });

  it("keeps the architecture and every existing draft field when the repair response is partial", async () => {
    mocks.execute.mockResolvedValue({
      data: { draft: { storyDesign: STORY_DESIGN } },
      response: { usage: { prompt_tokens: 100, completion_tokens: 200 } },
    });

    const result = await completeVerticalDramaDraft({
      draft: INCOMPLETE_PROOF_OF_US_DRAFT as never,
      model: "openai/gpt-5.6-luna",
      context: {
        locale: "en",
        targetEpisodeCount: 10,
        genre:
          "Young Adult Campus Romance Academic Rivalry Science Engineering Drama",
        userPremise: PROOF_OF_US_PREMISE,
        storyArchitecture: STORY_ARCHITECTURE,
      },
      repairRound: 1,
      userId: 7,
    });

    expect(result.draft.title).toBe("Proof of Us");
    expect(result.draft.mainPlot).toContain("mathematics prodigy");
    expect(result.draft.storyContract).toEqual(STORY_ARCHITECTURE);
    expect(result.draft.storyDesign).toEqual(STORY_DESIGN);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const completionCall = mocks.execute.mock.calls[0][0];
    expect(completionCall.userPrompt).toContain("APPROVED STORY ARCHITECTURE");
    expect(
      completionCall.extraBodyParams.response_format.json_schema.schema
        .properties.draft.required
    ).toContain("storyDesign");

    const finalCheck = inspectVerticalDramaDraftCompleteness({
      draft: result.draft as Record<string, unknown>,
      targetEpisodeCount: 10,
      genre:
        "Young Adult Campus Romance Academic Rivalry Science Engineering Drama",
      userPremise: PROOF_OF_US_PREMISE,
    });
    expect(finalCheck.ready).toBe(true);
    expect(finalCheck.report.missingPaths).toEqual([]);
    expect(finalCheck.report.contradictionPaths).toEqual([]);
  });

  it("materializes a complete storyDesign when the provider returns an empty object", async () => {
    mocks.execute.mockResolvedValue({
      data: { draft: { storyDesign: {} } },
      response: { usage: { prompt_tokens: 100, completion_tokens: 50 } },
    });

    const result = await completeVerticalDramaDraft({
      draft: INCOMPLETE_PROOF_OF_US_DRAFT as never,
      model: "openai/gpt-5.6-luna",
      context: {
        locale: "en",
        targetEpisodeCount: 10,
        genre:
          "Young Adult Campus Romance Academic Rivalry Science Engineering Drama",
        userPremise: PROOF_OF_US_PREMISE,
        storyArchitecture: STORY_ARCHITECTURE,
      },
      repairRound: 1,
      userId: 7,
    });

    expect(result.draft.storyDesign).toMatchObject({
      primaryEngine: STORY_ARCHITECTURE.primaryEngine.statement,
      storyControlSeed: {
        canonicalCharacterKeys: ["Lina Viriya", "Ethan Cole", "Dr. Maya Chen"],
      },
    });
    const finalCheck = inspectVerticalDramaDraftCompleteness({
      draft: result.draft as Record<string, unknown>,
      targetEpisodeCount: 10,
      genre:
        "Young Adult Campus Romance Academic Rivalry Science Engineering Drama",
      userPremise: PROOF_OF_US_PREMISE,
    });
    expect(finalCheck.ready).toBe(true);
  });

  it("binds the approved contract even when the incoming draft has neither contract nor design", () => {
    expect(
      materializeVerticalDramaDraftFoundation({
        draft: { title: "Proof of Us", creatorNote: "keep this" },
        storyArchitecture: STORY_ARCHITECTURE,
      })
    ).toEqual({
      title: "Proof of Us",
      creatorNote: "keep this",
      storyContract: STORY_ARCHITECTURE,
    });
  });
});
