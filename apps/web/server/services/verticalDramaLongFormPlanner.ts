import {
  LONG_FORM_DEFAULT_PLAN_CHUNK_SIZE,
  buildLongFormId,
  fingerprintLongFormPolicy,
  resolveLongFormMode,
  validatePlanChunks,
  type LongFormPlanChunk,
} from "@shared/verticalDramaSeries/longFormContracts";

export type LongFormMysteryPlan = {
  mysteryId: string;
  question: string;
  plantEpisode: number;
  revealEpisode: number;
  evidenceIds: string[];
  consequence: string;
};

export type LongFormThreadPlan = {
  threadId: string;
  ownerCharacterKeys: string[];
  plantEpisode: number;
  payoffStartEpisode: number;
  payoffEndEpisode: number;
  resolutionCost: string;
};

export type LongFormAdvantageBeat = {
  episodeNumber: number;
  advantagedSide: "protagonist" | "antagonist" | "shared" | "unclear";
  cost: string;
  opponentResponse: string;
};

export type LongFormArcPlan = {
  arcId: string;
  startEpisode: number;
  endEpisode: number;
  entryState: string;
  exitState: string;
  blockIds: string[];
};

export type LongFormPlan = {
  blueprintId: string;
  targetEpisodeCount: number;
  mode: "quality_120" | "extended_long_form";
  chunks: LongFormPlanChunk[];
  blocks: Array<{
    blockId: string;
    startEpisode: number;
    endEpisode: number;
    arcId: string;
  }>;
  arcs: LongFormArcPlan[];
  mysteries: LongFormMysteryPlan[];
  threads: LongFormThreadPlan[];
  advantageBeats: LongFormAdvantageBeat[];
  fingerprint: string;
};

export type LongFormPlannerInput = {
  blueprintScope: string;
  targetEpisodeCount: number;
  mystery: LongFormMysteryPlan;
  threads?: LongFormThreadPlan[];
  advantageBeats?: LongFormAdvantageBeat[];
  chunkSize?: number;
  arcCount?: number;
};

export function buildLongFormPlan(input: LongFormPlannerInput): LongFormPlan {
  const resolved = resolveLongFormMode(input.targetEpisodeCount);
  const errors = validateMystery(input.mystery, input.targetEpisodeCount);
  for (const thread of input.threads ?? [])
    errors.push(...validateThread(thread, input.targetEpisodeCount));
  for (const beat of input.advantageBeats ?? []) {
    if (beat.episodeNumber < 1 || beat.episodeNumber > input.targetEpisodeCount)
      errors.push("advantage_episode_out_of_range");
    if (!beat.cost.trim() || !beat.opponentResponse.trim())
      errors.push("advantage_missing_cost_or_response");
  }
  if (errors.length) throw new Error([...new Set(errors)].join(","));
  const chunkSize = Math.min(
    Math.max(input.chunkSize ?? LONG_FORM_DEFAULT_PLAN_CHUNK_SIZE, 1),
    20
  );
  const chunks = createPlanChunks(
    input.blueprintScope,
    input.targetEpisodeCount,
    chunkSize
  );
  const chunkErrors = validatePlanChunks(chunks, input.targetEpisodeCount);
  if (chunkErrors.length) throw new Error(chunkErrors.join(","));
  const arcCount = Math.min(
    Math.max(input.arcCount ?? Math.ceil(input.targetEpisodeCount / 20), 1),
    input.targetEpisodeCount
  );
  const arcs = createArcs(
    input.blueprintScope,
    input.targetEpisodeCount,
    arcCount
  );
  const blocks = arcs.flatMap(arc =>
    arc.blockIds.map((blockId, index) => {
      const startEpisode = Math.min(
        arc.endEpisode,
        arc.startEpisode + index * 10
      );
      return {
        blockId,
        startEpisode,
        endEpisode: Math.min(startEpisode + 9, arc.endEpisode),
        arcId: arc.arcId,
      };
    })
  );
  const plan = {
    blueprintId: buildLongFormId(
      "blueprint",
      input.blueprintScope,
      input.targetEpisodeCount
    ),
    targetEpisodeCount: input.targetEpisodeCount,
    mode: resolved.mode,
    chunks,
    blocks,
    arcs,
    mysteries: [input.mystery],
    threads: input.threads ?? [],
    advantageBeats: input.advantageBeats ?? [],
  } satisfies Omit<LongFormPlan, "fingerprint">;
  return { ...plan, fingerprint: fingerprintLongFormPolicy(plan) };
}

export function createPlanChunks(
  scope: string,
  targetEpisodeCount: number,
  chunkSize: number = LONG_FORM_DEFAULT_PLAN_CHUNK_SIZE
): LongFormPlanChunk[] {
  if (!Number.isInteger(targetEpisodeCount) || targetEpisodeCount < 1) {
    throw new Error("targetEpisodeCount must be a positive integer");
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 20) {
    throw new Error("chunkSize must be an integer between 1 and 20");
  }
  const chunks: LongFormPlanChunk[] = [];
  let predecessorCoverageFingerprint = "root";
  for (
    let startEpisode = 1;
    startEpisode <= targetEpisodeCount;
    startEpisode += chunkSize
  ) {
    const endEpisode = Math.min(
      startEpisode + chunkSize - 1,
      targetEpisodeCount
    );
    const chunkId = buildLongFormId("chunk", scope, startEpisode, endEpisode);
    const idempotencyKey = fingerprintLongFormPolicy({
      scope,
      startEpisode,
      endEpisode,
      workUnit: "season-skeleton",
    });
    chunks.push({
      chunkId,
      startEpisode,
      endEpisode,
      idempotencyKey,
      predecessorCoverageFingerprint,
    });
    predecessorCoverageFingerprint = fingerprintLongFormPolicy({
      chunkId,
      endEpisode,
      idempotencyKey,
    });
  }
  return chunks;
}

function createArcs(
  scope: string,
  targetEpisodeCount: number,
  arcCount: number
): LongFormArcPlan[] {
  const arcs: LongFormArcPlan[] = [];
  for (let index = 0; index < arcCount; index++) {
    const startEpisode =
      Math.floor((index * targetEpisodeCount) / arcCount) + 1;
    const endEpisode = Math.floor(
      ((index + 1) * targetEpisodeCount) / arcCount
    );
    const arcId = buildLongFormId(
      "arc",
      scope,
      index + 1,
      startEpisode,
      endEpisode
    );
    const blockIds: string[] = [];
    for (
      let blockStart = startEpisode;
      blockStart <= endEpisode;
      blockStart += 10
    ) {
      blockIds.push(
        buildLongFormId(
          "block",
          arcId,
          blockStart,
          Math.min(blockStart + 9, endEpisode)
        )
      );
    }
    arcs.push({
      arcId,
      startEpisode,
      endEpisode,
      entryState: `arc-${index + 1}-entry`,
      exitState: `arc-${index + 1}-exit`,
      blockIds,
    });
  }
  return arcs;
}

function validateMystery(
  mystery: LongFormMysteryPlan,
  targetEpisodeCount: number
): string[] {
  const errors: string[] = [];
  if (!mystery.question.trim()) errors.push("mystery_missing_question");
  if (mystery.plantEpisode < 1 || mystery.plantEpisode > targetEpisodeCount)
    errors.push("mystery_plant_out_of_range");
  if (
    mystery.revealEpisode < mystery.plantEpisode ||
    mystery.revealEpisode > targetEpisodeCount
  )
    errors.push("mystery_reveal_out_of_range");
  if (!mystery.evidenceIds.length) errors.push("mystery_missing_evidence");
  if (!mystery.consequence.trim()) errors.push("mystery_missing_consequence");
  return errors;
}

function validateThread(
  thread: LongFormThreadPlan,
  targetEpisodeCount: number
): string[] {
  const errors: string[] = [];
  if (!thread.threadId || !thread.ownerCharacterKeys.length)
    errors.push("thread_missing_owner");
  if (thread.plantEpisode < 1 || thread.plantEpisode > targetEpisodeCount)
    errors.push("thread_plant_out_of_range");
  if (
    thread.payoffStartEpisode < thread.plantEpisode ||
    thread.payoffEndEpisode < thread.payoffStartEpisode ||
    thread.payoffEndEpisode > targetEpisodeCount
  )
    errors.push("thread_payoff_window_invalid");
  if (!thread.resolutionCost.trim())
    errors.push("thread_missing_resolution_cost");
  return errors;
}
