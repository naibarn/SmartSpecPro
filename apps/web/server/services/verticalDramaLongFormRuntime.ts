import {
  buildLongFormPlan,
  type LongFormPlan,
} from "./verticalDramaLongFormPlanner";
import {
  calculateRepairImpact,
  type LongFormReverseDependencyIndex,
} from "./verticalDramaLongFormMemory";

export type LongFormBlockResult<T> = {
  blockId: string;
  startEpisode: number;
  endEpisode: number;
  value: T;
  fingerprint: string;
};

export type LongFormLoopCheckpoint<T = unknown> = {
  planFingerprint: string;
  acceptedBlockIds: string[];
  /** Durable accepted values allow a resumed caller to render the full result. */
  acceptedBlocks?: LongFormBlockResult<T>[];
  lastAcceptedEpisode: number;
  status: "partial" | "needs_repair" | "awaiting_approval" | "succeeded";
  repairRound: number;
  /** Non-blocking findings retained when a structurally valid block is accepted. */
  warnings?: string[];
};

export async function runLongFormBlockLoop<T>(input: {
  plan: LongFormPlan;
  checkpoint?: LongFormLoopCheckpoint<T>;
  maxRepairRounds?: number;
  generateBlock: (
    blockId: string,
    startEpisode: number,
    endEpisode: number
  ) => Promise<LongFormBlockResult<T>>;
  validateBlock: (block: LongFormBlockResult<T>) => Promise<string[]>;
  repairBlock?: (
    block: LongFormBlockResult<T>,
    findings: string[],
    repairRound: number
  ) => Promise<LongFormBlockResult<T>>;
  /** Allows subjective/content-quality findings to be retained as warnings. */
  acceptWithWarnings?: (findings: string[]) => boolean;
}): Promise<{
  blocks: LongFormBlockResult<T>[];
  checkpoint: LongFormLoopCheckpoint<T>;
}> {
  if (
    input.checkpoint &&
    input.checkpoint.planFingerprint !== input.plan.fingerprint
  ) {
    throw new Error("stale_long_form_plan_checkpoint");
  }
  const acceptedIds = new Set(input.checkpoint?.acceptedBlockIds ?? []);
  const blocks: LongFormBlockResult<T>[] = [
    ...(input.checkpoint?.acceptedBlocks ?? []),
  ];
  let repairRound = input.checkpoint?.repairRound ?? 0;
  const warnings = [...(input.checkpoint?.warnings ?? [])];
  for (const arc of input.plan.arcs) {
    for (const blockId of arc.blockIds) {
      if (acceptedIds.has(blockId)) continue;
      const blockPlan = input.plan.blocks.find(
        item => item.blockId === blockId
      );
      if (!blockPlan) throw new Error(`missing_block_plan:${blockId}`);
      const { startEpisode, endEpisode } = blockPlan;
      let block = await input.generateBlock(blockId, startEpisode, endEpisode);
      let findings = await input.validateBlock(block);
      let blockRepairRound = 0;
      while (
        findings.length &&
        input.repairBlock &&
        blockRepairRound < (input.maxRepairRounds ?? 3)
      ) {
        blockRepairRound += 1;
        repairRound += 1;
        block = await input.repairBlock(block, findings, blockRepairRound);
        findings = await input.validateBlock(block);
      }
      if (findings.length) {
        if (input.acceptWithWarnings?.(findings)) {
          warnings.push(...findings.map(finding => `${blockId}:${finding}`));
          blocks.push(block);
          acceptedIds.add(blockId);
          continue;
        }
        return {
          blocks,
          checkpoint: {
            planFingerprint: input.plan.fingerprint,
            acceptedBlockIds: blocks.map(item => item.blockId),
            acceptedBlocks: blocks,
            lastAcceptedEpisode: blocks.at(-1)?.endEpisode ?? 0,
            status: "needs_repair",
            repairRound,
            warnings,
          },
        };
      }
      blocks.push(block);
      acceptedIds.add(blockId);
    }
  }
  return {
    blocks,
    checkpoint: {
      planFingerprint: input.plan.fingerprint,
      acceptedBlockIds: blocks.map(item => item.blockId),
      acceptedBlocks: blocks,
      lastAcceptedEpisode: blocks.at(-1)?.endEpisode ?? 0,
      status: "succeeded",
      repairRound,
      warnings,
    },
  };
}

export type LongFormClosureInput = {
  targetEpisodeCount: number;
  generatedEpisodeNumbers: number[];
  unresolvedMysteryIds: string[];
  unresolvedThreadIds: string[];
  unearnedGuestIds: string[];
  invalidWorldRuleIds: string[];
  lookDriftIds: string[];
  relationshipFindingIds: string[];
  antiDriftFindingIds: string[];
  benchmarkFinalizationRef?: string;
};

export function evaluateLongFormClosure(input: LongFormClosureInput): {
  eligible: boolean;
  status: "succeeded" | "needs_repair" | "awaiting_approval";
  findings: string[];
} {
  const findings = [
    ...input.unresolvedMysteryIds.map(id => `unresolved_mystery:${id}`),
    ...input.unresolvedThreadIds.map(id => `unresolved_thread:${id}`),
    ...input.unearnedGuestIds.map(id => `unearned_guest:${id}`),
    ...input.invalidWorldRuleIds.map(id => `invalid_world_rule:${id}`),
    ...input.lookDriftIds.map(id => `look_drift:${id}`),
    ...input.relationshipFindingIds.map(id => `relationship:${id}`),
    ...input.antiDriftFindingIds.map(id => `anti_drift:${id}`),
  ];
  const generatedEpisodes = new Set(input.generatedEpisodeNumbers);
  if (generatedEpisodes.size < input.targetEpisodeCount)
    findings.push("episode_coverage_incomplete");
  if (
    [...generatedEpisodes].some(
      episode =>
        !Number.isInteger(episode) ||
        episode < 1 ||
        episode > input.targetEpisodeCount
    )
  ) {
    findings.push("episode_coverage_out_of_range");
  }
  if (!input.benchmarkFinalizationRef)
    findings.push("benchmark_finalization_missing");
  return {
    eligible: findings.length === 0,
    status: findings.length ? "needs_repair" : "succeeded",
    findings,
  };
}

export function repairImpactForRelationshipEdges(
  index: LongFormReverseDependencyIndex,
  edgeIds: readonly string[]
) {
  return calculateRepairImpact(index, edgeIds);
}
