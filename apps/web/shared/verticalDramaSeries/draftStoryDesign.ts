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
    totalEpisodeCount: z.number().int().positive().optional(),
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

function sameWindow(
  left: { startEpisode: number; endEpisode: number },
  right: { startEpisode: number; endEpisode: number },
): boolean {
  return (
    left.startEpisode === right.startEpisode &&
    left.endEpisode === right.endEpisode
  );
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
  const hasTerminalThread = pressureThreads.some(
    thread => thread.episodeWindow.endEpisode === totalEpisodeCount
  );
  if (!hasTerminalThread) {
    const terminalThread = {
      threadId: "season-destination",
      label: "Season destination",
      description: `${architecture.destination.seasonEndpoint} ${architecture.destination.longTermEndpoint}`,
      category: "other",
      episodeWindow: {
        startEpisode: Math.max(1, Math.floor(totalEpisodeCount * 0.65)),
        endEpisode: totalEpisodeCount,
      },
    } as const;
    if (pressureThreads.length < 12) pressureThreads.push(terminalThread);
    else pressureThreads[pressureThreads.length - 1] = terminalThread;
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
  if (!advantageBeats.some(beat => beat.episodeNumber === totalEpisodeCount)) {
    const terminalBeat = {
      episodeNumber: totalEpisodeCount,
      advantagedSide: "shared" as const,
      cost:
        architecture.realityFailureModel.lessonsLearned.at(-1) ??
        "The final solution must survive real-world constraints.",
      opponentResponse: architecture.destination.seasonEndpoint,
      purpose: architecture.destination.longTermEndpoint,
    };
    if (advantageBeats.length < 40) advantageBeats.push(terminalBeat);
    else advantageBeats[advantageBeats.length - 1] = terminalBeat;
  }

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
    totalEpisodeCount,
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

/**
 * Additive last-mile repair used immediately before Draft QC. Older drafts can
 * already be marked `ready_for_qc` while their storyDesign predates the
 * terminal-destination rules. Repair only missing structural facts and keep
 * every existing thread/beat intact.
 */
export function repairVerticalDramaDraftStoryDesign(params: {
  storyDesign: unknown;
  storyArchitecture?: unknown;
  targetEpisodeCount?: number;
  characterNames?: string[];
}): VerticalDramaDraftStoryDesign | null {
  const existing = readVerticalDramaDraftStoryDesign(params.storyDesign);
  const architecture = readVerticalDramaStoryArchitecture(
    params.storyArchitecture
  );
  const generated = architecture
    ? buildVerticalDramaDraftStoryDesignFromArchitecture({
        storyArchitecture: architecture,
        characterNames: params.characterNames ?? [],
        targetEpisodeCount: params.targetEpisodeCount,
      })
    : null;
  if (!existing) return generated;

  const totalEpisodeCount =
    params.targetEpisodeCount ?? existing.totalEpisodeCount;
  const destinationText =
    [
      architecture?.destination.seasonEndpoint,
      architecture?.destination.longTermEndpoint,
      existing.primaryEngine,
      existing.earlyPayoff.evidence,
    ]
      .map(value => (typeof value === "string" ? value.trim() : ""))
      .find(Boolean) ??
    "The central story engine reaches a consequential destination.";

  const placeholderPattern =
    /(?:\b(?:tbd|todo|placeholder|to be determined|fill(?: in)? later|insert .* here|lorem ipsum|n\/a)\b|\[\s*(?:tbd|todo|placeholder|insert .* here)\s*\]|<\s*(?:tbd|placeholder|text|value)\s*>|(?:ยังไม่กำหนด|ใส่ภายหลัง|รอเติม|ตัวอย่างข้อความ))/i;
  const repairedPlaceholder = (
    value: string | undefined,
    replacement: string,
  ): { value: string | undefined; legacy?: string } => {
    if (!value || !placeholderPattern.test(value)) return { value };
    return { value: replacement, legacy: value };
  };

  const romanceArc = architecture?.arcBundles.find(arc => arc.id === "romance");
  const architectureRomanceWindow = romanceArc?.episodeWindow
    ? boundedEpisodeWindow(
        romanceArc.episodeWindow.startEpisode,
        romanceArc.episodeWindow.endEpisode,
        totalEpisodeCount ?? romanceArc.episodeWindow.endEpisode,
      )
    : null;
  const hasRomanceControl = Boolean(
    romanceArc ||
      existing.romanceProgression.length > 0 ||
      existing.pressureThreads.some(thread => thread.category === "romance")
  );
  // For a long-form romance, the relationship must visibly progress through
  // the whole season. A short architecture window is retained in the legacy
  // archive, while the active control plane uses deterministic season windows
  // so the final commitment cannot be mistaken for an early payoff.
  const canonicalRomanceWindow =
    hasRomanceControl && totalEpisodeCount != null && totalEpisodeCount >= 20
      ? { startEpisode: 1, endEpisode: totalEpisodeCount }
      : architectureRomanceWindow;

  let pressureThreads = [...existing.pressureThreads];
  const usedThreadIds = new Set<string>();
  pressureThreads = pressureThreads.map((thread, index) => {
    const originalId = thread.threadId;
    let threadId = originalId;
    let suffix = 2;
    while (usedThreadIds.has(threadId.trim().toLocaleLowerCase())) {
      threadId = `${originalId}-${suffix}`;
      suffix += 1;
    }
    usedThreadIds.add(threadId.trim().toLocaleLowerCase());
    const repairedLabel = repairedPlaceholder(
      thread.label,
      `Story-control thread ${index + 1}`,
    );
    const repairedDescription = repairedPlaceholder(
      thread.description,
      destinationText,
    );
    const alignedWindow =
      architectureRomanceWindow &&
      (thread.category === "romance" ||
        thread.threadId.toLocaleLowerCase().includes("romance"))
        ? architectureRomanceWindow
        : thread.episodeWindow;
    return {
      ...thread,
      threadId,
      ...(threadId !== originalId ? { legacyThreadId: originalId } : {}),
      label: repairedLabel.value ?? thread.label,
      description: repairedDescription.value ?? thread.description,
      ...(repairedLabel.legacy || repairedDescription.legacy
        ? {
            legacyPlaceholderText: {
              ...(repairedLabel.legacy ? { label: repairedLabel.legacy } : {}),
              ...(repairedDescription.legacy
                ? { description: repairedDescription.legacy }
                : {}),
            },
          }
        : {}),
      ...(alignedWindow && !sameWindow(alignedWindow, thread.episodeWindow)
        ? { legacyEpisodeWindow: thread.episodeWindow, episodeWindow: alignedWindow }
        : {}),
    };
  });
  if (totalEpisodeCount != null) {
    pressureThreads = pressureThreads.map(thread => ({
      ...thread,
      episodeWindow: boundedEpisodeWindow(
        thread.episodeWindow.startEpisode,
        thread.episodeWindow.endEpisode,
        totalEpisodeCount
      ),
    }));
    const terminalIndex = pressureThreads.findIndex(
      thread => thread.episodeWindow.endEpisode === totalEpisodeCount
    );
    if (terminalIndex < 0) {
      const last = pressureThreads.at(-1);
      const terminal = last
        ? {
            ...last,
            threadId: `${last.threadId}-terminal`,
            label: `${last.label} — season destination`,
            description: `${last.description} Final destination: ${destinationText}`,
            episodeWindow: {
              startEpisode: Math.min(
                totalEpisodeCount,
                Math.max(1, last.episodeWindow.startEpisode)
              ),
              endEpisode: totalEpisodeCount,
            },
          }
        : (generated?.pressureThreads[0] ?? {
            threadId: "season-destination",
            label: "Season destination",
            description: destinationText,
            category: "other" as const,
            episodeWindow: { startEpisode: 1, endEpisode: totalEpisodeCount },
          });
      if (pressureThreads.length < 12) pressureThreads.push(terminal);
      else pressureThreads[pressureThreads.length - 1] = terminal;
    }
  }

  let advantageBeats = [...existing.advantageBeats];
  const shouldExpandLongForm =
    totalEpisodeCount != null && totalEpisodeCount >= 20;
  if (totalEpisodeCount != null) {
    advantageBeats = advantageBeats.map(beat => ({
      ...beat,
      episodeNumber: Math.max(
        1,
        Math.min(totalEpisodeCount, beat.episodeNumber)
      ),
    }));
    const terminalIndex = advantageBeats.findIndex(
      beat => beat.episodeNumber === totalEpisodeCount
    );
    if (terminalIndex < 0) {
      const last = advantageBeats.at(-1);
      const terminal = last
        ? {
            ...last,
            episodeNumber: totalEpisodeCount,
            purpose: `${last.purpose} Final destination: ${destinationText}`,
            opponentResponse: destinationText,
          }
        : (generated?.advantageBeats[0] ?? {
            episodeNumber: totalEpisodeCount,
            advantagedSide: "shared" as const,
            cost: "The final solution must survive real-world constraints.",
            opponentResponse: destinationText,
            purpose: destinationText,
          });
      if (advantageBeats.length < 40) advantageBeats.push(terminal);
      else advantageBeats[advantageBeats.length - 1] = terminal;
    }

    // Make the long-form spine visible to both QC and future episode writers:
    // setup, midpoint, late test, and terminal destination must each have an
    // explicit advantage/cost beat. Existing authored beats are retained.
    const milestones = [
      { episodeNumber: 1, label: "setup" },
      {
        episodeNumber: Math.max(2, Math.round(totalEpisodeCount * 0.25)),
        label: "first escalation",
      },
      {
        episodeNumber: Math.max(2, Math.round(totalEpisodeCount * 0.5)),
        label: "midpoint reversal",
      },
      {
        episodeNumber: Math.max(2, Math.round(totalEpisodeCount * 0.75)),
        label: "late test",
      },
      { episodeNumber: totalEpisodeCount, label: "terminal destination" },
    ];
    for (const milestone of shouldExpandLongForm ? milestones : []) {
      if (
        advantageBeats.some(
          beat => beat.episodeNumber === milestone.episodeNumber
        )
      ) {
        continue;
      }
      if (advantageBeats.length >= 40) break;
      advantageBeats.push({
        episodeNumber: milestone.episodeNumber,
        advantagedSide:
          milestone.label === "terminal destination"
            ? "shared"
            : milestone.episodeNumber % 2 === 0
              ? "antagonist"
              : "protagonist",
        cost: `The ${milestone.label} exposes a concrete cost that cannot be ignored.`,
        opponentResponse: destinationText,
        purpose: `${milestone.label} advances the primary engine toward ${destinationText}`,
      });
    }
  }

  const earlyPayoff =
    totalEpisodeCount != null
      ? {
          ...existing.earlyPayoff,
          episodeWindow: boundedEpisodeWindow(
            existing.earlyPayoff.episodeWindow.startEpisode,
            existing.earlyPayoff.episodeWindow.endEpisode,
            totalEpisodeCount
          ),
        }
      : existing.earlyPayoff;
  const romanceProgression =
      totalEpisodeCount != null
      ? existing.romanceProgression.map(phase => ({
          ...phase,
          episodeWindow: boundedEpisodeWindow(
            phase.episodeWindow.startEpisode,
            phase.episodeWindow.endEpisode,
            totalEpisodeCount
          ),
        }))
      : existing.romanceProgression;

  const repairedRomanceProgression = canonicalRomanceWindow
    ? (() => {
        const phaseWindows = [
          {
            phase: "friction" as const,
            start: canonicalRomanceWindow.startEpisode,
            end: Math.max(
              canonicalRomanceWindow.startEpisode,
              Math.round(canonicalRomanceWindow.endEpisode * 0.16),
            ),
          },
          {
            phase: "trust_shift" as const,
            start: Math.max(
              canonicalRomanceWindow.startEpisode + 1,
              Math.round(canonicalRomanceWindow.endEpisode * 0.18),
            ),
            end: Math.max(
              canonicalRomanceWindow.startEpisode + 1,
              Math.round(canonicalRomanceWindow.endEpisode * 0.68),
            ),
          },
          {
            phase: "rupture" as const,
            start: Math.max(
              canonicalRomanceWindow.startEpisode + 2,
              Math.round(canonicalRomanceWindow.endEpisode * 0.70),
            ),
            end: Math.max(
              canonicalRomanceWindow.startEpisode + 2,
              Math.round(canonicalRomanceWindow.endEpisode * 0.84),
            ),
          },
          {
            phase: "commitment" as const,
            start: Math.max(
              canonicalRomanceWindow.startEpisode + 3,
              Math.round(canonicalRomanceWindow.endEpisode * 0.86),
            ),
            end: canonicalRomanceWindow.endEpisode,
          },
        ];
        const sourceByPhase = new Map(
          [...(generated?.romanceProgression ?? []), ...romanceProgression].map(
            phase => [phase.phase, phase],
          ),
        );
        return phaseWindows.map(definition => {
          const source = sourceByPhase.get(definition.phase);
          const alignedWindow = boundedEpisodeWindow(
            definition.start,
            definition.end,
            canonicalRomanceWindow.endEpisode,
          );
          return {
            ...(source ?? {
              purpose:
                romanceArc?.payoff ??
                "The relationship changes through a visible choice under pressure.",
              allowPause: true,
            }),
            phase: definition.phase,
            episodeWindow: alignedWindow,
            ...(source && !sameWindow(source.episodeWindow, alignedWindow)
              ? { legacyEpisodeWindow: source.episodeWindow }
              : {}),
          };
        });
      })()
    : romanceProgression;

  const dedupedAdvantageBeats: typeof advantageBeats = [];
  for (const beat of advantageBeats) {
    const repairedCost = repairedPlaceholder(
      beat.cost,
      "The approach must survive a concrete real-world constraint.",
    );
    const repairedResponse = repairedPlaceholder(
      beat.opponentResponse,
      destinationText,
    );
    const repairedPurpose = repairedPlaceholder(
      beat.purpose,
      `Advance the story engine toward ${destinationText}`,
    );
    const repairedBeat = {
      ...beat,
      ...(repairedCost.value ? { cost: repairedCost.value } : {}),
      ...(repairedResponse.value
        ? { opponentResponse: repairedResponse.value }
        : {}),
      ...(repairedPurpose.value ? { purpose: repairedPurpose.value } : {}),
      ...(repairedCost.legacy || repairedResponse.legacy || repairedPurpose.legacy
        ? {
            legacyPlaceholderText: {
              ...(repairedCost.legacy ? { cost: repairedCost.legacy } : {}),
              ...(repairedResponse.legacy
                ? { opponentResponse: repairedResponse.legacy }
                : {}),
              ...(repairedPurpose.legacy ? { purpose: repairedPurpose.legacy } : {}),
            },
          }
        : {}),
    };
    const fingerprint = [
      repairedBeat.episodeNumber,
      repairedBeat.advantagedSide,
      repairedBeat.cost.trim().toLocaleLowerCase().replace(/\s+/g, " "),
      repairedBeat.opponentResponse.trim().toLocaleLowerCase().replace(/\s+/g, " "),
      (repairedBeat.purpose ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " "),
    ].join("|");
    const previous = dedupedAdvantageBeats.find(
      candidate =>
        [
          candidate.episodeNumber,
          candidate.advantagedSide,
          candidate.cost.trim().toLocaleLowerCase().replace(/\s+/g, " "),
          candidate.opponentResponse.trim().toLocaleLowerCase().replace(/\s+/g, " "),
          (candidate.purpose ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " "),
        ].join("|") === fingerprint,
    );
    if (previous) {
      const existingLegacy = Array.isArray(
        (previous as Record<string, unknown>).legacyDuplicateBeats,
      )
        ? ((previous as Record<string, unknown>).legacyDuplicateBeats as unknown[])
        : [];
      (previous as Record<string, unknown>).legacyDuplicateBeats = [
        ...existingLegacy,
        beat,
      ];
      continue;
    }
    dedupedAdvantageBeats.push(repairedBeat);
  }
  advantageBeats = dedupedAdvantageBeats;

  if (totalEpisodeCount != null && totalEpisodeCount >= 20) {
    const terminalText = [
      architecture?.destination.seasonEndpoint,
      architecture?.destination.longTermEndpoint,
    ]
      .filter((value): value is string => Boolean(value))
      .map(value => value.trim().toLocaleLowerCase())
      .filter(value => value.length >= 12);
    const terminalOnlyPattern =
      /(large[- ]scale|large structure|major project|full[- ]scale deployment|โครงการขนาดใหญ่|โครงสร้างขนาดใหญ่|นำไปใช้กับโครงการ)/i;
    advantageBeats = advantageBeats.map(beat => {
      if (beat.episodeNumber >= totalEpisodeCount) return beat;
      const text = `${beat.cost} ${beat.opponentResponse} ${beat.purpose ?? ""}`
        .trim()
        .toLocaleLowerCase();
      if (
        !terminalOnlyPattern.test(text) &&
        !terminalText.some(destination => text.includes(destination))
      ) {
        return beat;
      }
      return {
        ...beat,
        cost:
          "The method is tested against a bounded prototype constraint before the final season decision.",
        opponentResponse:
          "The team must reproduce the result under controlled conditions and document the remaining risk.",
        purpose:
          "Advance from a bounded prototype while preserving the final season payoff for the last episode window.",
        supersededLegacyMetadata: {
          superseded: true,
          reason: "Terminal-destination language moved to the final episode window.",
          original: {
            cost: beat.cost,
            opponentResponse: beat.opponentResponse,
            purpose: beat.purpose,
          },
        },
      };
    });
  }

  let storyControlSeed = existing.storyControlSeed ?? generated?.storyControlSeed;
  if (storyControlSeed && totalEpisodeCount != null && shouldExpandLongForm) {
    storyControlSeed = {
      ...storyControlSeed,
      threadCandidates: storyControlSeed.threadCandidates.map(thread => ({
        ...thread,
        plantEpisode: Math.max(
          1,
          Math.min(totalEpisodeCount, thread.plantEpisode)
        ),
        payoffWindow: boundedEpisodeWindow(
          thread.payoffWindow.startEpisode,
          thread.payoffWindow.endEpisode,
          totalEpisodeCount
        ),
      })),
      romancePhaseSkeleton: repairedRomanceProgression,
      advantageIntent: advantageBeats,
    };
  }

  if (storyControlSeed) {
    const canonicalCharacterKeys = storyControlSeed.canonicalCharacterKeys.length
      ? storyControlSeed.canonicalCharacterKeys
      : (params.characterNames ?? []).filter(Boolean);
    const existingThreadById = new Map(
      storyControlSeed.threadCandidates.map(thread => [thread.threadId, thread]),
    );
    storyControlSeed = {
      ...storyControlSeed,
      threadCandidates: pressureThreads.map(thread => {
        const existingThread = existingThreadById.get(thread.threadId);
        return {
          ...(existingThread ?? {
            scope: "season_thread" as const,
            ownerCharacters: canonicalCharacterKeys.slice(0, 1),
            resolutionCost: "The story must pay a visible cost to advance.",
            status: "active" as const,
            openingEvidence: [],
          }),
          threadId: thread.threadId,
          label: thread.label,
          plantEpisode: thread.episodeWindow.startEpisode,
          payoffWindow: thread.episodeWindow,
          expectedEvidence: [thread.description],
        };
      }),
      romancePhaseSkeleton: repairedRomanceProgression,
      advantageIntent: advantageBeats,
    };
  }

  const activeControlChanged =
    JSON.stringify(existing.romanceProgression) !==
      JSON.stringify(repairedRomanceProgression) ||
    JSON.stringify(existing.advantageBeats) !== JSON.stringify(advantageBeats);
  const priorLegacyArchive = (existing as Record<string, unknown>)
    .legacyControlArchive;
  const legacyControlArchive = activeControlChanged
    ? {
        ...(priorLegacyArchive && typeof priorLegacyArchive === "object"
          ? (priorLegacyArchive as Record<string, unknown>)
          : {}),
        version: 1,
        superseded: true,
        reason:
          "Retained for audit only; canonical story-control windows and beats below are authoritative.",
        romanceProgression: existing.romanceProgression,
        advantageBeats: existing.advantageBeats,
      }
    : priorLegacyArchive;

  return verticalDramaDraftStoryDesignSchema.parse({
    ...existing,
    ...(totalEpisodeCount != null ? { totalEpisodeCount } : {}),
    earlyPayoff,
    romanceProgression: repairedRomanceProgression,
    pressureThreads:
      pressureThreads.length > 0
        ? pressureThreads
        : (generated?.pressureThreads ?? pressureThreads),
    advantageBeats:
      advantageBeats.length > 0
        ? advantageBeats
        : (generated?.advantageBeats ?? advantageBeats),
    conflictGuardrails:
      existing.conflictGuardrails.length > 0
        ? existing.conflictGuardrails
        : (generated?.conflictGuardrails ?? [
            "Every major solution must carry a visible cost or trade-off.",
          ]),
    storyControlSeed,
    ...(legacyControlArchive ? { legacyControlArchive } : {}),
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
    "Return exact additive shape: storyDesign:{contractVersion:1,totalEpisodeCount,primaryEngine,secondaryEngines,pressureThreads:[{threadId,label,description,category,episodeWindow}],earlyPayoff:{promise,episodeWindow,evidence},romanceProgression,advantageBeats,conflictGuardrails,storyControlSeed:{contractVersion:1,premiseAnchor,canonicalCharacterKeys,threadCandidates,romancePhaseSkeleton,advantageIntent}}.",
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
