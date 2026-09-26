import {
  canonicalize,
  sha256Reference,
  type Spec208BrowserObservation,
} from "./computerUseSpec208Contracts";
import type { DecisionResult } from "./computerUseDecisionProvider";

export type VerificationOutcome = "PASS" | "FAIL" | "REOBSERVE" | "INCONCLUSIVE";

export type VerificationReceipt = {
  verificationId: string;
  verifierType: "spec208-independent";
  verifierVersion: "spec208-independent-v1";
  jobId: string;
  goal: string;
  decisionId: string;
  actionId: string;
  preObservationRef: string;
  postObservationRef: string | null;
  evidenceRefs: string[];
  verificationInputHash: string;
  result: VerificationOutcome;
  reasonCode: string;
  verificationEvidenceRef: string;
  verificationEvidenceHash: string;
  verifiedAt: string;
};

type ExpectedSuccessCondition = {
  text?: string;
  url?: string;
  elementPresent?: string;
  elementAbsent?: string;
};

type ExecutionReceipt = {
  status: "completed" | "failed" | "unknown";
  resultRef?: string;
  evidenceRefs: string[];
};

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function observationText(observation: Spec208BrowserObservation): string {
  return observation.elements.map(element => `${element.role} ${element.name}`).join(" ");
}

function outcomeFor(input: {
  expected: ExpectedSuccessCondition;
  pre: Spec208BrowserObservation;
  post?: Spec208BrowserObservation;
  decision: DecisionResult;
  policy: "allow" | "allow_with_redaction" | "require_approval" | "deny";
  actionCandidateId: string;
  execution: ExecutionReceipt;
}): { result: VerificationOutcome; reasonCode: string } {
  if (input.decision.status !== "SELECTED" || !input.decision.selectedCandidateId) {
    return { result: "FAIL", reasonCode: "DECISION_NOT_ACTIONABLE" };
  }
  if (input.decision.selectedCandidateId !== input.actionCandidateId) {
    return { result: "FAIL", reasonCode: "DECISION_ACTION_MISMATCH" };
  }
  if (input.policy !== "allow" && input.policy !== "allow_with_redaction") {
    return { result: "FAIL", reasonCode: "POLICY_NOT_ALLOWED" };
  }
  if (input.execution.status === "unknown") return { result: "INCONCLUSIVE", reasonCode: "EXECUTION_OUTCOME_UNKNOWN" };
  if (input.execution.status === "failed") return { result: "FAIL", reasonCode: "EXECUTION_FAILED" };
  if (!input.post) return { result: "REOBSERVE", reasonCode: "POST_OBSERVATION_REQUIRED" };
  if (
    input.post.revision <= input.pre.revision
    || input.post.browserGeneration !== input.pre.browserGeneration
    || input.post.origin !== input.pre.origin
  ) {
    return { result: "REOBSERVE", reasonCode: "POST_OBSERVATION_STALE" };
  }
  const text = observationText(input.post);
  if (input.expected.text && !text.includes(input.expected.text)) {
    return { result: "FAIL", reasonCode: "EXPECTED_OUTCOME_NOT_OBSERVED" };
  }
  if (input.expected.url && input.post.url !== input.expected.url) {
    return { result: "FAIL", reasonCode: "EXPECTED_OUTCOME_NOT_OBSERVED" };
  }
  const targetRefs = new Set(input.post.elements.map(element => element.targetRef));
  if (input.expected.elementPresent && !targetRefs.has(input.expected.elementPresent)) {
    return { result: "FAIL", reasonCode: "EXPECTED_OUTCOME_NOT_OBSERVED" };
  }
  if (input.expected.elementAbsent && targetRefs.has(input.expected.elementAbsent)) {
    return { result: "FAIL", reasonCode: "EXPECTED_OUTCOME_NOT_OBSERVED" };
  }
  return { result: "PASS", reasonCode: "EXPECTED_OUTCOME_OBSERVED" };
}

export function verifyComputerUseOutcome(input: {
  jobId: string;
  goal: string;
  expectedSuccessCondition: ExpectedSuccessCondition;
  preObservation: Spec208BrowserObservation;
  postObservation?: Spec208BrowserObservation;
  decision: DecisionResult;
  policyDecision: {
    policyDecisionId: string;
    decision: "allow" | "allow_with_redaction" | "require_approval" | "deny";
  };
  action: { actionId: string; candidateId: string };
  executionReceipt: ExecutionReceipt;
  verifiedAt?: string;
}): VerificationReceipt {
  const jobId = requiredText(input.jobId, "VERIFICATION_JOB_ID_REQUIRED");
  const goal = requiredText(input.goal, "VERIFICATION_GOAL_REQUIRED");
  const actionId = requiredText(input.action.actionId, "VERIFICATION_ACTION_ID_REQUIRED");
  const body = {
    jobId,
    goal,
    expectedSuccessCondition: input.expectedSuccessCondition,
    preObservationRef: input.preObservation.observationHash,
    postObservationRef: input.postObservation?.observationHash ?? null,
    decisionId: input.decision.decisionId,
    decisionEvidenceRef: input.decision.decisionEvidenceRef,
    policyDecisionId: requiredText(input.policyDecision.policyDecisionId, "VERIFICATION_POLICY_ID_REQUIRED"),
    policyDecision: input.policyDecision.decision,
    actionId,
    candidateId: input.action.candidateId,
    executionReceipt: input.executionReceipt,
  };
  const verificationInputRef = sha256Reference("verification-input", body);
  const verificationInputHash = verificationInputRef.slice("verification-input:".length);
  const outcome = outcomeFor({
    expected: input.expectedSuccessCondition,
    pre: input.preObservation,
    post: input.postObservation,
    decision: input.decision,
    policy: input.policyDecision.decision,
    actionCandidateId: input.action.candidateId,
    execution: input.executionReceipt,
  });
  const evidenceRefs = Array.from(new Set([
    input.preObservation.observationHash,
    ...(input.postObservation ? [input.postObservation.observationHash] : []),
    ...(input.executionReceipt.resultRef ? [input.executionReceipt.resultRef] : []),
    ...input.executionReceipt.evidenceRefs,
  ]));
  const evidenceBody = { verificationInputHash, ...outcome, evidenceRefs };
  const verificationEvidenceRef = sha256Reference("verification-evidence", evidenceBody);
  const verificationEvidenceHash = verificationEvidenceRef.slice("verification-evidence:sha256:".length);
  const verificationId = `verification:${verificationEvidenceHash}`;
  return Object.freeze({
    verificationId,
    verifierType: "spec208-independent",
    verifierVersion: "spec208-independent-v1",
    jobId,
    goal,
    decisionId: input.decision.decisionId,
    actionId,
    preObservationRef: input.preObservation.observationHash,
    postObservationRef: input.postObservation?.observationHash ?? null,
    evidenceRefs: Object.freeze(evidenceRefs) as unknown as string[],
    verificationInputHash,
    result: outcome.result,
    reasonCode: outcome.reasonCode,
    verificationEvidenceRef,
    verificationEvidenceHash,
    verifiedAt: input.verifiedAt ?? new Date().toISOString(),
  });
}

