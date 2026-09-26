import type {
  BrowserPolicyDecisionEnvelope,
} from "../../shared/browserPolicy";
import type { BrowserPolicyEvaluationInput } from "./browserPolicyEngine";
import {
  buildBoundedBrowserCandidateSet,
  normalizeBrowserObservation,
} from "./computerUseCandidateBuilder";
import {
  type DecisionProvider,
  type DecisionResult,
} from "./computerUseDecisionProvider";
import type {
  BrowserActionFamily,
  BrowserOperation,
  Spec208ActionCandidate,
  Spec208CandidateSet,
  Spec208BrowserObservation,
} from "./computerUseSpec208Contracts";

const operationActionType: Record<BrowserOperation, string> = {
  CLICK: "click",
  TYPE_TEXT: "type",
  SELECT_OPTION: "select",
  SCROLL: "scroll",
  PRESS_KEY: "press_key",
  WAIT: "wait",
};

export type SemanticBrowserRuntimeInput = {
  rawObservation: Parameters<typeof normalizeBrowserObservation>[0];
  subgoal: string;
  allowedActionFamilies: readonly BrowserActionFamily[];
  maxCandidates: number;
  decisionProvider: DecisionProvider;
  tenantId: string;
  userId?: number;
  executionId: string;
  traceId: string;
  evaluatePolicy: (
    input: BrowserPolicyEvaluationInput,
  ) => BrowserPolicyDecisionEnvelope;
};

export type SemanticBrowserRuntimeResult = {
  status: "READY_TO_EXECUTE" | "NO_MATCH" | "BLOCKED";
  observation: Spec208BrowserObservation;
  candidateSet: Spec208CandidateSet;
  decision: DecisionResult;
  policyDecision: BrowserPolicyDecisionEnvelope | null;
  selectedCandidate: Spec208ActionCandidate | null;
  blockReason?: "POLICY_DENIED" | "POLICY_APPROVAL_REQUIRED";
};

/**
 * Canonical Spec 208 semantic boundary. It intentionally stops before the
 * Runner/browser executor: only a selected, fresh, policy-approved candidate
 * may cross that boundary.
 */
export async function resolveSemanticBrowserAction(
  input: SemanticBrowserRuntimeInput,
): Promise<SemanticBrowserRuntimeResult> {
  const observation = normalizeBrowserObservation(input.rawObservation);
  const candidateSet = buildBoundedBrowserCandidateSet({
    observation,
    subgoal: input.subgoal,
    allowedActionFamilies: input.allowedActionFamilies,
    maxCandidates: input.maxCandidates,
  });
  const decision = await input.decisionProvider.choose({
    requestedProvider: input.decisionProvider.providerId,
    goal: input.subgoal,
    observation,
    candidateSet,
  });
  const selectedCandidate = decision.selectedCandidateId
    ? candidateSet.candidates.find(candidate => candidate.candidateId === decision.selectedCandidateId) ?? null
    : null;
  if (decision.status !== "SELECTED" || !selectedCandidate) {
    return {
      status: "NO_MATCH",
      observation,
      candidateSet,
      decision,
      policyDecision: null,
      selectedCandidate: null,
    };
  }

  const policyDecision = input.evaluatePolicy({
    tenantId: input.tenantId,
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    executionId: input.executionId,
    traceId: input.traceId,
    actionType: operationActionType[selectedCandidate.operation],
    requiredCapabilities: [operationActionType[selectedCandidate.operation]],
    targetOrigin: selectedCandidate.origin,
    currentOrigin: observation.origin,
    writesData: selectedCandidate.operation === "TYPE_TEXT" || selectedCandidate.operation === "SELECT_OPTION",
    evidence: {
      actionDigest: decision.decisionEvidenceRef,
      domFingerprint: observation.observationHash,
    },
  });
  if (policyDecision.decision !== "allow") {
    return {
      status: "BLOCKED",
      observation,
      candidateSet,
      decision,
      policyDecision,
      selectedCandidate: null,
      blockReason: policyDecision.decision === "require_approval"
        ? "POLICY_APPROVAL_REQUIRED"
        : "POLICY_DENIED",
    };
  }
  return {
    status: "READY_TO_EXECUTE",
    observation,
    candidateSet,
    decision,
    policyDecision,
    selectedCandidate,
  };
}
