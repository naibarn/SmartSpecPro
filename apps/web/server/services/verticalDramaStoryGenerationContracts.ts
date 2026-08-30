import { z } from "zod";
import {
  canonicalJsonStringify,
  sha256Hex,
} from "@shared/verticalDramaSeries/artifacts";
import type { LongFormRunExtension } from "@shared/verticalDramaSeries/longFormContracts";

export const STORY_GENERATION_CONTRACT_VERSION = "vd-story-generation-v1" as const;
export const STORY_GENERATION_SCHEMA_VERSION = 1 as const;
export const STORY_GENERATION_DEFAULT_EXPECTED_SHOTS = 9 as const;

export const STORY_GENERATION_STATUSES = [
  "queued",
  "running",
  "validating",
  "repairing",
  "awaiting_reconciliation",
  "awaiting_approval",
  "succeeded",
  "needs_repair",
  "partial",
  "failed",
  "cancelled",
] as const;
export type StoryGenerationStatus = (typeof STORY_GENERATION_STATUSES)[number];

export const STORY_GENERATION_STAGES = [
  "admission",
  "context",
  "generation",
  "validation",
  "alignment",
  "repair",
  "finalization",
] as const;
export type StoryGenerationStage = (typeof STORY_GENERATION_STAGES)[number];

export type StoryGenerationTaskKind =
  | "plan"
  | "deep_generate"
  | "extend"
  | "repair";

export interface StoryEvidenceRef {
  kind: string;
  id: string;
  revision?: string;
  sha256?: string;
  allowedEpisodes?: number[];
}

export interface StorySourceSnapshot {
  kind: "draft" | "plan" | "controls" | "quality" | "flags" | "context";
  revision: string;
  fingerprint: string;
  payload: unknown;
  capturedAt: string;
}

export interface StoryGenerationBudget {
  maxTurns: number;
  maxToolCalls: number;
  maxParallelAgents: number;
  maxEpisodes: number;
  maxLlmCalls: number;
  maxRepairAttempts: number;
  maxWallClockMs: number;
  maxContextBytes: number;
  maxOutputBytes: number;
  maxEstimatedCredits: number;
  onExhaustion: "partial" | "needs_repair" | "failed";
}

export interface StoryGenerationPolicy {
  mode: "standard" | "premium";
  requireApprovalForStructuralRepair: boolean;
  allowedSideEffects: Array<"artifact_write" | "user_visible_write" | "credit_mutation">;
  maxSpendCredits: number;
  allowRetryAfterPartialSuccess: boolean;
}

export interface StoryGenerationRunContract {
  schemaVersion: typeof STORY_GENERATION_SCHEMA_VERSION;
  contractVersion: typeof STORY_GENERATION_CONTRACT_VERSION;
  contractId: string;
  runId: string;
  attemptId: string;
  parentAttemptId: string | null;
  tenantId: string;
  userId: number;
  seriesId: number;
  originSurface: string;
  taskKind: StoryGenerationTaskKind;
  objective: string;
  sourceRevision: string;
  sourceSnapshotKind: StorySourceSnapshot["kind"];
  inputRefs: StoryEvidenceRef[];
  evidencePolicy: { requiredKinds: string[]; maxEpisodes: number };
  outputContract: { format: string; requiresFinalGate: boolean; version: string };
  constraints: Record<string, unknown>;
  sourceFingerprint: string;
  architectureFingerprint: string;
  storyControlFingerprint: string;
  targetEpisodes: number[];
  expectedShots: number | null;
  characterFingerprint: string | null;
  locationFingerprint: string | null;
  qualityCriteriaVersion: number;
  qualityFeatureFlagSnapshot: Record<string, boolean>;
  skillVersions: Record<string, string>;
  rulePackIds: string[];
  validationPolicy: { blockingSeverities: string[]; strictAlignment: boolean };
  sideEffectPolicy: StoryGenerationPolicy;
  budget: StoryGenerationBudget;
  providerPolicy: { primary: string; fallback: string[]; immutable: boolean };
  /** Feature 153 additive long-form contract; absent for legacy runs. */
  longForm?: LongFormRunExtension;
  idempotencyKey: string;
  policyHash: string;
  contractHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface StoryPlanAlignmentLedger {
  planVersion: string;
  plannedKeyBeats: Array<{
    beatId: string;
    episodeNumber: number;
    description: string;
    allowedEvidenceEpisodes: number[];
    required: boolean;
    deferred: boolean;
  }>;
  generatedBeatIds: string[];
  missingRequiredBeatIds: string[];
  unexpectedBeatIds: string[];
  drifted: boolean;
}

export interface StoryValidationFinding {
  code: string;
  severity: "info" | "minor" | "moderate" | "major" | "structural";
  message: string;
  targetPaths: string[];
  preservePaths: string[];
  blocking: boolean;
  requiresApproval: boolean;
}

export interface StoryValidationReport {
  reportVersion: string;
  contractHash: string;
  outputFingerprint: string;
  criteriaVersion: number;
  passed: boolean;
  findings: StoryValidationFinding[];
  alignment: StoryPlanAlignmentLedger | null;
  impactedEpisodes: number[];
  repairRound: number;
  finalGateEligible: boolean;
}

export type StoryTransportOutcome = "completed" | "pending" | "resumable" | "rejected";

export interface StoryGenerationRunSummary {
  runId: string;
  seriesId: number;
  status: StoryGenerationStatus;
  stage: StoryGenerationStage;
  transportOutcome: StoryTransportOutcome;
  checkpoint: Record<string, unknown> | null;
  report: StoryValidationReport | null;
  resumable: boolean;
  repairable: boolean;
  approvalRequired: boolean;
  reconciliationRequired: boolean;
  approvalReason: string | null;
  eventCursor: number;
  estimatedCredits: number;
  errorCode: string | null;
}

const activeStatuses = new Set<StoryGenerationStatus>([
  "queued",
  "running",
  "validating",
  "repairing",
  "awaiting_reconciliation",
  "awaiting_approval",
  "needs_repair",
  "partial",
]);

const allowedTransitions: Record<StoryGenerationStatus, readonly StoryGenerationStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["validating", "partial", "awaiting_reconciliation", "cancelled", "failed"],
  validating: ["repairing", "succeeded", "needs_repair", "partial", "awaiting_approval", "failed"],
  repairing: ["validating", "partial", "needs_repair", "awaiting_approval", "awaiting_reconciliation", "failed", "cancelled"],
  awaiting_reconciliation: ["running", "validating", "partial", "failed", "cancelled"],
  awaiting_approval: ["repairing", "needs_repair", "cancelled", "failed"],
  succeeded: [],
  needs_repair: ["repairing", "cancelled", "failed"],
  partial: ["running", "repairing", "validating", "cancelled", "failed"],
  failed: [],
  cancelled: [],
};

export function isActiveStoryGenerationStatus(status: StoryGenerationStatus): boolean {
  return activeStatuses.has(status);
}

export function assertStoryGenerationTransition(
  from: StoryGenerationStatus,
  to: StoryGenerationStatus,
): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`Invalid story generation transition: ${from} -> ${to}`);
  }
}

export function canonicalStoryValue(value: unknown): string {
  return canonicalJsonStringify(value);
}

export function fingerprintStoryValue(value: unknown): string {
  return sha256Hex(canonicalStoryValue(value));
}

export function deriveLegacyBeatId(
  episodeNumber: number,
  beatIndex: number,
  description: string,
): string {
  return `beat-${episodeNumber}-${beatIndex}-${sha256Hex(description.trim()).slice(0, 12)}`;
}

export function buildStoryContractHash(contract: Omit<StoryGenerationRunContract, "contractHash">): string {
  return fingerprintStoryValue(contract);
}

export function buildStoryPolicyHash(contract: Pick<StoryGenerationRunContract, "sideEffectPolicy" | "budget" | "providerPolicy" | "rulePackIds">): string {
  return fingerprintStoryValue({
    sideEffectPolicy: contract.sideEffectPolicy,
    budget: contract.budget,
    providerPolicy: contract.providerPolicy,
    rulePackIds: contract.rulePackIds,
  });
}

export function createStorySourceSnapshot(
  kind: StorySourceSnapshot["kind"],
  revision: string,
  payload: unknown,
  capturedAt = new Date().toISOString(),
): StorySourceSnapshot {
  return { kind, revision, payload, fingerprint: fingerprintStoryValue(payload), capturedAt };
}

export function effectiveStoryCreditCeiling(budget: StoryGenerationBudget, policy: StoryGenerationPolicy): number {
  return Math.max(0, Math.min(budget.maxEstimatedCredits, policy.maxSpendCredits));
}

export function summarizeStoryGenerationRun(input: Omit<StoryGenerationRunSummary, "transportOutcome" | "resumable" | "repairable" | "reconciliationRequired">): StoryGenerationRunSummary {
  const resumable = ["queued", "running", "partial", "needs_repair", "awaiting_reconciliation", "awaiting_approval"].includes(input.status);
  const repairable = ["needs_repair", "partial", "awaiting_approval"].includes(input.status);
  const reconciliationRequired = input.status === "awaiting_reconciliation";
  const transportOutcome: StoryTransportOutcome = input.status === "succeeded"
    ? "completed"
    : ["failed", "cancelled"].includes(input.status)
      ? "rejected"
      : resumable ? "resumable" : "pending";
  return { ...input, transportOutcome, resumable, repairable, reconciliationRequired };
}

export const storyGenerationStatusSchema = z.enum(STORY_GENERATION_STATUSES);
export const storyGenerationStageSchema = z.enum(STORY_GENERATION_STAGES);
