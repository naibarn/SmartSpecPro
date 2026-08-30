import {
  OrchestraAssuranceRequestSchema,
  type OrchestraAssuranceRequest,
} from "../../shared/agentRuntime/orchestraSchemas";
import {
  fingerprintStoryValue,
  type StoryGenerationRunContract,
} from "./verticalDramaStoryGenerationContracts";

export const VERTICAL_DRAMA_STORY_AGENT_TASK_KIND = "structured_generation" as const;
export const VERTICAL_DRAMA_STORY_SKILLS = [
  "vertical-drama-context-pack-v1",
  "vertical-drama-plan-alignment-v1",
  "vertical-drama-continuity-review-v1",
  "vertical-drama-targeted-repair-v1",
] as const;

export function buildVerticalDramaStoryAssuranceRequest(
  contract: StoryGenerationRunContract,
  evidence: OrchestraAssuranceRequest["evidence"] = [],
): OrchestraAssuranceRequest {
  const request: OrchestraAssuranceRequest = {
    contractVersion: 1,
    contractId: contract.contractId,
    attemptId: contract.attemptId,
    taskKind: VERTICAL_DRAMA_STORY_AGENT_TASK_KIND,
    contractHash: contract.contractHash,
    evidencePolicy: {
      requiredPurposes: contract.evidencePolicy.requiredKinds,
      requireVisionFor: [],
      allowTextOnlyFallback: true,
      maxEvidenceItems: Math.max(1, contract.evidencePolicy.maxEpisodes),
      minQualityScore: 0,
    },
    evidence,
    outputContract: {
      schemaRef: contract.outputContract.format,
      requiredFields: ["episodes", "planAlignment", "validationReport"],
      maxChars: contract.budget.maxOutputBytes,
    },
    providerProfile: null,
    budget: {
      maxTurns: contract.budget.maxTurns,
      maxToolCalls: contract.budget.maxToolCalls,
      maxParallelAgents: contract.budget.maxParallelAgents,
      maxPlanDepth: 4,
      maxWallClockSeconds: Math.ceil(contract.budget.maxWallClockMs / 1000),
      maxInputTokens: Math.max(1, Math.floor(contract.budget.maxContextBytes / 4)),
      maxOutputTokens: Math.max(1, Math.floor(contract.budget.maxOutputBytes / 4)),
      maxRepairAttempts: contract.budget.maxRepairAttempts,
      estimatedCost: contract.budget.maxEstimatedCredits,
    },
    rulePackIds: [...contract.rulePackIds, ...VERTICAL_DRAMA_STORY_SKILLS],
    sideEffectPolicy: contract.sideEffectPolicy.allowedSideEffects.includes("user_visible_write")
      ? "approval_required"
      : "read_only",
    repairAttempts: 0,
  };
  return OrchestraAssuranceRequestSchema.parse(request);
}

export function verifyVerticalDramaStoryAgentHash(
  contract: StoryGenerationRunContract,
  returnedContractHash: string | null | undefined,
): void {
  if (returnedContractHash !== contract.contractHash) {
    throw new Error("STORY_AGENT_CONTRACT_HASH_MISMATCH");
  }
}

export function buildStoryAgentReplayFingerprint(input: unknown): string {
  return fingerprintStoryValue(input);
}

export function isOptionalStoryAgentsRuntimeEnabled(): boolean {
  return process.env.VERTICAL_DRAMA_STORY_AGENTS_RUNTIME === "true";
}
