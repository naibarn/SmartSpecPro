import { describe, expect, it } from "vitest";
import {
  evaluateVerticalDramaStoryArchitecture,
  inferVerticalDramaRequiredArcTypes,
  verticalDramaStoryArchitectureContractSchema,
} from "../storyArchitecture";

const proofOfUsArchitecture = {
  contractVersion: 1,
  premiseAnchor:
    "An Asian mathematics prodigy earns a US scholarship and turns academic rivalry into practical structural innovation.",
  requiredArcTypes: [
    "romance",
    "academic",
    "professional_innovation",
    "underdog_identity",
  ],
  audiencePromise: {
    genrePromise:
      "Young adult campus romance with academic rivalry and an underdog innovation journey.",
    emotionalPromise:
      "The audience watches an overlooked outsider become a trusted creator without losing the love that helped her grow.",
    coreQuestion:
      "Can she turn a talent nobody understands into work the real world can build?",
  },
  protagonistArc: {
    startingState:
      "Brilliant but isolated scholarship student who believes perfect answers are safer than being seen.",
    shortTermGoal: "Keep her scholarship and prove she belongs in the program.",
    internalNeed:
      "Learn to communicate, collaborate, and accept that practical work requires revision.",
    longTermDestination:
      "Develop a multi-constraint structural optimization method used by an engineering team on a major project.",
    transformationStages: [
      {
        phase: "outsider",
        beliefBefore: "Only flawless work can protect her place.",
        change: "She solves the early problem publicly and earns attention.",
        evidence: "Her solution changes how the class sees her.",
      },
      {
        phase: "collaborator",
        beliefBefore: "Her rival only blocks her.",
        change:
          "She works with him and learns communication is part of expertise.",
        evidence: "Their project survives a failed presentation.",
      },
      {
        phase: "builder",
        beliefBefore: "A beautiful equation is enough.",
        change: "She tests, fails, and redesigns with engineers.",
        evidence:
          "A prototype works within material and construction constraints.",
      },
    ],
    endState:
      "She becomes a researcher whose method gives other people a practical way to build safer, more efficient structures.",
  },
  primaryEngine: {
    statement:
      "Each new challenge forces her to translate exceptional mathematical insight into a result that people, institutions, or the physical world can accept.",
    repeatableEpisodeMechanism:
      "A problem, rival pressure, or real-world constraint exposes a gap between what she can calculate and what she can communicate or build.",
    escalationLadder: [
      {
        phase: "campus",
        pressure: "Language and status hide her ability.",
        cost: "She risks being dismissed.",
        turningPoint: "An early proof earns a partnership.",
      },
      {
        phase: "research",
        pressure: "Her model fails in simulation and review.",
        cost: "The scholarship and project reputation are at risk.",
        turningPoint: "She accepts outside expertise and changes the method.",
      },
      {
        phase: "application",
        pressure:
          "A real project tests safety, materials, and construction limits.",
        cost: "A failure can delay a major build and damage trust.",
        turningPoint: "The team uses her revised method on a viable prototype.",
      },
    ],
  },
  arcBundles: [
    {
      id: "romance",
      label: "Rivals to partners to love",
      required: true,
      startingState: "They compete for academic status.",
      turningPoints: ["Public rivalry", "Forced collaboration"],
      failureOrCost: "Love threatens the clean boundaries of competition.",
      payoff: "They choose honest partnership over winning alone.",
      endState: "An equal relationship that supports both ambitions.",
    },
    {
      id: "academic",
      label: "Scholarship and belonging",
      required: true,
      startingState: "She is judged by fluency rather than insight.",
      turningPoints: ["Early proof", "Scholarship review"],
      failureOrCost: "A writing or presentation failure puts funding at risk.",
      payoff: "Her work and communication are both recognized.",
      endState: "She belongs without having to imitate everyone else.",
    },
    {
      id: "professional_innovation",
      label: "From equation to structure",
      required: true,
      startingState: "Her work is theoretical and untested.",
      turningPoints: ["Failed simulation", "Prototype review"],
      failureOrCost:
        "Material, safety, and construction constraints reject elegant answers.",
      payoff: "A team applies the revised method to a major structure.",
      endState: "Her research becomes a practical engineering tool.",
    },
    {
      id: "underdog_identity",
      label: "The outsider claims her voice",
      required: true,
      startingState: "She expects to be overlooked.",
      turningPoints: ["Public proof", "Defending her method"],
      failureOrCost: "Isolation makes her hide mistakes and distrust help.",
      payoff: "She leads by inviting others into the problem.",
      endState: "She creates knowledge that outlives the original competition.",
    },
  ],
  realityFailureModel: {
    realWorldConstraints: [
      "material limits",
      "wind and vibration",
      "construction feasibility",
    ],
    failedAttempts: [
      "The first simulation cannot be built as designed.",
      "The prototype fails under combined loads.",
    ],
    lessonsLearned: [
      "Mathematical elegance must meet safety and construction reality.",
      "Collaboration improves the model.",
    ],
  },
  destination: {
    seasonEndpoint:
      "She keeps the scholarship and earns a research partnership after an academic and romantic turning point.",
    longTermEndpoint:
      "Years later, her structural optimization method helps a team design a large real-world project.",
    horizon: "series",
    finalImage:
      "She stands beside a massive structure under construction, seeing her old equations become steel and concrete.",
    meaning:
      "Learning matters when it lets someone ask and answer questions the textbook never contained.",
  },
  promisePayoffMap: [
    {
      promiseId: "early-math-proof",
      setup: "She solves the problem no one else can solve.",
      payoff: "The method becomes the seed of a practical framework.",
      payoffWindow: { startEpisode: 2, endEpisode: 4 },
    },
    {
      promiseId: "outsider-voice",
      setup: "Her English is mistaken for lack of ability.",
      payoff: "She presents a method that changes a real engineering decision.",
      payoffWindow: { startEpisode: 18, endEpisode: 25 },
    },
  ],
  storyGuardrails: [
    "Do not make racism the sole engine; use language, opportunity, education, and confidence as the main pressures.",
    "Do not end the story at the first classroom victory when the premise promises professional impact.",
  ],
};

describe("vertical drama story architecture contract", () => {
  it("infers the distinct arcs promised by Proof of Us", () => {
    expect(
      inferVerticalDramaRequiredArcTypes({
        genre:
          "Young Adult / Campus Romance / Academic Rivalry / Underdog / Science & Engineering Drama",
        userPremise:
          "A mathematics student develops structural engineering innovation after university.",
      })
    ).toEqual(
      expect.arrayContaining([
        "romance",
        "academic",
        "professional_innovation",
        "underdog_identity",
      ])
    );
  });

  it("passes a complete multi-horizon architecture", () => {
    const parsed = verticalDramaStoryArchitectureContractSchema.parse(
      proofOfUsArchitecture
    );
    const result = evaluateVerticalDramaStoryArchitecture({
      contract: parsed,
      genre:
        "Young Adult / Campus Romance / Academic Rivalry / Underdog / Science & Engineering Drama",
      userPremise:
        "A mathematics student develops structural engineering innovation after university.",
      targetEpisodeCount: 25,
    });
    expect(result.ready).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("blocks a contract that stops at the campus hook", () => {
    const incomplete = {
      ...proofOfUsArchitecture,
      destination: {
        ...proofOfUsArchitecture.destination,
        longTermEndpoint: "",
        finalImage: "",
      },
    };
    const result = evaluateVerticalDramaStoryArchitecture({
      contract: incomplete,
      genre: "academic engineering romance",
      userPremise: "A student will turn mathematics into a real structure.",
    });
    expect(result.ready).toBe(false);
    expect(result.diagnostics.map(item => item.code)).toContain(
      "story_architecture_missing"
    );
  });
});
