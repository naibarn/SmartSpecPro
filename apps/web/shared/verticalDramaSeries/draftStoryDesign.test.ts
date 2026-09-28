import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaDraftStoryDesignPrompt,
  repairVerticalDramaDraftStoryDesign,
  readDraftStoryControlSeed,
  readVerticalDramaDraftStoryDesign,
  renderVerticalDramaDraftStoryDesignBlock,
} from "./draftStoryDesign";
import { inspectVerticalDramaStoryControlConsistency } from "./storyControlConsistency";

const design = {
  contractVersion: 1 as const,
  primaryEngine:
    "Academic rivalry becomes an earned romance under scholarship pressure.",
  secondaryEngines: ["family expectation"],
  pressureThreads: [
    {
      threadId: "scholarship-risk",
      label: "Scholarship risk",
      description:
        "The lead may lose funding if writing and presentation do not improve.",
      category: "career_or_school" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 8 },
    },
  ],
  earlyPayoff: {
    promise:
      "The lead solves a problem nobody else can solve in an early episode.",
    episodeWindow: { startEpisode: 1, endEpisode: 2 },
    evidence: "A public classroom challenge changes how the rival sees her.",
  },
  romanceProgression: [
    {
      phase: "friction" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 2 },
      pair: ["lead", "rival"] as [string, string],
      purpose: "They compete before they understand one another.",
      allowPause: true,
    },
  ],
  advantageBeats: [
    {
      episodeNumber: 2,
      advantagedSide: "protagonist" as const,
      cost: "She gains respect but attracts scrutiny.",
      opponentResponse: "The rival raises the difficulty.",
      purpose: "Show competence and keep the romance engine active.",
    },
  ],
  conflictGuardrails: ["Do not make racism the default conflict engine."],
  storyControlSeed: {
    contractVersion: 1 as const,
    premiseAnchor:
      "A scholarship student proves that language confidence is not intelligence.",
    canonicalCharacterKeys: ["lead", "rival"],
    threadCandidates: [],
    romancePhaseSkeleton: [],
    advantageIntent: [],
  },
};

describe("draft story design contract", () => {
  it("accepts a bounded design with a valid control seed", () => {
    const parsed = readVerticalDramaDraftStoryDesign(design);
    expect(parsed?.primaryEngine).toContain("Academic rivalry");
    expect(
      readDraftStoryControlSeed(parsed, { totalEpisodeCount: 8 })
        ?.canonicalCharacterKeys
    ).toEqual(["lead", "rival"]);
  });

  it("renders a labeled control block and prompt guardrails", () => {
    expect(renderVerticalDramaDraftStoryDesignBlock(design)).toContain(
      "The primary engine and bounded pressure threads are the spine"
    );
    expect(
      buildVerticalDramaDraftStoryDesignPrompt({ targetEpisodeCount: 8 })
    ).toContain("Advantage beats must alternate meaningful advantage and cost");
  });

  it("rejects a dangling seed through the shared validator", () => {
    expect(
      readDraftStoryControlSeed({
        ...design,
        storyControlSeed: {
          ...design.storyControlSeed,
          canonicalCharacterKeys: ["lead", "lead"],
        },
      })
    ).toBeNull();
  });

  it("repairs a long-form design into the target season with distributed milestones", () => {
    const repaired = repairVerticalDramaDraftStoryDesign({
      storyDesign: { ...design, totalEpisodeCount: 10 },
      targetEpisodeCount: 50,
      characterNames: ["lead", "rival"],
    });
    expect(repaired?.totalEpisodeCount).toBe(50);
    expect(
      repaired?.pressureThreads.some(
        thread => thread.episodeWindow.endEpisode === 50
      )
    ).toBe(true);
    expect(repaired?.advantageBeats.map(beat => beat.episodeNumber)).toEqual(
      expect.arrayContaining([1, 13, 25, 38, 50])
    );
    expect(repaired?.advantageBeats.every(beat => beat.episodeNumber <= 50)).toBe(
      true
    );
    expect(repaired?.romanceProgression.map(phase => phase.episodeWindow)).toEqual([
      { startEpisode: 1, endEpisode: 8 },
      { startEpisode: 9, endEpisode: 34 },
      { startEpisode: 35, endEpisode: 42 },
      { startEpisode: 43, endEpisode: 50 },
    ]);
    expect(repaired).toHaveProperty("legacyControlArchive.superseded", true);
  });

  it("detects duplicate and placeholder control data before QC", () => {
    const invalid = {
      ...design,
      pressureThreads: [
        design.pressureThreads[0],
        { ...design.pressureThreads[0], label: "TBD" },
      ],
      advantageBeats: [
        design.advantageBeats[0],
        { ...design.advantageBeats[0] },
      ],
      storyControlSeed: {
        ...design.storyControlSeed,
        threadCandidates: [],
        romancePhaseSkeleton: [],
        advantageIntent: [],
      },
    };
    const result = inspectVerticalDramaStoryControlConsistency({
      storyDesign: invalid,
      targetEpisodeCount: 8,
    });
    expect(result.ready).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate_pressure_thread",
        "duplicate_advantage_beat",
        "placeholder_control_text",
        "story_control_seed_drift",
      ]),
    );
  });

  it("detects a romance control window that contradicts the approved arc", () => {
    const architecture = {
      contractVersion: 1 as const,
      premiseAnchor: "A rival romance grows through a long engineering journey.",
      requiredArcTypes: ["romance" as const],
      audiencePromise: {
        genrePromise: "Campus romance with a long-form innovation payoff.",
        emotionalPromise: "Earned trust under pressure.",
        coreQuestion: "Can rivalry become partnership?",
      },
      protagonistArc: {
        startingState: "Outsider student.",
        shortTermGoal: "Earn a place on the team.",
        internalNeed: "Trust collaborators.",
        longTermDestination: "Build a real-world method.",
        transformationStages: [
          { phase: "start", beliefBefore: "alone", change: "asks for help", evidence: "teamwork" },
          { phase: "middle", beliefBefore: "prove it", change: "test it", evidence: "prototype" },
          { phase: "end", beliefBefore: "win alone", change: "share credit", evidence: "deployment" },
        ],
        endState: "A trusted innovator.",
      },
      primaryEngine: {
        statement: "Every insight creates a harder human and technical test.",
        repeatableEpisodeMechanism: "Problem, decision, consequence, pressure.",
        escalationLadder: [
          { phase: "one", pressure: "status", cost: "time", turningPoint: "proof" },
          { phase: "two", pressure: "failure", cost: "trust", turningPoint: "revision" },
          { phase: "three", pressure: "deployment", cost: "reputation", turningPoint: "build" },
        ],
      },
      arcBundles: [
        {
          id: "romance" as const,
          label: "Rivalry to partnership",
          required: true,
          startingState: "They compete.",
          turningPoints: ["Respect", "Trust"],
          failureOrCost: "They must risk vulnerability.",
          payoff: "They choose partnership.",
          endState: "Committed collaborators.",
          episodeWindow: { startEpisode: 40, endEpisode: 50 },
        },
      ],
      realityFailureModel: {
        realWorldConstraints: ["Safety"],
        failedAttempts: ["Prototype fails"],
        lessonsLearned: ["Test assumptions"],
      },
      destination: {
        seasonEndpoint: "A tested method.",
        longTermEndpoint: "A large structure.",
        horizon: "series" as const,
        finalImage: "The structure stands.",
        meaning: "Knowledge becomes useful.",
      },
      promisePayoffMap: [
        {
          promiseId: "p1",
          setup: "They clash.",
          payoff: "They collaborate.",
          payoffWindow: { startEpisode: 40, endEpisode: 50 },
        },
      ],
      storyGuardrails: ["Keep the romance earned."],
    };
    const romanceDesign = {
      ...design,
      pressureThreads: [
        {
          ...design.pressureThreads[0],
          threadId: "romance-thread",
          category: "romance" as const,
          episodeWindow: { startEpisode: 1, endEpisode: 3 },
        },
      ],
      romanceProgression: [
        {
          ...design.romanceProgression[0],
          phase: "commitment" as const,
          episodeWindow: { startEpisode: 1, endEpisode: 3 },
        },
      ],
    };
    const result = inspectVerticalDramaStoryControlConsistency({
      storyDesign: romanceDesign,
      storyArchitecture: architecture,
      targetEpisodeCount: 50,
    });
    expect(result.issues.some(issue => issue.code === "romance_window_mismatch")).toBe(
      true,
    );
  });

  it("repairs placeholders, duplicate ids, and mirrors the story-control seed", () => {
    const invalid = {
      ...design,
      pressureThreads: [
        { ...design.pressureThreads[0], threadId: "same" },
        { ...design.pressureThreads[0], threadId: "same", label: "TBD" },
      ],
      advantageBeats: [
        { ...design.advantageBeats[0], cost: "placeholder" },
        { ...design.advantageBeats[0], cost: "placeholder" },
      ],
    };
    const repaired = repairVerticalDramaDraftStoryDesign({
      storyDesign: invalid,
      targetEpisodeCount: 8,
      characterNames: ["lead", "rival"],
    });
    expect(repaired?.pressureThreads.map(thread => thread.threadId)).toEqual([
      "same",
      "same-2",
    ]);
    expect(repaired?.advantageBeats).toHaveLength(2);
    expect(
      repaired?.advantageBeats.filter(beat => beat.episodeNumber === 2),
    ).toHaveLength(1);
    expect(repaired?.advantageBeats[0].cost).not.toMatch(/placeholder/i);
    expect(repaired?.advantageBeats[0]).toHaveProperty("legacyPlaceholderText");
    expect(repaired?.storyControlSeed?.advantageIntent).toHaveLength(
      repaired?.advantageBeats.length,
    );
  });

  it("moves terminal large-project claims out of early advantage beats", () => {
    const invalid = {
      ...design,
      advantageBeats: [
        {
          ...design.advantageBeats[0],
          episodeNumber: 8,
          purpose: "Deploy the large structure in the major project.",
        },
      ],
    };
    const repaired = repairVerticalDramaDraftStoryDesign({
      storyDesign: invalid,
      targetEpisodeCount: 50,
    });
    expect(repaired?.advantageBeats[0].purpose).toContain(
      "bounded prototype",
    );
    expect(repaired?.advantageBeats[0]).toHaveProperty(
      "supersededLegacyMetadata.superseded",
      true,
    );
    const inspection = inspectVerticalDramaStoryControlConsistency({
      storyDesign: repaired,
      targetEpisodeCount: 50,
    });
    expect(
      inspection.issues.some(issue => issue.code === "terminal_advantage_timing"),
    ).toBe(false);
  });
});
