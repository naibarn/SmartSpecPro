import { randomUUID } from "node:crypto";

import type { BrowserPolicyDecisionEnvelope } from "../../shared/browserPolicy";
import type {
  DecisionResult,
} from "./computerUseDecisionProvider";
import {
  sha256Reference,
  type Spec208ActionCandidate,
  type Spec208BrowserObservation,
  type Spec208CandidateSet,
} from "./computerUseSpec208Contracts";
import type { RunnerJobCommand } from "./runnerContracts";
import { validateRunnerJobCommand } from "./runnerJobCommandContracts";

export const SEMANTIC_OBSERVE_STAGE = "observe" as const;
export const SEMANTIC_ACTION_STAGE = "action" as const;
export const SEMANTIC_POST_ACTION_OBSERVE_STAGE = "post_action_observe" as const;

export type SemanticBrowserStage =
  | typeof SEMANTIC_OBSERVE_STAGE
  | typeof SEMANTIC_ACTION_STAGE
  | typeof SEMANTIC_POST_ACTION_OBSERVE_STAGE;

export type SemanticObservationRequest = {
  stage: typeof SEMANTIC_OBSERVE_STAGE | typeof SEMANTIC_POST_ACTION_OBSERVE_STAGE;
  goal: string;
  allowedActionFamilies: string[];
  maxCandidates: number;
  expectedSuccessCondition?: Record<string, unknown>;
  minimumRevision?: number;
};

export type SemanticActionLineage = {
  jobId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  observationId: string;
  observationRevision: number;
  browserGeneration: string;
  candidateSetId: string;
  candidateSetHash: string;
  decisionId: string;
  selectedCandidateId: string;
  policyDecisionId: string;
  actionId: string;
  actionType: string;
  targetRef: string;
  targetIdentity: string;
  parameters: Record<string, unknown>;
  leaseId: string;
  fencingToken: number;
  deadline: string;
};

export type SemanticActionPayload = {
  stage: typeof SEMANTIC_ACTION_STAGE;
  lineage: SemanticActionLineage;
};

export type SemanticObservationReceiptPayload = {
  stage: typeof SEMANTIC_OBSERVE_STAGE | typeof SEMANTIC_POST_ACTION_OBSERVE_STAGE;
  observation: unknown;
};

const ACTION_TYPE_BY_OPERATION: Record<Spec208ActionCandidate["operation"], string> = {
  CLICK: "click",
  TYPE_TEXT: "type",
  SELECT_OPTION: "select",
  SCROLL: "scroll",
  PRESS_KEY: "press_key",
  WAIT: "wait",
};

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function requiredPositiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(code);
  return value as number;
}

function policyDecisionId(policyDecision: BrowserPolicyDecisionEnvelope): string {
  return sha256Reference("policy-decision", policyDecision);
}

export function buildSemanticObservePayload(input: {
  goal: string;
  allowedActionFamilies: readonly string[];
  maxCandidates: number;
  expectedSuccessCondition?: Record<string, unknown>;
  postAction?: boolean;
  minimumRevision?: number;
}): Record<string, unknown> {
  const goal = requiredText(input.goal, "SEMANTIC_GOAL_REQUIRED");
  if (!Number.isSafeInteger(input.maxCandidates) || input.maxCandidates < 1 || input.maxCandidates > 64) {
    throw new Error("SEMANTIC_CANDIDATE_LIMIT_INVALID");
  }
  const families = input.allowedActionFamilies.map(value => requiredText(value, "SEMANTIC_ACTION_FAMILY_INVALID"));
  if (families.length === 0) throw new Error("SEMANTIC_ACTION_FAMILY_REQUIRED");
  return {
    stage: input.postAction ? SEMANTIC_POST_ACTION_OBSERVE_STAGE : SEMANTIC_OBSERVE_STAGE,
    observationRequest: {
      stage: input.postAction ? SEMANTIC_POST_ACTION_OBSERVE_STAGE : SEMANTIC_OBSERVE_STAGE,
      goal,
      allowedActionFamilies: Array.from(new Set(families)),
      maxCandidates: input.maxCandidates,
      ...(input.expectedSuccessCondition ? { expectedSuccessCondition: structuredClone(input.expectedSuccessCondition) } : {}),
      ...(input.minimumRevision === undefined ? {} : { minimumRevision: requiredPositiveInteger(input.minimumRevision, "SEMANTIC_MINIMUM_REVISION_INVALID") }),
    } satisfies SemanticObservationRequest,
  };
}

export function buildSemanticActionCommand(input: {
  baseCommand: RunnerJobCommand;
  observation: Spec208BrowserObservation;
  candidateSet: Spec208CandidateSet;
  decision: DecisionResult;
  policyDecision: BrowserPolicyDecisionEnvelope;
  selectedCandidate: Spec208ActionCandidate;
  actionParameters?: Record<string, unknown>;
  commandId?: string;
  idempotencyKey?: string;
}): RunnerJobCommand {
  if (input.policyDecision.decision !== "allow" && input.policyDecision.decision !== "allow_with_redaction") {
    throw new Error("SEMANTIC_POLICY_NOT_ACTIONABLE");
  }
  if (input.decision.status !== "SELECTED" || !input.decision.selectedCandidateId) {
    throw new Error("SEMANTIC_DECISION_NOT_ACTIONABLE");
  }
  if (input.decision.selectedCandidateId !== input.selectedCandidate.candidateId) {
    throw new Error("SEMANTIC_DECISION_CANDIDATE_MISMATCH");
  }
  if (
    input.candidateSet.observationId !== input.observation.observationId
    || input.candidateSet.observationRevision !== input.observation.revision
    || input.candidateSet.browserGeneration !== input.observation.browserGeneration
    || input.decision.observationId !== input.observation.observationId
    || input.decision.observationRevision !== input.observation.revision
    || input.decision.candidateSetId !== input.candidateSet.candidateSetId
    || input.decision.candidateSetHash !== input.candidateSet.candidateSetHash
    || input.selectedCandidate.observationId !== input.observation.observationId
    || input.selectedCandidate.observationRevision !== input.observation.revision
    || input.selectedCandidate.browserGeneration !== input.observation.browserGeneration
  ) {
    throw new Error("SEMANTIC_LINEAGE_MISMATCH");
  }

  const policyId = policyDecisionId(input.policyDecision);
  const actionType = ACTION_TYPE_BY_OPERATION[input.selectedCandidate.operation];
  const actionId = sha256Reference("semantic-action", {
    jobId: input.baseCommand.jobId,
    observationId: input.observation.observationId,
    observationRevision: input.observation.revision,
    candidateSetId: input.candidateSet.candidateSetId,
    candidateSetHash: input.candidateSet.candidateSetHash,
    decisionId: input.decision.decisionId,
    selectedCandidateId: input.selectedCandidate.candidateId,
    policyDecisionId: policyId,
    actionType,
    targetRef: input.selectedCandidate.targetRef,
    targetIdentity: input.selectedCandidate.targetIdentity,
    parameters: input.actionParameters ?? {},
  });
  const lineage: SemanticActionLineage = {
    jobId: input.baseCommand.jobId,
    runnerSessionId: input.baseCommand.runnerSessionId,
    capabilitySnapshotId: input.baseCommand.capabilitySnapshotId,
    capabilitySnapshotRevision: input.baseCommand.capabilitySnapshotRevision,
    observationId: input.observation.observationId,
    observationRevision: input.observation.revision,
    browserGeneration: input.observation.browserGeneration,
    candidateSetId: input.candidateSet.candidateSetId,
    candidateSetHash: input.candidateSet.candidateSetHash,
    decisionId: input.decision.decisionId,
    selectedCandidateId: input.selectedCandidate.candidateId,
    policyDecisionId: policyId,
    actionId,
    actionType,
    targetRef: input.selectedCandidate.targetRef,
    targetIdentity: input.selectedCandidate.targetIdentity,
    parameters: structuredClone(input.actionParameters ?? {}),
    leaseId: input.baseCommand.leaseId,
    fencingToken: input.baseCommand.fencingToken,
    deadline: input.baseCommand.deadline,
  };
  return validateRunnerJobCommand({
    ...input.baseCommand,
    commandId: input.commandId ?? randomUUID(),
    idempotencyKey: input.idempotencyKey ?? `${input.baseCommand.idempotencyKey}:action:${actionId}`,
    payload: {
      stage: SEMANTIC_ACTION_STAGE,
      lineage,
      ...(typeof input.baseCommand.payload.fixtureUrl === "string"
        ? { fixtureUrl: input.baseCommand.payload.fixtureUrl }
        : {}),
      correlation: input.baseCommand.payload.correlation ?? {},
      requiresIndependentVerification: true,
      verification: input.baseCommand.payload.verification ?? {
        required: true,
        verifier: "spec208-independent-v1",
        mode: "post_observation",
      },
    },
  });
}

export function validateCurrentSemanticAction(input: {
  command: RunnerJobCommand;
  currentObservation: {
    observationId: string;
    revision: number;
    browserGeneration: string;
  };
  currentRunnerSessionId: string;
  currentCapabilitySnapshotId: string;
  currentCapabilitySnapshotRevision: string;
  currentFencingToken: number;
}): SemanticActionLineage {
  const command = validateRunnerJobCommand(input.command);
  const payload = command.payload as { stage?: unknown; lineage?: Partial<SemanticActionLineage> };
  if (payload.stage !== SEMANTIC_ACTION_STAGE || !payload.lineage || typeof payload.lineage !== "object") {
    throw new Error("SEMANTIC_ACTION_LINEAGE_REQUIRED");
  }
  const lineage = payload.lineage;
  for (const [value, code] of [
    [lineage.jobId, "SEMANTIC_ACTION_JOB_REQUIRED"],
    [lineage.runnerSessionId, "SEMANTIC_ACTION_SESSION_REQUIRED"],
    [lineage.capabilitySnapshotId, "SEMANTIC_ACTION_CAPABILITY_REQUIRED"],
    [lineage.capabilitySnapshotRevision, "SEMANTIC_ACTION_CAPABILITY_REVISION_REQUIRED"],
    [lineage.observationId, "SEMANTIC_ACTION_OBSERVATION_REQUIRED"],
    [lineage.browserGeneration, "SEMANTIC_ACTION_BROWSER_GENERATION_REQUIRED"],
    [lineage.candidateSetId, "SEMANTIC_ACTION_CANDIDATE_SET_REQUIRED"],
    [lineage.candidateSetHash, "SEMANTIC_ACTION_CANDIDATE_HASH_REQUIRED"],
    [lineage.decisionId, "SEMANTIC_ACTION_DECISION_REQUIRED"],
    [lineage.selectedCandidateId, "SEMANTIC_ACTION_SELECTED_CANDIDATE_REQUIRED"],
    [lineage.policyDecisionId, "SEMANTIC_ACTION_POLICY_REQUIRED"],
    [lineage.actionId, "SEMANTIC_ACTION_ID_REQUIRED"],
    [lineage.actionType, "SEMANTIC_ACTION_TYPE_REQUIRED"],
    [lineage.targetRef, "SEMANTIC_ACTION_TARGET_REQUIRED"],
    [lineage.targetIdentity, "SEMANTIC_ACTION_TARGET_IDENTITY_REQUIRED"],
    [lineage.leaseId, "SEMANTIC_ACTION_LEASE_REQUIRED"],
    [lineage.deadline, "SEMANTIC_ACTION_DEADLINE_REQUIRED"],
  ] as const) requiredText(value, code);
  requiredPositiveInteger(lineage.observationRevision, "SEMANTIC_ACTION_OBSERVATION_REVISION_REQUIRED");
  requiredPositiveInteger(lineage.fencingToken, "SEMANTIC_ACTION_FENCE_REQUIRED");
  if (!lineage.parameters || typeof lineage.parameters !== "object" || Array.isArray(lineage.parameters)) {
    throw new Error("SEMANTIC_ACTION_PARAMETERS_REQUIRED");
  }
  if (lineage.jobId !== command.jobId || lineage.runnerSessionId !== command.runnerSessionId) {
    throw new Error("SEMANTIC_ACTION_COMMAND_BINDING_MISMATCH");
  }
  if (
    lineage.runnerSessionId !== input.currentRunnerSessionId
    || lineage.capabilitySnapshotId !== input.currentCapabilitySnapshotId
    || lineage.capabilitySnapshotRevision !== input.currentCapabilitySnapshotRevision
    || lineage.fencingToken !== input.currentFencingToken
  ) {
    throw new Error("SEMANTIC_ACTION_RUNTIME_BINDING_STALE");
  }
  if (
    lineage.observationId !== input.currentObservation.observationId
    || lineage.observationRevision !== input.currentObservation.revision
    || lineage.browserGeneration !== input.currentObservation.browserGeneration
  ) {
    throw new Error("SEMANTIC_ACTION_OBSERVATION_STALE");
  }
  const expectedActionId = sha256Reference("semantic-action", {
    jobId: lineage.jobId,
    observationId: lineage.observationId,
    observationRevision: lineage.observationRevision,
    candidateSetId: lineage.candidateSetId,
    candidateSetHash: lineage.candidateSetHash,
    decisionId: lineage.decisionId,
    selectedCandidateId: lineage.selectedCandidateId,
    policyDecisionId: lineage.policyDecisionId,
    actionType: lineage.actionType,
    targetRef: lineage.targetRef,
    targetIdentity: lineage.targetIdentity,
    parameters: lineage.parameters,
  });
  if (lineage.actionId !== expectedActionId) throw new Error("SEMANTIC_ACTION_LINEAGE_DIGEST_MISMATCH");
  return lineage as SemanticActionLineage;
}

export function semanticActionPolicyId(policyDecision: BrowserPolicyDecisionEnvelope): string {
  return policyDecisionId(policyDecision);
}
