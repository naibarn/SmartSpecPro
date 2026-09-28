import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaEpisodeRevisions,
  verticalDramaEpisodes,
  verticalDramaSeries,
  type VerticalDramaEpisodeRow,
} from "../../drizzle/schema";
import {
  appendBreakdownVersion,
  getActiveBreakdown,
  type StoredEpisodeBreakdownItem,
} from "./verticalDramaStoryBible";
import { verticalDramaSeriesMemoryService } from "./verticalDramaSeriesMemory";
import { verticalDramaEpisodePipeline } from "./verticalDramaEpisodePipeline";
import { deductCredits, refundCredits } from "./creditService";
import { sanitizeProviderErrorMessage } from "./llmRouter";
import {
  analyzeVerticalDramaStorySafety,
  isBlockingVerticalDramaStorySafety,
} from "./verticalDramaStorySafety";
import { resolveScriptEpisodeMemory } from "./verticalDramaScriptGeneration";
import {
  normalizeVerticalDramaContinuityTimeline,
  selectPriorVerticalDramaMemories,
  validateVerticalDramaContinuity,
  type VerticalDramaContinuityIssue,
} from "@shared/verticalDramaSeries/storyContinuity";
import type { VdEpisodeMemory } from "@shared/verticalDramaSeries/seriesMemoryState";
import type { StoryboardShotgridOutput } from "./verticalDramaStoryboardGeneration";
import type { ScriptBuilderOutput } from "./verticalDramaScriptGeneration";
import type { VerticalDramaStoryJobProgress } from "./verticalDramaStoryJobs";
import { recordVerticalDramaEpisodeRepairAttempt } from "./verticalDramaEpisodeRepairAttempts";

export type VerticalDramaEpisodeRepairOwner = {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
};

export type VerticalDramaEpisodeRepairInput =
  VerticalDramaEpisodeRepairOwner & {
    jobId?: string;
    revisionId: number;
    sourceUpdatedAt: string;
    reason?: string;
  };

type RepairContext = {
  sourceFingerprint: string;
  memoryBundle: unknown;
  previousEpisode: Record<string, unknown> | null;
  futureConstraint: Record<string, unknown> | null;
  currentBreakdownItem: StoredEpisodeBreakdownItem | null;
  safety: ReturnType<typeof analyzeVerticalDramaStorySafety>;
  priorMemories: VdEpisodeMemory[];
};

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function iso(value: Date | string | null | undefined): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function compactText(value: unknown, max = 1400): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

const SAFE_REPAIR_REFERENCE_PLACEHOLDER =
  "Neutral continuity reference: preserve this beat's narrative purpose, character relationship, and unresolved clue without repeating sensitive details. Keep all family members in an ordinary, calm, safe care context.";

const SAFE_REPAIR_REFERENCE_KEYS = new Set([
  "episode_number",
  "episode_title",
  "title",
  "shot_number",
  "scene",
  "location",
  "location_key",
]);

/**
 * The current episode is intentionally used as continuity material, but a
 * policy-blocked source must not be copied verbatim into every retry prompt.
 * Sanitize each story unit independently so safe beats, names, locations,
 * and ordering survive while a risky beat becomes a neutral plot-purpose
 * reference. This is prompt-input hygiene only; the persisted episode is
 * never changed by this function.
 */
export function sanitizeEpisodeRepairReferenceForSkill(
  value: unknown,
  depth = 0
): unknown {
  if (depth > 8) return SAFE_REPAIR_REFERENCE_PLACEHOLDER;
  if (typeof value === "string") {
    return analyzeVerticalDramaStorySafety(value).level === "high"
      ? SAFE_REPAIR_REFERENCE_PLACEHOLDER
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(item =>
      sanitizeEpisodeRepairReferenceForSkill(item, depth + 1)
    );
  }
  if (!value || typeof value !== "object") return value;

  const sanitized = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sanitizeEpisodeRepairReferenceForSkill(item, depth + 1),
    ])
  );
  if (analyzeVerticalDramaStorySafety(sanitized).level !== "high") {
    return sanitized;
  }

  return {
    ...Object.fromEntries(
      Object.entries(sanitized).filter(([key]) =>
        SAFE_REPAIR_REFERENCE_KEYS.has(key)
      )
    ),
    continuity_role: SAFE_REPAIR_REFERENCE_PLACEHOLDER,
  };
}

function readStoredEpisodeMemories(raw: unknown): VdEpisodeMemory[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const episodes = (raw as { episodes?: unknown }).episodes;
  if (!Array.isArray(episodes)) return [];
  return episodes.filter((episode): episode is VdEpisodeMemory => {
    if (!episode || typeof episode !== "object" || Array.isArray(episode)) {
      return false;
    }
    const value = episode as Record<string, unknown>;
    return (
      typeof value.episodeNumber === "number" &&
      typeof value.recap === "string" &&
      Array.isArray(value.threadsOpened) &&
      Array.isArray(value.threadsResolved)
    );
  });
}

function readEpisodeSummary(
  episode: VerticalDramaEpisodeRow | null
): Record<string, unknown> | null {
  if (!episode) return null;
  const script = (episode.script as Record<string, unknown> | null) ?? {};
  const summary = Array.isArray(script.scene_dialogue_summary)
    ? script.scene_dialogue_summary.slice(0, 9).map(item => {
        const row = item as Record<string, unknown>;
        return {
          scene: row.scene,
          location: compactText(row.location, 240),
          summary: compactText(row.summary, 700),
          key_line: compactText(row.key_line ?? row.dialogue_line, 400),
        };
      })
    : [];
  return {
    episode_number: episode.episodeNumber,
    title: compactText(episode.title, 200),
    hook: compactText(script.hook, 700),
    scene_dialogue_summary: summary,
    cliffhanger: compactText(script.cliffhanger, 700),
  };
}

function buildFutureConstraint(
  nextEpisode: VerticalDramaEpisodeRow | null,
  nextItem: StoredEpisodeBreakdownItem | null
): Record<string, unknown> | null {
  if (!nextEpisode && !nextItem) return null;
  const nextSummary = readEpisodeSummary(nextEpisode);
  return {
    label: "FUTURE_EPISODE_CONSTRAINT_ONLY",
    instruction:
      "Use this only to make the repaired episode lead naturally into the next episode. Do not reveal future facts early and do not place future knowledge in episode memory.",
    episode_number: nextEpisode?.episodeNumber ?? nextItem?.episodeNumber,
    working_title: compactText(nextItem?.workingTitle, 240),
    logline: compactText(nextItem?.logline, 900),
    key_beats: Array.isArray(nextItem?.keyBeats)
      ? nextItem.keyBeats.slice(0, 6).map(value => compactText(value, 500))
      : [],
    cliffhanger_line: compactText(nextItem?.cliffhanger_line, 700),
    next_episode_summary: nextSummary,
  };
}

function buildRepairInstruction(
  targetEpisodeNumber: number,
  context: RepairContext,
  reason?: string
): string {
  const safePreviousEpisode = sanitizeEpisodeRepairReferenceForSkill(
    context.previousEpisode ?? {}
  );
  const safeFutureConstraint = sanitizeEpisodeRepairReferenceForSkill(
    context.futureConstraint ?? {}
  );
  return [
    `FULL REBUILD ONE EPISODE ONLY: episode ${targetEpisodeNumber}. Return a complete replacement script, not a patch and not a new unrelated story.`,
    "Use the current episode as continuity source material, then rewrite the synopsis/story movement, every spoken dialogue line, and scene progression so all nine shots form one coherent safer mini-episode. Preserve canonical character identity, established facts, relationships, setting, and the episode's consequences for the next episode.",
    "Use prior context for continuity. Use the future episode only as a bounded setup constraint; never leak future knowledge into what characters know in the repaired episode.",
    "Reduce policy-sensitive contexts by changing the dramatic mechanism, not the story identity. Keep children fully clothed and safe; avoid combining child distress, threat, surveillance, helplessness, medical detail, or secret photography in one scene. Preserve dramatic purpose through neutral adult reaction, objects, and unanswered questions.",
    reason
      ? `User-reported repair reason: ${reason.slice(0, 800)}`
      : "Repair reason: provider policy refusal during media generation.",
    `PREVIOUS_EPISODE_CONTEXT: ${JSON.stringify(safePreviousEpisode)}`,
    `FUTURE_EPISODE_CONSTRAINT: ${JSON.stringify(safeFutureConstraint)}`,
  ].join("\n\n");
}

function isPolicySafetyFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return (
    code === "VD_STORY_POLICY_RISK" ||
    /high-risk policy context/i.test(error.message)
  );
}

function isEpisodeRebuildRetryableFailure(error: unknown): boolean {
  if (isPolicySafetyFailure(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return (
    code === "VD_SCHEMA_VALIDATION_FAILED" ||
    code === "VD_DIALOGUE_EPISODE_UNDERFILLED" ||
    code === "VD_JSON_PARSE_FAILED"
  );
}

function buildPolicyRetryInstruction(instruction: string): string {
  return [
    instruction,
    "FINAL SAFETY RETRY: Replace every risky story element with a neutral adult-centered dramatic alternative.",
    "Do not place a child or minor in danger, distress, surveillance, medical fear, coercion, abuse, or helplessness. Do not describe sexual, nude, graphic injury, or explicit violence content.",
    "The returned script and all nine shots must be policy-safe on their own; do not repeat the unsafe source wording just to preserve the old scene.",
  ].join("\n\n");
}

function buildStructuralRetryInstruction(
  instruction: string,
  issue: "continuity" | "shots" | "schema"
): string {
  const issueInstruction =
    issue === "continuity"
      ? "CONTINUITY RETRY: preserve the prior episode's established facts and relationship state, and hand off only the bounded setup required by the next episode. Do not invent a contradiction or reveal future knowledge."
      : issue === "shots"
        ? "SHOT CONTRACT RETRY: return exactly nine complete shots numbered 1 through 9, with the new script's scene beats and dialogue represented across the full shotgrid."
        : "SCHEMA RETRY: return the complete required script and storyboard JSON objects, with every required field populated and no partial result.";
  return [instruction, issueInstruction].join("\n\n");
}

/** Policy retries are candidate-only calls; credits are deferred until the
 * complete script + storyboard passes all gates and is ready to promote. */
export const VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS = 5;

type EpisodeRepairDiagnostics = {
  mode: "skill_first_full_episode_rebuild";
  skills: [
    "vertical-drama-script-builder",
    "vertical-drama-storyboard-shotgrid",
  ];
  skillCallCounts: {
    script: number;
    storyboard: number;
  };
  contextLoaded: {
    previousEpisode: boolean;
    memory: boolean;
    nextEpisode: boolean;
  };
  attempts: number;
  maxAttempts: number;
  lastStage:
    | "reading"
    | "script"
    | "storyboard"
    | "safety_gate"
    | "continuity_gate"
    | "shot_contract";
  lastOutcome: "running" | "retrying" | "failed" | "needs_review" | "promoted";
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastSafetyFindingCodes?: string[];
  lastContinuityIssueCount?: number;
};

function buildReplacementBreakdownItem(
  episodeNumber: number,
  existing: StoredEpisodeBreakdownItem | null,
  script: ScriptBuilderOutput,
  storyboard: StoryboardShotgridOutput
): StoredEpisodeBreakdownItem {
  const summaries = Array.isArray(script.scene_dialogue_summary)
    ? script.scene_dialogue_summary
        .map(item =>
          compactText((item as Record<string, unknown>).summary, 600)
        )
        .filter(Boolean)
    : [];
  const beats = Array.isArray(script.structure?.beats)
    ? script.structure.beats
        .map(item =>
          compactText((item as Record<string, unknown>).description, 500)
        )
        .filter(Boolean)
    : [];
  const shotDrafts = storyboard.shots.map(shot => {
    const rawShot = shot as Record<string, unknown>;
    const dialogueExcerpt = compactText(rawShot.dialogue_excerpt, 400);
    return {
      shot_number: shot.shot_number,
      summary: compactText(
        shot.visual_description ?? rawShot.action ?? shot.narrative_purpose,
        700
      ),
      characters: shot.characters.map(character => ({
        name: character,
        emotion: compactText(rawShot.emotion, 120),
      })),
      location_key: compactText(rawShot.location, 120) || "episode-location",
      dialogue_lines: dialogueExcerpt
        ? [
            {
              speaker: shot.characters[0] ?? "narrator",
              line: dialogueExcerpt,
              delivery: "natural spoken delivery",
            },
          ]
        : [],
    };
  });
  return {
    ...(existing ?? {}),
    episodeNumber,
    workingTitle: script.episode_title,
    logline: script.hook,
    keyBeats: (summaries.length > 0 ? summaries : beats).slice(0, 6),
    shotDrafts,
    cliffhanger_line: script.cliffhanger,
  } as StoredEpisodeBreakdownItem;
}

async function loadRepairContext(
  owner: VerticalDramaEpisodeRepairOwner,
  episode: VerticalDramaEpisodeRow
): Promise<RepairContext> {
  const [series] = await db
    .select({
      bible: verticalDramaSeries.bible,
      memory: verticalDramaSeries.memory,
    })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId)
      )
    )
    .limit(1);
  if (!series) throw new Error("vertical_drama_series_not_found");
  const bible = (series.bible as Record<string, unknown> | null) ?? {};
  const activeItems = getActiveBreakdown(bible);
  const currentBreakdownItem =
    activeItems.find(item => item.episodeNumber === episode.episodeNumber) ??
    null;
  const nextItem =
    activeItems.find(
      item => item.episodeNumber === episode.episodeNumber + 1
    ) ?? null;
  const [previousEpisode] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
        eq(verticalDramaEpisodes.episodeNumber, episode.episodeNumber - 1)
      )
    )
    .limit(1);
  const [nextEpisode] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
        eq(verticalDramaEpisodes.episodeNumber, episode.episodeNumber + 1)
      )
    )
    .limit(1);
  const memoryBundle =
    await verticalDramaSeriesMemoryService.buildEpisodeMemoryBundle(
      {
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
      },
      episode.episodeNumber
    );
  const previousSummary = readEpisodeSummary(previousEpisode ?? null);
  const futureConstraint = buildFutureConstraint(nextEpisode ?? null, nextItem);
  const safety = analyzeVerticalDramaStorySafety({
    current_script: episode.script,
    current_storyboard: episode.storyboard,
    breakdown: currentBreakdownItem,
  });
  return {
    sourceFingerprint: fingerprint({
      updatedAt: iso(episode.updatedAt),
      script: episode.script,
      storyboard: episode.storyboard,
      breakdown: currentBreakdownItem,
    }),
    memoryBundle,
    previousEpisode: previousSummary,
    futureConstraint,
    currentBreakdownItem,
    safety,
    priorMemories: selectPriorVerticalDramaMemories(
      readStoredEpisodeMemories(series.memory),
      episode.episodeNumber
    ),
  };
}

function validateRepairContinuity(
  context: RepairContext,
  script: ScriptBuilderOutput,
  episodeNumber: number
): VerticalDramaContinuityIssue[] {
  const candidateMemory = resolveScriptEpisodeMemory(script, episodeNumber);
  const normalized = normalizeVerticalDramaContinuityTimeline([
    ...context.priorMemories,
    candidateMemory,
  ]);
  return validateVerticalDramaContinuity({
    episodes: normalized.episodes,
    currentEpisodeNumber: episodeNumber,
  }).issues;
}

export async function runVerticalDramaEpisodeRepairJob(
  input: VerticalDramaEpisodeRepairInput,
  onProgress?: (progress: VerticalDramaStoryJobProgress) => void
): Promise<Record<string, unknown>> {
  const owner: VerticalDramaEpisodeRepairOwner = input;
  const [revision] = await db
    .select()
    .from(verticalDramaEpisodeRevisions)
    .where(
      and(
        eq(verticalDramaEpisodeRevisions.id, input.revisionId),
        eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
        eq(verticalDramaEpisodeRevisions.userId, owner.userId),
        eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
        eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
      )
    )
    .limit(1);
  if (!revision) throw new Error("vertical_drama_episode_revision_not_found");
  const [episode] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    )
    .limit(1);
  if (!episode) throw new Error("vertical_drama_episode_not_found");
  if (iso(episode.updatedAt) !== input.sourceUpdatedAt) {
    await db
      .update(verticalDramaEpisodeRevisions)
      .set({
        status: "failed",
        errorCode: "VD_EPISODE_REPAIR_STALE_SOURCE",
        errorMessage: "The episode changed after repair was requested.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodeRevisions.id, revision.id),
          eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRevisions.userId, owner.userId),
          eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
        )
      );
    throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
  }
  await db
    .update(verticalDramaEpisodeRevisions)
    .set({ status: "running", updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaEpisodeRevisions.id, revision.id),
        eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
        eq(verticalDramaEpisodeRevisions.userId, owner.userId),
        eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
        eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
      )
    );
  onProgress?.({
    phase: "reading",
    episodeIndex: 1,
    episodeCount: 1,
    callsDone: 0,
  });

  let revisionNeedsReview = false;
  let chargedCreditAmount = 0;
  let revisionPromoted = false;
  let attemptsUsed = 0;
  let repairDiagnostics: EpisodeRepairDiagnostics = {
    mode: "skill_first_full_episode_rebuild",
    skills: [
      "vertical-drama-script-builder",
      "vertical-drama-storyboard-shotgrid",
    ],
    skillCallCounts: { script: 0, storyboard: 0 },
    contextLoaded: {
      previousEpisode: false,
      memory: false,
      nextEpisode: false,
    },
    attempts: 0,
    maxAttempts: VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS,
    lastStage: "reading",
    lastOutcome: "running",
  };
  let reviewContextSummary: Record<string, unknown> | null = null;
  const persistRepairDiagnostics = async () => {
    await db
      .update(verticalDramaEpisodeRevisions)
      .set({
        contextSummary: reviewContextSummary
          ? { ...reviewContextSummary, repairDiagnostics }
          : repairDiagnostics,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodeRevisions.id, revision.id),
          eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRevisions.userId, owner.userId),
          eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
        )
      )
      .catch(() => {});
  };
  try {
    const context = await loadRepairContext(owner, episode);
    repairDiagnostics = {
      ...repairDiagnostics,
      contextLoaded: {
        previousEpisode: context.previousEpisode !== null,
        memory:
          context.memoryBundle !== null && context.memoryBundle !== undefined,
        nextEpisode: context.futureConstraint !== null,
      },
    };
    await persistRepairDiagnostics();
    if (revision.sourceFingerprint !== context.sourceFingerprint) {
      throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
    }
    const repairInstruction = buildRepairInstruction(
      episode.episodeNumber,
      context,
      input.reason
    );
    onProgress?.({
      phase: "draft",
      episodeIndex: 1,
      episodeCount: 1,
      callsDone: 0,
    });
    let candidateInstruction = repairInstruction;
    let candidate: Awaited<
      ReturnType<
        typeof verticalDramaEpisodePipeline.generateEpisodeRepairCandidate
      >
    > | null = null;
    let candidateSafety: ReturnType<
      typeof analyzeVerticalDramaStorySafety
    > | null = null;
    let candidateContinuityIssues: VerticalDramaContinuityIssue[] = [];
    let candidateShotContractValid = false;
    let lastCompleteCandidate: Awaited<
      ReturnType<
        typeof verticalDramaEpisodePipeline.generateEpisodeRepairCandidate
      >
    > | null = null;
    let lastCompleteCandidateSafety: ReturnType<
      typeof analyzeVerticalDramaStorySafety
    > | null = null;
    let lastCompleteCandidateContinuityIssues: VerticalDramaContinuityIssue[] =
      [];
    let lastCompleteCandidateShotContractValid = false;
    let lastCompleteCandidateAttempt = 0;

    const persistCandidateForReview = async (
      reviewCandidate: NonNullable<typeof lastCompleteCandidate>,
      reviewSafety: ReturnType<typeof analyzeVerticalDramaStorySafety>,
      reviewContinuityIssues: VerticalDramaContinuityIssue[],
      reviewShotContractValid: boolean,
      errorCode: string,
      errorMessage: string
    ) => {
      revisionNeedsReview = true;
      reviewContextSummary = {
        ...repairDiagnostics,
        candidateAttempt: lastCompleteCandidateAttempt,
        creditsUsed: reviewCandidate.creditsUsed,
        creditCharges: reviewCandidate.creditCharges,
      };
      await db
        .update(verticalDramaEpisodeRevisions)
        .set({
          status: "needs_review",
          script: reviewCandidate.script,
          storyboard: reviewCandidate.storyboard,
          safetyFindings: {
            ...reviewSafety,
            continuityIssues: reviewContinuityIssues,
            shotContractValid: reviewShotContractValid,
            candidateAttempt: lastCompleteCandidateAttempt,
          },
          contextSummary: reviewContextSummary,
          errorCode,
          errorMessage,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.id, revision.id),
            eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
            eq(verticalDramaEpisodeRevisions.userId, owner.userId),
            eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
            eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
          )
        );
    };
    for (
      let attempt = 0;
      attempt < VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS;
      attempt += 1
    ) {
      attemptsUsed = attempt + 1;
      repairDiagnostics = {
        ...repairDiagnostics,
        attempts: attemptsUsed,
        lastStage: "script",
        lastOutcome: "running",
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
        lastSafetyFindingCodes: undefined,
        lastContinuityIssueCount: undefined,
      };
      await persistRepairDiagnostics();
      try {
        const skillEpisode = {
          ...episode,
          script: sanitizeEpisodeRepairReferenceForSkill(episode.script),
          storyboard: sanitizeEpisodeRepairReferenceForSkill(
            episode.storyboard
          ),
        } as VerticalDramaEpisodeRow;
        const recordPlanningAttempt = async (
          stage: "script" | "storyboard",
          event: Parameters<
            typeof recordVerticalDramaEpisodeRepairAttempt
          >[0]["event"]
        ) => {
          repairDiagnostics = {
            ...repairDiagnostics,
            skillCallCounts: {
              ...repairDiagnostics.skillCallCounts,
              [stage]: repairDiagnostics.skillCallCounts[stage] + 1,
            },
          };
          await recordVerticalDramaEpisodeRepairAttempt({
            tenantId: owner.tenantId,
            userId: owner.userId,
            seriesId: owner.seriesId,
            episodeId: owner.episodeId,
            revisionId: revision.id,
            jobId: input.jobId ?? revision.jobId,
            attemptNumber: attemptsUsed,
            stage,
            skillSlug:
              stage === "script"
                ? "vertical-drama-script-builder"
                : "vertical-drama-storyboard-shotgrid",
            event,
            safetyFindings: event.parsedOutput
              ? analyzeVerticalDramaStorySafety(event.parsedOutput)
              : undefined,
          });
        };
        candidate =
          await verticalDramaEpisodePipeline.generateEpisodeRepairCandidate(
            owner,
            skillEpisode,
            candidateInstruction,
            context.safety.instruction,
            {
              previousEpisodeContext: sanitizeEpisodeRepairReferenceForSkill(
                context.previousEpisode
              ),
              futureEpisodeConstraint: sanitizeEpisodeRepairReferenceForSkill(
                context.futureConstraint
              ),
            },
            recordPlanningAttempt
          );
        candidateSafety = analyzeVerticalDramaStorySafety(candidate);
        lastCompleteCandidate = candidate;
        lastCompleteCandidateSafety = candidateSafety;
        lastCompleteCandidateAttempt = attemptsUsed;
        candidateContinuityIssues = validateRepairContinuity(
          context,
          candidate.script,
          episode.episodeNumber
        );
        const candidateShotNumbers = candidate.storyboard.shots.map(
          shot => shot.shot_number
        );
        candidateShotContractValid =
          candidateShotNumbers.length === 9 &&
          new Set(candidateShotNumbers).size === 9 &&
          candidateShotNumbers.every(
            (shotNumber, index) => shotNumber === index + 1
          );
        lastCompleteCandidateContinuityIssues = candidateContinuityIssues;
        lastCompleteCandidateShotContractValid = candidateShotContractValid;
        repairDiagnostics = {
          ...repairDiagnostics,
          skillCallCounts: repairDiagnostics.skillCallCounts,
        };
        await persistRepairDiagnostics();
      } catch (error) {
        const errorCode = String(
          (error as { code?: unknown } | null)?.code ??
            "VD_EPISODE_REPAIR_FAILED"
        );
        const errorStage = (error as { repairStage?: unknown } | null)
          ?.repairStage;
        const retryable =
          isEpisodeRebuildRetryableFailure(error) &&
          attempt + 1 < VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS;
        repairDiagnostics = {
          ...repairDiagnostics,
          skillCallCounts: repairDiagnostics.skillCallCounts,
          lastStage: errorStage === "storyboard" ? "storyboard" : "script",
          lastOutcome: retryable ? "retrying" : "failed",
          lastErrorCode: errorCode,
          lastErrorMessage: sanitizeProviderErrorMessage(
            error instanceof Error ? error.message : String(error)
          ).slice(0, 300),
          lastSafetyFindingCodes: (
            error as { safety?: { findings?: Array<{ code?: unknown }> } }
          )?.safety?.findings
            ?.map(finding => String(finding.code))
            .slice(0, 10),
        };
        await persistRepairDiagnostics();
        if (
          !isEpisodeRebuildRetryableFailure(error) ||
          attempt + 1 >= VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS
        ) {
          if (lastCompleteCandidate && lastCompleteCandidateSafety) {
            await persistCandidateForReview(
              lastCompleteCandidate,
              lastCompleteCandidateSafety,
              lastCompleteCandidateContinuityIssues,
              lastCompleteCandidateShotContractValid,
              errorCode === "VD_STORY_POLICY_RISK"
                ? "VD_STORY_POLICY_RISK"
                : "VD_EPISODE_REPAIR_CANDIDATE_REVIEW",
              "สร้าง candidate ครบชุดแล้ว แต่ขั้นตอนสุดท้ายยังต้องตรวจสอบก่อนใช้งาน"
            );
          }
          throw error;
        }
        candidateInstruction = isPolicySafetyFailure(error)
          ? buildPolicyRetryInstruction(candidateInstruction)
          : buildStructuralRetryInstruction(candidateInstruction, "schema");
        onProgress?.({
          phase: "draft",
          episodeIndex: 1,
          episodeCount: 1,
          callsDone: attemptsUsed * 2,
          attemptIndex: attempt + 1,
          attemptCount: VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS,
        });
        continue;
      }
      if (
        isBlockingVerticalDramaStorySafety(candidateSafety) &&
        attempt + 1 < VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS
      ) {
        repairDiagnostics = {
          ...repairDiagnostics,
          lastStage: "safety_gate",
          lastOutcome: "retrying",
          lastErrorCode: "VD_STORY_POLICY_RISK",
          lastSafetyFindingCodes: candidateSafety.findings.map(
            finding => finding.code
          ),
        };
        await persistRepairDiagnostics();
        candidateInstruction =
          buildPolicyRetryInstruction(candidateInstruction);
        onProgress?.({
          phase: "draft",
          episodeIndex: 1,
          episodeCount: 1,
          callsDone: attemptsUsed * 2,
          attemptIndex: attempt + 1,
          attemptCount: VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS,
        });
        continue;
      }

      candidateContinuityIssues = validateRepairContinuity(
        context,
        candidate.script,
        episode.episodeNumber
      );
      const shotNumbers = candidate.storyboard.shots.map(
        shot => shot.shot_number
      );
      candidateShotContractValid =
        shotNumbers.length === 9 &&
        new Set(shotNumbers).size === 9 &&
        shotNumbers.every((shotNumber, index) => shotNumber === index + 1);
      lastCompleteCandidateContinuityIssues = candidateContinuityIssues;
      lastCompleteCandidateShotContractValid = candidateShotContractValid;

      if (
        candidateContinuityIssues.length > 0 &&
        attempt + 1 < VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS
      ) {
        repairDiagnostics = {
          ...repairDiagnostics,
          lastStage: "continuity_gate",
          lastOutcome: "retrying",
          lastErrorCode: "VD_EPISODE_REPAIR_CONTINUITY",
          lastContinuityIssueCount: candidateContinuityIssues.length,
        };
        await persistRepairDiagnostics();
        candidateInstruction = buildStructuralRetryInstruction(
          candidateInstruction,
          "continuity"
        );
        onProgress?.({
          phase: "draft",
          episodeIndex: 1,
          episodeCount: 1,
          callsDone: attemptsUsed * 2,
          attemptIndex: attempt + 1,
          attemptCount: VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS,
        });
        continue;
      }
      if (
        !candidateShotContractValid &&
        attempt + 1 < VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS
      ) {
        repairDiagnostics = {
          ...repairDiagnostics,
          lastStage: "shot_contract",
          lastOutcome: "retrying",
          lastErrorCode: "VD_REPAIR_STORYBOARD_CONTRACT",
        };
        await persistRepairDiagnostics();
        candidateInstruction = buildStructuralRetryInstruction(
          candidateInstruction,
          "shots"
        );
        onProgress?.({
          phase: "draft",
          episodeIndex: 1,
          episodeCount: 1,
          callsDone: attemptsUsed * 2,
          attemptIndex: attempt + 1,
          attemptCount: VERTICAL_DRAMA_EPISODE_REBUILD_MAX_ATTEMPTS,
        });
        continue;
      }
      if (!isBlockingVerticalDramaStorySafety(candidateSafety)) break;
    }
    candidate = lastCompleteCandidate ?? candidate;
    candidateSafety = lastCompleteCandidateSafety ?? candidateSafety;
    candidateContinuityIssues = lastCompleteCandidateContinuityIssues;
    candidateShotContractValid = lastCompleteCandidateShotContractValid;
    if (!candidate || !candidateSafety) {
      throw new Error("VD_EPISODE_REPAIR_FAILED");
    }
    if (isBlockingVerticalDramaStorySafety(candidateSafety)) {
      await persistCandidateForReview(
        candidate,
        candidateSafety,
        candidateContinuityIssues,
        candidateShotContractValid,
        "VD_STORY_POLICY_RISK",
        "Candidate ต้องตรวจสอบจุดเสี่ยงก่อนใช้งาน"
      );
      const error = new Error("VD_STORY_POLICY_RISK");
      (error as Error & { safety?: unknown }).safety = candidateSafety;
      throw error;
    }
    if (candidateContinuityIssues.length > 0) {
      await persistCandidateForReview(
        candidate,
        candidateSafety,
        candidateContinuityIssues,
        candidateShotContractValid,
        "VD_EPISODE_REPAIR_CONTINUITY",
        "Candidate ต้องตรวจสอบความต่อเนื่องก่อนใช้งาน"
      );
      throw new Error("VD_EPISODE_REPAIR_CONTINUITY");
    }
    const [latestEpisode] = await db
      .select()
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.id, owner.episodeId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
          eq(verticalDramaEpisodes.seriesId, owner.seriesId)
        )
      )
      .limit(1);
    if (!latestEpisode) throw new Error("vertical_drama_episode_not_found");
    const currentFingerprint = (await loadRepairContext(owner, latestEpisode))
      .sourceFingerprint;
    if (currentFingerprint !== context.sourceFingerprint)
      throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
    if (!candidateShotContractValid) {
      throw new Error("VD_REPAIR_STORYBOARD_CONTRACT");
    }
    const deferredCreditAmount = candidate.creditCharges.reduce(
      (total, charge) => total + charge.amount,
      0
    );
    if (deferredCreditAmount > 0) {
      const creditResult = await deductCredits({
        userId: owner.userId,
        tenantId: owner.tenantId,
        amount: deferredCreditAmount,
        description: `Vertical Drama — whole episode repair (episode #${owner.episodeId})`,
        idempotencyKey: `vd-episode-repair:${revision.id}`,
        skillRunId: `vd-episode-repair:${revision.id}`,
        skillSlug: "vertical-drama-episode-repair",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_episode_repair",
          seriesId: owner.seriesId,
          episodeId: owner.episodeId,
          revisionId: revision.id,
          charges: candidate.creditCharges,
        },
      });
      chargedCreditAmount = creditResult.creditsUsed;
    }
    onProgress?.({
      phase: "fix",
      episodeIndex: 1,
      episodeCount: 1,
      callsDone: attemptsUsed * 2,
    });

    const result = await db.transaction(async tx => {
      const [current] = await tx
        .select()
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.id, owner.episodeId),
            eq(verticalDramaEpisodes.tenantId, owner.tenantId),
            eq(verticalDramaEpisodes.userId, owner.userId),
            eq(verticalDramaEpisodes.seriesId, owner.seriesId)
          )
        )
        .limit(1);
      if (!current || iso(current.updatedAt) !== input.sourceUpdatedAt)
        throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
      const [series] = await tx
        .select()
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, owner.seriesId),
            eq(verticalDramaSeries.tenantId, owner.tenantId),
            eq(verticalDramaSeries.userId, owner.userId)
          )
        )
        .limit(1);
      if (!series) throw new Error("vertical_drama_series_not_found");
      const currentBible =
        (series.bible as Record<string, unknown> | null) ?? {};
      const breakdownItem = buildReplacementBreakdownItem(
        episode.episodeNumber,
        context.currentBreakdownItem,
        candidate.script,
        candidate.storyboard
      );
      const activeBreakdownItems = getActiveBreakdown(currentBible);
      const nextBible = appendBreakdownVersion(currentBible, {
        source: "episode_repair",
        items: activeBreakdownItems.some(
          item => item.episodeNumber === episode.episodeNumber
        )
          ? activeBreakdownItems.map(item =>
              item.episodeNumber === episode.episodeNumber
                ? breakdownItem
                : item
            )
          : [...activeBreakdownItems, breakdownItem],
        createdByUserId: owner.userId,
      });
      const [updatedEpisode] = await tx
        .update(verticalDramaEpisodes)
        .set({
          title: candidate.script.episode_title,
          script: candidate.script,
          storyboard: candidate.storyboard,
          startFramePlan: null,
          dialogueAudioPlan: null,
          motionPromptPack: null,
          assemblyManifest: null,
          storyboardReviewId: null,
          coverImage: null,
          textOverlayPlan: null,
          adBannerPlan: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodes.id, owner.episodeId),
            eq(verticalDramaEpisodes.updatedAt, current.updatedAt)
          )
        )
        .returning({ id: verticalDramaEpisodes.id });
      if (!updatedEpisode) throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
      await tx
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaSeries.id, owner.seriesId),
            eq(verticalDramaSeries.tenantId, owner.tenantId),
            eq(verticalDramaSeries.userId, owner.userId)
          )
        );
      const [saved] = await tx
        .update(verticalDramaEpisodeRevisions)
        .set({
          status: "promoted",
          script: candidate.script,
          storyboard: candidate.storyboard,
          safetyFindings: candidateSafety,
          contextSummary: {
            previousEpisode: context.previousEpisode?.episode_number ?? null,
            futureEpisode: context.futureConstraint?.episode_number ?? null,
            memoryFingerprint: fingerprint(context.memoryBundle),
            sourceFingerprint: context.sourceFingerprint,
            creditsUsed: candidate.creditsUsed,
            repairDiagnostics: {
              ...repairDiagnostics,
              attempts: attemptsUsed,
              lastOutcome: "promoted",
            },
          },
          promotedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.id, revision.id),
            eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
            eq(verticalDramaEpisodeRevisions.userId, owner.userId),
            eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
            eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
          )
        )
        .returning({ id: verticalDramaEpisodeRevisions.id });
      return saved;
    });
    revisionPromoted = true;
    onProgress?.({
      phase: "review",
      episodeIndex: 1,
      episodeCount: 1,
      callsDone: attemptsUsed * 2,
      episodesDone: [episode.episodeNumber],
    });
    return {
      revisionId: result.id,
      status: "promoted",
      episodeId: owner.episodeId,
      creditsUsed: candidate.creditsUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safeMessage = message.startsWith("VD_")
      ? message.slice(0, 1000)
      : sanitizeProviderErrorMessage(message).slice(0, 1000);
    repairDiagnostics = {
      ...repairDiagnostics,
      attempts: attemptsUsed,
      lastOutcome: revisionNeedsReview ? "needs_review" : "failed",
      lastErrorCode: message.startsWith("VD_")
        ? message.slice(0, 80)
        : "VD_EPISODE_REPAIR_FAILED",
      lastErrorMessage: safeMessage.slice(0, 300),
    };
    await persistRepairDiagnostics();
    if (!revisionNeedsReview) {
      await db
        .update(verticalDramaEpisodeRevisions)
        .set({
          status: "failed",
          errorCode: message.startsWith("VD_")
            ? message.slice(0, 80)
            : "VD_EPISODE_REPAIR_FAILED",
          errorMessage: safeMessage,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.id, revision.id),
            eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
            eq(verticalDramaEpisodeRevisions.userId, owner.userId),
            eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
            eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
          )
        )
        .catch(() => {});
    }
    if (!revisionPromoted && chargedCreditAmount > 0) {
      await refundCredits({
        userId: owner.userId,
        tenantId: owner.tenantId,
        amount: chargedCreditAmount,
        description: "Vertical Drama — repair did not promote",
        idempotencyKey: `vd-episode-repair:${revision.id}:refund`,
        skillRunId: `vd-episode-repair:${revision.id}`,
        skillSlug: "vertical-drama-episode-repair",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_episode_repair",
          seriesId: owner.seriesId,
          episodeId: owner.episodeId,
          revisionId: revision.id,
          reason: "promotion_failed",
        },
      }).catch(refundError => {
        console.error("[VerticalDrama] repair credit compensation failed", {
          revisionId: revision.id,
          refundError,
        });
      });
    }
    throw error;
  }
}

/**
 * Promote a persisted candidate only after the user explicitly reviews it.
 * This is deliberately separate from the background worker: a review action
 * must re-read the live episode and revision under the owner scope, then use
 * one transaction for the episode, bible, and revision state transition.
 */
export async function promoteVerticalDramaEpisodeRepairRevision(
  owner: VerticalDramaEpisodeRepairOwner,
  revisionId: number
): Promise<{ revisionId: number; status: "promoted"; creditsUsed: number }> {
  const [revision] = await db
    .select()
    .from(verticalDramaEpisodeRevisions)
    .where(
      and(
        eq(verticalDramaEpisodeRevisions.id, revisionId),
        eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
        eq(verticalDramaEpisodeRevisions.userId, owner.userId),
        eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
        eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId)
      )
    )
    .limit(1);
  if (!revision) throw new Error("vertical_drama_episode_revision_not_found");
  if (revision.status === "promoted") {
    return { revisionId: revision.id, status: "promoted", creditsUsed: 0 };
  }
  if (revision.status !== "needs_review") {
    throw new Error("VD_EPISODE_REPAIR_NOT_READY_FOR_REVIEW");
  }

  const [episode] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    )
    .limit(1);
  if (!episode) throw new Error("vertical_drama_episode_not_found");
  const candidateScript = revision.script as ScriptBuilderOutput | null;
  const candidateStoryboard =
    revision.storyboard as StoryboardShotgridOutput | null;
  if (
    !candidateScript ||
    !candidateStoryboard ||
    candidateStoryboard.shots.length !== 9
  ) {
    throw new Error("VD_REPAIR_STORYBOARD_CONTRACT");
  }

  const context = await loadRepairContext(owner, episode);
  if (revision.sourceFingerprint !== context.sourceFingerprint) {
    throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
  }
  const shotNumbers = candidateStoryboard.shots.map(shot => shot.shot_number);
  if (
    shotNumbers.length !== 9 ||
    new Set(shotNumbers).size !== 9 ||
    !shotNumbers.every((shotNumber, index) => shotNumber === index + 1)
  ) {
    throw new Error("VD_REPAIR_STORYBOARD_CONTRACT");
  }

  // Human review is the explicit exception to automatic safety promotion. We
  // still re-run the analyzer and persist the final findings, so downstream
  // media generation can show the same warnings and enforce its own gate.
  const candidateSafety = analyzeVerticalDramaStorySafety({
    script: candidateScript,
    storyboard: candidateStoryboard,
  });
  const continuityIssues = validateRepairContinuity(
    context,
    candidateScript,
    episode.episodeNumber
  );
  const summary =
    revision.contextSummary && typeof revision.contextSummary === "object"
      ? (revision.contextSummary as Record<string, unknown>)
      : {};
  const storedCharges = Array.isArray(summary.creditCharges)
    ? summary.creditCharges.filter(
        (charge): charge is { amount: number } =>
          Boolean(charge) &&
          typeof charge === "object" &&
          typeof (charge as { amount?: unknown }).amount === "number" &&
          Number((charge as { amount: number }).amount) > 0
      )
    : [];
  const creditAmount = storedCharges.reduce(
    (total, charge) => total + charge.amount,
    0
  );
  let chargedCreditAmount = 0;
  try {
    if (creditAmount > 0) {
      const creditResult = await deductCredits({
        userId: owner.userId,
        tenantId: owner.tenantId,
        amount: creditAmount,
        description: `Vertical Drama — reviewed whole episode repair (episode #${episode.episodeNumber})`,
        idempotencyKey: `vd-episode-repair:${revision.id}`,
        skillRunId: `vd-episode-repair:${revision.id}`,
        skillSlug: "vertical-drama-episode-repair",
        sourceType: "skill",
        metadata: {
          feature: "vertical_drama_episode_repair",
          seriesId: owner.seriesId,
          episodeId: owner.episodeId,
          revisionId: revision.id,
          charges: storedCharges,
          reviewedPromotion: true,
        },
      });
      chargedCreditAmount = creditResult.creditsUsed;
    }
    const result = await db.transaction(async tx => {
      const [current] = await tx
        .select()
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.id, owner.episodeId),
            eq(verticalDramaEpisodes.tenantId, owner.tenantId),
            eq(verticalDramaEpisodes.userId, owner.userId),
            eq(verticalDramaEpisodes.seriesId, owner.seriesId)
          )
        )
        .limit(1);
      if (!current || iso(current.updatedAt) !== iso(episode.updatedAt)) {
        throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
      }
      const [series] = await tx
        .select()
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, owner.seriesId),
            eq(verticalDramaSeries.tenantId, owner.tenantId),
            eq(verticalDramaSeries.userId, owner.userId)
          )
        )
        .limit(1);
      if (!series) throw new Error("vertical_drama_series_not_found");
      const currentBible =
        (series.bible as Record<string, unknown> | null) ?? {};
      const breakdownItem = buildReplacementBreakdownItem(
        episode.episodeNumber,
        context.currentBreakdownItem,
        candidateScript,
        candidateStoryboard
      );
      const activeBreakdownItems = getActiveBreakdown(currentBible);
      const nextBible = appendBreakdownVersion(currentBible, {
        source: "episode_repair",
        items: activeBreakdownItems.some(
          item => item.episodeNumber === episode.episodeNumber
        )
          ? activeBreakdownItems.map(item =>
              item.episodeNumber === episode.episodeNumber
                ? breakdownItem
                : item
            )
          : [...activeBreakdownItems, breakdownItem],
        createdByUserId: owner.userId,
      });
      const [updatedEpisode] = await tx
        .update(verticalDramaEpisodes)
        .set({
          title: candidateScript.episode_title,
          script: candidateScript,
          storyboard: candidateStoryboard,
          startFramePlan: null,
          dialogueAudioPlan: null,
          motionPromptPack: null,
          assemblyManifest: null,
          storyboardReviewId: null,
          coverImage: null,
          textOverlayPlan: null,
          adBannerPlan: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodes.id, owner.episodeId),
            eq(verticalDramaEpisodes.updatedAt, current.updatedAt)
          )
        )
        .returning({ id: verticalDramaEpisodes.id });
      if (!updatedEpisode) throw new Error("VD_EPISODE_REPAIR_STALE_SOURCE");
      await tx
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaSeries.id, owner.seriesId),
            eq(verticalDramaSeries.tenantId, owner.tenantId),
            eq(verticalDramaSeries.userId, owner.userId)
          )
        );
      const [saved] = await tx
        .update(verticalDramaEpisodeRevisions)
        .set({
          status: "promoted",
          script: candidateScript,
          storyboard: candidateStoryboard,
          safetyFindings: { ...candidateSafety, continuityIssues },
          contextSummary: {
            ...summary,
            creditsUsed: creditAmount,
            reviewedPromotion: true,
            promotedFromStatus: "needs_review",
          },
          promotedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.id, revision.id),
            eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
            eq(verticalDramaEpisodeRevisions.userId, owner.userId),
            eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
            eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId),
            eq(verticalDramaEpisodeRevisions.status, "needs_review")
          )
        )
        .returning({ id: verticalDramaEpisodeRevisions.id });
      if (!saved) throw new Error("VD_EPISODE_REPAIR_ALREADY_DECIDED");
      return saved;
    });
    return {
      revisionId: result.id,
      status: "promoted",
      creditsUsed: creditAmount,
    };
  } catch (error) {
    if (chargedCreditAmount > 0) {
      await refundCredits({
        userId: owner.userId,
        tenantId: owner.tenantId,
        amount: chargedCreditAmount,
        description: "Vertical Drama — reviewed repair did not promote",
        idempotencyKey: `vd-episode-repair:${revision.id}:review-refund`,
        skillRunId: `vd-episode-repair:${revision.id}`,
        skillSlug: "vertical-drama-episode-repair",
        sourceType: "skill",
        metadata: {
          revisionId: revision.id,
          reason: "reviewed_promotion_failed",
        },
      }).catch(refundError => {
        console.error(
          "[VerticalDrama] reviewed repair credit compensation failed",
          {
            revisionId: revision.id,
            refundError,
          }
        );
      });
    }
    throw error;
  }
}

export async function cancelVerticalDramaEpisodeRepairRevision(
  owner: VerticalDramaEpisodeRepairOwner,
  revisionId: number
): Promise<{ revisionId: number; status: "cancelled" }> {
  const [cancelled] = await db
    .update(verticalDramaEpisodeRevisions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaEpisodeRevisions.id, revisionId),
        eq(verticalDramaEpisodeRevisions.tenantId, owner.tenantId),
        eq(verticalDramaEpisodeRevisions.userId, owner.userId),
        eq(verticalDramaEpisodeRevisions.seriesId, owner.seriesId),
        eq(verticalDramaEpisodeRevisions.episodeId, owner.episodeId),
        eq(verticalDramaEpisodeRevisions.status, "needs_review")
      )
    )
    .returning({ id: verticalDramaEpisodeRevisions.id });
  if (!cancelled) throw new Error("VD_EPISODE_REPAIR_ALREADY_DECIDED");
  return { revisionId: cancelled.id, status: "cancelled" };
}

export function getEpisodeRepairStatusLabel(status: string): string {
  return (
    (
      {
        queued: "รอซ่อม",
        running: "กำลังซ่อม",
        promoted: "ซ่อมและใช้งานแล้ว",
        needs_review: "รอตรวจสอบก่อนใช้งาน",
        cancelled: "ยกเลิก candidate แล้ว",
        failed: "ซ่อมไม่สำเร็จ",
      } as Record<string, string>
    )[status] ?? "สถานะไม่ทราบ"
  );
}
