import { randomUUID } from "node:crypto";
import { getVerticalDramaQualityCriteriaBundle } from "./verticalDramaQualityCriteria";
import {
  assertStoryGenerationTransition,
  buildStoryContractHash,
  buildStoryPolicyHash,
  createStorySourceSnapshot,
  summarizeStoryGenerationRun,
  STORY_GENERATION_DEFAULT_EXPECTED_SHOTS,
  type StoryGenerationRunContract,
  type StoryGenerationPolicy,
  type StoryGenerationRunSummary,
  type StoryGenerationStage,
  type StoryGenerationStatus,
  type StorySourceSnapshot,
} from "./verticalDramaStoryGenerationContracts";
import {
  createStoryGenerationRun,
  finalizeStoryGenerationRun,
  getStoryGenerationRun,
  getStoryGenerationRunByIdempotency,
  updateStoryGenerationCheckpoint,
} from "./verticalDramaStoryGenerationRepository";
import type { VerticalDramaStoryGenerationRunRow } from "../../drizzle/schema";
import type { VisualSourceSnapshot } from "@shared/verticalDramaSeries/visualSource";
import {
  longFormRunExtensionSchema,
  type LongFormRunExtension,
} from "@shared/verticalDramaSeries/longFormContracts";

const DEFAULT_STORY_BUDGET = {
  maxTurns: 32,
  maxToolCalls: 64,
  maxParallelAgents: 3,
  maxEpisodes: 100,
  maxLlmCalls: 64,
  maxRepairAttempts: 4,
  maxWallClockMs: 30 * 60 * 1000,
  maxContextBytes: 512_000,
  maxOutputBytes: 5_000_000,
  maxEstimatedCredits: 500,
  onExhaustion: "partial" as const,
};

export class StoryGenerationFenceLostError extends Error {
  readonly code = "STORY_GENERATION_FENCE_LOST";

  constructor() {
    super("Durable story-generation worker lost its fencing token");
    this.name = "StoryGenerationFenceLostError";
  }
}

export interface AdmitStoryGenerationRunInput {
  tenantId: string;
  userId: number;
  seriesId: number;
  taskKind: StoryGenerationRunContract["taskKind"];
  runKey: string;
  idempotencyKey: string;
  sourceRevision: string;
  sourcePayload: unknown;
  sourceSnapshotKind?: StorySourceSnapshot["kind"];
  targetEpisodes: number[];
  objective?: string;
  mode?: "standard" | "premium";
  featureFlags?: Record<string, boolean>;
  maxEstimatedCredits?: number;
  longForm?: LongFormRunExtension;
  /** Feature 160 — accepted visual source canon shared by draft/full/deep paths. */
  visualSourceSnapshot?: VisualSourceSnapshot;
}

export async function admitStoryGenerationRun(
  input: AdmitStoryGenerationRunInput
): Promise<VerticalDramaStoryGenerationRunRow> {
  if (input.longForm) longFormRunExtensionSchema.parse(input.longForm);
  const existing = await getStoryGenerationRunByIdempotency(
    input.tenantId,
    input.idempotencyKey
  );
  if (existing) return existing;
  const sourceSnapshot = input.visualSourceSnapshot
    ? {
        kind: "draft" as const,
        revision: `visual:${input.visualSourceSnapshot.revision}`,
        fingerprint: input.visualSourceSnapshot.fingerprint,
        payload: input.visualSourceSnapshot,
        capturedAt: input.visualSourceSnapshot.capturedAt,
      }
    : createStorySourceSnapshot(
        input.sourceSnapshotKind ?? "draft",
        input.sourceRevision,
        input.sourcePayload,
      );
  const criteria = getVerticalDramaQualityCriteriaBundle();
  const mode = input.mode ?? "premium";
  const sideEffectPolicy = {
    mode,
    requireApprovalForStructuralRepair: true,
    allowedSideEffects: [
      "artifact_write",
      "user_visible_write",
      "credit_mutation",
    ] as StoryGenerationPolicy["allowedSideEffects"],
    maxSpendCredits:
      input.maxEstimatedCredits ?? DEFAULT_STORY_BUDGET.maxEstimatedCredits,
    allowRetryAfterPartialSuccess: true,
  };
  const budget = {
    ...DEFAULT_STORY_BUDGET,
    maxEpisodes: Math.max(1, input.targetEpisodes.length),
    maxEstimatedCredits:
      input.maxEstimatedCredits ?? DEFAULT_STORY_BUDGET.maxEstimatedCredits,
  };
  const baseContract: Omit<StoryGenerationRunContract, "contractHash"> = {
    schemaVersion: 1,
    contractVersion: "vd-story-generation-v1",
    contractId: `vd-contract-${randomUUID()}`,
    runId: randomUUID(),
    attemptId: randomUUID(),
    parentAttemptId: null,
    tenantId: input.tenantId,
    userId: input.userId,
    seriesId: input.seriesId,
    originSurface: "vertical-drama-series",
    taskKind: input.taskKind,
    objective:
      input.objective ??
      "Generate a story that remains aligned with the accepted draft plan",
    sourceRevision: input.sourceRevision,
    sourceSnapshotKind: sourceSnapshot.kind,
    inputRefs: [
      {
        kind: sourceSnapshot.kind,
        id: input.sourceRevision,
        revision: input.sourceRevision,
        sha256: sourceSnapshot.fingerprint,
        allowedEpisodes: input.targetEpisodes,
      },
    ],
    evidencePolicy: {
      requiredKinds: [sourceSnapshot.kind, "quality", "plan"],
      maxEpisodes: budget.maxEpisodes,
    },
    outputContract: {
      format: "vertical-drama-story-draft-v1",
      requiresFinalGate: true,
      version: "1",
    },
    constraints: { targetEpisodes: input.targetEpisodes },
    sourceFingerprint: sourceSnapshot.fingerprint,
    architectureFingerprint: sourceSnapshot.fingerprint,
    storyControlFingerprint: sourceSnapshot.fingerprint,
    targetEpisodes: input.targetEpisodes,
    expectedShots: STORY_GENERATION_DEFAULT_EXPECTED_SHOTS,
    characterFingerprint: null,
    locationFingerprint: null,
    qualityCriteriaVersion: criteria.version,
    qualityFeatureFlagSnapshot: input.featureFlags ?? {},
    skillVersions: {},
    rulePackIds: [
      "structure-v1",
      "identity-roster-v1",
      "continuity-v1",
      "budget-v1",
      "plan-alignment-v1",
    ],
    validationPolicy: {
      blockingSeverities: ["major", "structural"],
      strictAlignment: true,
    },
    sideEffectPolicy,
    budget,
    providerPolicy: {
      primary: "configured-story-llm",
      fallback: [],
      immutable: true,
    },
    longForm: input.longForm,
    idempotencyKey: input.idempotencyKey,
    policyHash: "",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  const contract: StoryGenerationRunContract = {
    ...baseContract,
    policyHash: buildStoryPolicyHash(baseContract),
    contractHash: buildStoryContractHash(baseContract),
  };
  return createStoryGenerationRun({
    contract,
    runKey: input.runKey,
    sourceSnapshot,
  });
}

export function storyGenerationRowToSummary(
  row: VerticalDramaStoryGenerationRunRow
): StoryGenerationRunSummary {
  const status = row.status as StoryGenerationStatus;
  const stage = row.stage as StoryGenerationStage;
  return summarizeStoryGenerationRun({
    runId: row.runId,
    seriesId: Number(row.seriesId),
    status,
    stage,
    checkpoint: (row.checkpointJson as Record<string, unknown> | null) ?? null,
    report:
      (row.validationReportJson as StoryGenerationRunSummary["report"]) ?? null,
    approvalRequired: status === "awaiting_approval",
    approvalReason: status === "awaiting_approval" ? row.errorCode : null,
    eventCursor: row.eventCursor,
    estimatedCredits: row.reservedCredits,
    errorCode: row.errorCode,
  });
}

export async function getStoryGenerationRunSummary(
  tenantId: string,
  runId: string
): Promise<StoryGenerationRunSummary | null> {
  const row = await getStoryGenerationRun(tenantId, runId);
  return row ? storyGenerationRowToSummary(row) : null;
}

export async function transitionStoryGenerationRun(input: {
  tenantId: string;
  runId: string;
  to: StoryGenerationStatus;
  stage: StoryGenerationStage;
  checkpoint?: unknown;
  errorCode?: string | null;
  expectedFenceToken?: number;
}): Promise<StoryGenerationRunSummary | null> {
  const current = await getStoryGenerationRun(input.tenantId, input.runId);
  if (!current) return null;
  const from = current.status as StoryGenerationStatus;
  if (from !== input.to) assertStoryGenerationTransition(from, input.to);
  const updated = await updateStoryGenerationCheckpoint(
    input.tenantId,
    input.runId,
    {
      status: input.to,
      stage: input.stage,
      checkpoint: input.checkpoint,
      errorCode: input.errorCode,
      expectedFenceToken: input.expectedFenceToken,
    }
  );
  if (!updated && input.expectedFenceToken !== undefined)
    throw new StoryGenerationFenceLostError();
  return updated ? storyGenerationRowToSummary(updated) : null;
}

export async function finalizeStoryGeneration(
  tenantId: string,
  runId: string,
  finalizationKey: string,
  finalArtifactId?: number,
  expectedFenceToken?: number
): Promise<StoryGenerationRunSummary | null> {
  const row = await finalizeStoryGenerationRun(
    tenantId,
    runId,
    finalizationKey,
    finalArtifactId,
    expectedFenceToken
  );
  if (!row && expectedFenceToken !== undefined)
    throw new StoryGenerationFenceLostError();
  return row ? storyGenerationRowToSummary(row) : null;
}
