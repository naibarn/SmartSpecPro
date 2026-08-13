import { z } from "zod";
import {
  advantageBeatPlanSchema,
  readVerticalDramaStoryControlSeed,
  romancePhasePlanSchema,
  storyControlSeedSchema,
  type VerticalDramaStoryControlSeed,
} from "./storyControl";
import {
  readVerticalDramaStoryArchitecture,
  type VerticalDramaStoryArchitectureContract,
} from "./storyArchitecture";

const draftEpisodeWindowSchema = z
  .object({
    startEpisode: z.number().int().positive(),
    endEpisode: z.number().int().positive(),
  })
  .passthrough()
  .refine(value => value.endEpisode >= value.startEpisode, {
    message: "endEpisode must be greater than or equal to startEpisode",
  });

const draftPressureThreadSchema = z
  .object({
    threadId: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(500),
    category: z.enum([
      "romance",
      "external_goal",
      "family",
      "career_or_school",
      "financial",
      "secret",
      "social",
      "other",
    ]),
    episodeWindow: draftEpisodeWindowSchema,
  })
  .passthrough();

const earlyPayoffSchema = z
  .object({
    promise: z.string().trim().min(1).max(500),
    episodeWindow: draftEpisodeWindowSchema,
    evidence: z.string().trim().min(1).max(500),
  })
  .passthrough();

export const verticalDramaDraftStoryDesignSchema = z
  .object({
    contractVersion: z.literal(1).optional(),
    primaryEngine: z.string().trim().min(1).max(300),
    secondaryEngines: z.array(z.string().trim().min(1).max(180)).max(8),
    pressureThreads: z.array(draftPressureThreadSchema).max(12),
    earlyPayoff: earlyPayoffSchema,
    romanceProgression: z.array(romancePhasePlanSchema).max(20),
    advantageBeats: z.array(advantageBeatPlanSchema).max(40),
    conflictGuardrails: z.array(z.string().trim().min(1).max(300)).max(12),
    storyControlSeed: storyControlSeedSchema.optional(),
  })
  .passthrough();

export type VerticalDramaDraftStoryDesign = z.infer<
  typeof verticalDramaDraftStoryDesignSchema
>;

export function readVerticalDramaDraftStoryDesign(
  value: unknown
): VerticalDramaDraftStoryDesign | null {
  const parsed = verticalDramaDraftStoryDesignSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function boundedEpisodeWindow(
  startEpisode: number | undefined,
  endEpisode: number | undefined,
  totalEpisodeCount: number
): { startEpisode: number; endEpisode: number } {
  const start = Math.max(1, Math.min(totalEpisodeCount, startEpisode ?? 1));
  const end = Math.max(start, Math.min(totalEpisodeCount, endEpisode ?? start));
  return { startEpisode: start, endEpisode: end };
}

function designThreadCategory(
  id: VerticalDramaStoryArchitectureContract["arcBundles"][number]["id"]
): z.infer<typeof draftPressureThreadSchema>["category"] {
  if (id === "romance") return "romance";
  if (id === "family") return "family";
  if (id === "mystery") return "secret";
  if (id === "survival" || id === "revenge") return "external_goal";
  if (id === "underdog_identity") return "social";
  if (id === "academic" || id === "professional_innovation") {
    return "career_or_school";
  }
  return "other";
}

/**
 * Builds the bounded story-design control plane from an already validated
 * Story Architecture. LLM-authored design remains authoritative when valid;
 * this function is the additive safety net for providers that omit or return
 * an empty storyDesign object. It never invents a new destination or arc.
 */
export function buildVerticalDramaDraftStoryDesignFromArchitecture(params: {
  storyArchitecture: unknown;
  characterNames: string[];
  targetEpisodeCount?: number;
}): VerticalDramaDraftStoryDesign | null {
  const architecture = readVerticalDramaStoryArchitecture(
    params.storyArchitecture
  );
  if (!architecture) return null;

  const totalEpisodeCount = Math.max(1, params.targetEpisodeCount ?? 10);
  const characterNames = params.characterNames
    .map(name => name.trim())
    .filter(Boolean);
  const canonicalCharacterKeys = characterNames.length
    ? [...new Set(characterNames)]
    : ["protagonist"];
  const firstPair =
    canonicalCharacterKeys.length >= 2
      ? (canonicalCharacterKeys.slice(0, 2) as [string, string])
      : undefined;
  const pressureThreads = architecture.arcBundles.slice(0, 12).map(arc => {
    const window = boundedEpisodeWindow(
      arc.episodeWindow?.startEpisode,
      arc.episodeWindow?.endEpisode,
      totalEpisodeCount
    );
    return {
      threadId: `arc-${arc.id}`,
      label: arc.label,
      description: `${arc.startingState} ${arc.failureOrCost} ${arc.payoff}`,
      category: designThreadCategory(arc.id),
      episodeWindow: window,
    };
  });
  if (pressureThreads.length === 0) {
    pressureThreads.push({
      threadId: "primary-engine",
      label: "Primary story engine",
      description: architecture.primaryEngine.statement,
      category: "external_goal",
      episodeWindow: { startEpisode: 1, endEpisode: totalEpisodeCount },
    });
  }

  const firstPromise = architecture.promisePayoffMap[0];
  const payoffWindow = boundedEpisodeWindow(
    firstPromise?.payoffWindow?.startEpisode ?? 1,
    firstPromise?.payoffWindow?.endEpisode ?? Math.min(2, totalEpisodeCount),
    totalEpisodeCount
  );
  const earlyPayoff = {
    promise: firstPromise?.setup ?? architecture.audiencePromise.genrePromise,
    episodeWindow: payoffWindow,
    evidence: firstPromise?.payoff ?? architecture.destination.seasonEndpoint,
  };

  const escalation = architecture.primaryEngine.escalationLadder;
  const advantageBeats = (
    escalation.length
      ? escalation
      : [
          {
            phase: "primary",
            pressure: architecture.primaryEngine.statement,
            cost:
              architecture.realityFailureModel.lessonsLearned[0] ??
              "The first approach must be tested.",
            turningPoint: architecture.primaryEngine.repeatableEpisodeMechanism,
          },
        ]
  )
    .slice(0, 40)
    .map((step, index) => ({
      episodeNumber: Math.max(
        1,
        Math.min(
          totalEpisodeCount,
          Math.round(
            ((index + 1) * totalEpisodeCount) / (escalation.length + 1)
          )
        )
      ),
      advantagedSide:
        index % 3 === 0
          ? ("protagonist" as const)
          : index % 3 === 1
            ? ("antagonist" as const)
            : ("shared" as const),
      cost: step.cost,
      opponentResponse: step.turningPoint,
      purpose: step.pressure,
    }));

  const romanceArc = architecture.arcBundles.find(arc => arc.id === "romance");
  const romanceWindow = romanceArc
    ? boundedEpisodeWindow(
        romanceArc.episodeWindow?.startEpisode,
        romanceArc.episodeWindow?.endEpisode,
        totalEpisodeCount
      )
    : { startEpisode: 1, endEpisode: totalEpisodeCount };
  const romanceProgression = romanceArc
    ? [
        {
          phase: "friction" as const,
          episodeWindow: boundedEpisodeWindow(
            romanceWindow.startEpisode,
            romanceWindow.startEpisode + 1,
            totalEpisodeCount
          ),
          ...(firstPair ? { pair: firstPair } : {}),
          purpose: romanceArc.startingState,
          allowPause: true,
        },
        {
          phase: "trust_shift" as const,
          episodeWindow: boundedEpisodeWindow(
            romanceWindow.startEpisode + 2,
            romanceWindow.endEpisode - 1,
            totalEpisodeCount
          ),
          ...(firstPair ? { pair: firstPair } : {}),
          purpose: romanceArc.failureOrCost,
          allowPause: true,
        },
        {
          phase: "commitment" as const,
          episodeWindow: romanceWindow,
          ...(firstPair ? { pair: firstPair } : {}),
          purpose: romanceArc.payoff,
          allowPause: true,
        },
      ]
    : [];

  const storyControlSeed = {
    contractVersion: 1 as const,
    premiseAnchor: architecture.premiseAnchor,
    canonicalCharacterKeys,
    threadCandidates: pressureThreads.map(thread => ({
      threadId: thread.threadId,
      label: thread.label,
      scope: "season_thread" as const,
      ownerCharacters: [canonicalCharacterKeys[0]],
      plantEpisode: thread.episodeWindow.startEpisode,
      payoffWindow: thread.episodeWindow,
      expectedEvidence: [thread.description],
      resolutionCost:
        architecture.realityFailureModel.lessonsLearned[0] ??
        "The team must pay a real cost to advance.",
      status: "active" as const,
      openingEvidence: [],
    })),
    romancePhaseSkeleton: romanceProgression,
    advantageIntent: advantageBeats,
  };
  return verticalDramaDraftStoryDesignSchema.parse({
    contractVersion: 1,
    primaryEngine: architecture.primaryEngine.statement,
    secondaryEngines: architecture.arcBundles
      .filter(arc => arc.id !== architecture.requiredArcTypes[0])
      .slice(0, 8)
      .map(arc => arc.label),
    pressureThreads,
    earlyPayoff,
    romanceProgression,
    advantageBeats,
    conflictGuardrails: architecture.storyGuardrails,
    storyControlSeed,
  });
}

export function readDraftStoryControlSeed(
  value: unknown,
  options: { totalEpisodeCount?: number } = {}
): VerticalDramaStoryControlSeed | null {
  if (!value || typeof value !== "object") return null;
  const design = value as { storyControlSeed?: unknown };
  return readVerticalDramaStoryControlSeed(design.storyControlSeed, options);
}

export function buildVerticalDramaDraftStoryDesignPrompt(
  params: {
    targetEpisodeCount?: number;
  } = {}
): string {
  const episodeHint = params.targetEpisodeCount
    ? `The planned season has ${params.targetEpisodeCount} episodes.`
    : "Use the planned episode count from the request.";
  return [
    "STORY DESIGN CONTROL CONTRACT (ADDITIVE, SKILL-OWNED MEANING)",
    "Return storyDesign with one primary story engine, bounded secondary engines, pressureThreads, an earlyPayoff, romanceProgression, advantageBeats, conflictGuardrails, and storyControlSeed.",
    "Keep the primary engine dominant. Do not add a new subplot unless it has an owner, a purpose, a bounded episode window, and a planned payoff or deliberate deferral.",
    "The earlyPayoff must deliver the premise's first visible promise early. Romance progression must move through earned phases and may pause; do not jump from friction to commitment without evidence.",
    "Advantage beats must alternate meaningful advantage and cost between protagonist, antagonist, or shared sides. Do not let one side win repeatedly without an opponent response.",
    "Use stable IDs for every pressure thread and every story-control thread. Use the exact generated character names as storyControlSeed.canonicalCharacterKeys so the runtime can validate every reference. Never create a dangling thread ID.",
    "Conflict should prefer genre-appropriate differences in goals, opportunity, language confidence, systems, and choices; do not make racism or identity harm the default engine unless the creator explicitly asks for it.",
    "Return exact additive shape: storyDesign:{contractVersion:1,primaryEngine,secondaryEngines,pressureThreads:[{threadId,label,description,category,episodeWindow}],earlyPayoff:{promise,episodeWindow,evidence},romanceProgression,advantageBeats,conflictGuardrails,storyControlSeed:{contractVersion:1,premiseAnchor,canonicalCharacterKeys,threadCandidates,romancePhaseSkeleton,advantageIntent}}.",
    episodeHint,
  ].join(" ");
}

export function renderVerticalDramaDraftStoryDesignBlock(
  value: unknown
): string | null {
  const design = readVerticalDramaDraftStoryDesign(value);
  if (!design) return null;
  return [
    "APPROVED STORY DESIGN CONTROL (FACTS, DO NOT REINTERPRET)",
    "The primary engine and bounded pressure threads are the spine. Use storyControlSeed IDs as continuity anchors; the writing skill owns the creative meaning of each beat.",
    JSON.stringify(design),
  ].join("\n");
}
