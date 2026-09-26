import { randomUUID } from "node:crypto";

import { buildAutomationCopilotBrowserPolicyContext, evaluateBrowserPolicyRuntime } from "./browserPolicyRuntime";
import { normalizeBrowserObservation } from "./computerUseCandidateBuilder";
import { RulesDecisionProvider } from "./computerUseDecisionProvider";
import {
  buildSemanticActionCommand,
  buildSemanticObservePayload,
  semanticActionPolicyId,
  SEMANTIC_ACTION_STAGE,
  SEMANTIC_OBSERVE_STAGE,
  SEMANTIC_POST_ACTION_OBSERVE_STAGE,
} from "./computerUseSemanticHandshake";
import { resolveSemanticBrowserAction } from "./computerUseSemanticRuntime";
import { verifyComputerUseOutcome } from "./computerUseIndependentVerifier";
import type { RunnerJobCommand, RunnerJobReceipt } from "./runnerContracts";
import { validateRunnerJobCommand } from "./runnerJobCommandContracts";
import { classifyP213ApprovalDecision, type P213CertificationDescriptor } from "./p213CertificationApproval";
import { createP213ApprovalRequest, type P213ApprovalRequestResult } from "./p213ApprovalGateway";

type SemanticControlPlane = {
  getContext(jobId: string, scope?: { tenantId: string; requestedByUserId?: number }): Promise<any>;
  getStatus(jobId: string, scope?: { tenantId: string; requestedByUserId?: number }): Promise<any>;
  recordComputerUseSemanticStage(jobId: string, operationKey: string, stage: string, payload?: Record<string, unknown>): Promise<boolean>;
  advanceComputerUseRunnerStage(jobId: string, operationKey: string, input: { currentCommandId: string; nextCommandId: string; nextStage: string; metadata?: Record<string, unknown> }): Promise<boolean>;
  markComputerUseVerificationPending(jobId: string, operationKey: string, metadata?: Record<string, unknown>): Promise<boolean>;
  startComputerUseVerification(jobId: string, operationKey: string, verificationId: string): Promise<boolean>;
  completeComputerUseVerification(jobId: string, operationKey: string, input: { verificationId: string; result: "PASS" | "FAIL" | "REOBSERVE" | "INCONCLUSIVE"; reasonCode: string; verificationEvidenceRef: string }): Promise<"succeeded" | "waiting" | "ignored">;
  requestComputerUseApproval(jobId: string, input: {
    tenantId: string;
    operationKey: string;
    approvalRequestId: string;
    runnerId: string;
    runnerSessionId: string;
    capabilitySnapshotId: string;
    capabilitySnapshotRevision: string;
    currentCommandId: string;
    actionId: string;
    semanticState: Record<string, unknown>;
  }): Promise<"requested" | "duplicate" | "ignored">;
  failExternalWait(jobId: string, reason: string, operatorReviewRequired?: boolean, now?: Date, operationKey?: string): Promise<"failed" | "ignored">;
};

type DispatchCommand = (command: RunnerJobCommand) => Promise<{ status: "accepted" | "duplicate"; commandId: string }>;

function recordMetadata(status: any): Record<string, unknown> {
  const value = status?.progress?.externalWait?.metadata;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function hostnameFromOrigin(value: unknown): string {
  const origin = requiredString(value, "SEMANTIC_OBSERVATION_ORIGIN_REQUIRED");
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("SEMANTIC_OBSERVATION_ORIGIN_INVALID");
  }
  if (!parsed.hostname) throw new Error("SEMANTIC_OBSERVATION_ORIGIN_INVALID");
  return parsed.hostname.toLowerCase();
}

function baseCommandFromMetadata(metadata: Record<string, unknown>, payload: Record<string, unknown>): RunnerJobCommand {
  const template = asRecord(metadata.commandTemplate);
  const { authEvidenceRef, fenceVersion, ...commandTemplate } = template;
  return validateRunnerJobCommand({
    ...commandTemplate,
    authorizationGrantRef: commandTemplate.authorizationGrantRef ?? authEvidenceRef,
    fencingToken: commandTemplate.fencingToken ?? fenceVersion,
    payload,
  } as RunnerJobCommand);
}

function actionParameters(metadata: Record<string, unknown>): Record<string, unknown> {
  const intent = asRecord(metadata.semanticIntent);
  return typeof intent.text === "string" ? { text: intent.text } : {};
}

function semanticState(metadata: Record<string, unknown>): Record<string, unknown> {
  return asRecord(metadata.semanticState);
}

function operationKey(status: any): string {
  return requiredString(status?.progress?.externalWait?.operationKey, "SEMANTIC_OPERATION_KEY_REQUIRED");
}

function currentStage(receipt: RunnerJobReceipt): string | null {
  const stage = receipt.payload?.stage;
  return typeof stage === "string" ? stage : null;
}

async function dispatchNext(input: {
  controlPlane: SemanticControlPlane;
  dispatch: DispatchCommand;
  jobId: string;
  operationKey: string;
  currentCommandId: string;
  nextCommand: RunnerJobCommand;
  nextStage: string;
  metadata: Record<string, unknown>;
  beforeDispatch?: () => Promise<void>;
}): Promise<void> {
  const advanced = await input.controlPlane.advanceComputerUseRunnerStage(
    input.jobId,
    input.operationKey,
    {
      currentCommandId: input.currentCommandId,
      nextCommandId: input.nextCommand.commandId,
      nextStage: input.nextStage,
      metadata: input.metadata,
    },
  );
  if (!advanced) throw new Error("SEMANTIC_RUNNER_STAGE_ADVANCE_REJECTED");
  if (input.beforeDispatch) await input.beforeDispatch();
  try {
    await input.dispatch(input.nextCommand);
  } catch (error) {
    await input.controlPlane.failExternalWait(
      input.jobId,
      error instanceof Error ? error.message : "SEMANTIC_RUNNER_COMMAND_DISPATCH_FAILED",
      true,
      new Date(),
      input.operationKey,
    );
    throw error;
  }
}

/**
 * Handles only the semantic completion edges on the existing Runner receipt
 * channel. It never executes a browser operation; it either records lineage,
 * emits the next fenced command, or leaves the Feature 195 job non-terminal.
 */
export async function handleSemanticRunnerReceipt(input: {
  receipt: RunnerJobReceipt;
  tenantId: string;
  controlPlane: SemanticControlPlane;
  dispatch: DispatchCommand;
  createApprovalRequest?: (request: Parameters<typeof createP213ApprovalRequest>[0]) => Promise<P213ApprovalRequestResult>;
}): Promise<boolean> {
  const stage = currentStage(input.receipt);
  if (!stage || input.receipt.eventType !== "EXECUTION_COMPLETED") return false;
  const context = await input.controlPlane.getContext(input.receipt.jobId, { tenantId: input.tenantId });
  if (!context || context.jobType !== "computer_use.browser") return false;
  const status = await input.controlPlane.getStatus(input.receipt.jobId, { tenantId: context.tenantId });
  if (!status || status.terminal) return false;
  const metadata = recordMetadata(status);
  if (metadata.commandId !== input.receipt.commandId) return false;
  const key = operationKey(status);

  if (stage === SEMANTIC_OBSERVE_STAGE) {
    const rawObservation = input.receipt.payload?.observation;
    if (!rawObservation) throw new Error("SEMANTIC_OBSERVATION_RECEIPT_REQUIRED");
    const intent = asRecord(metadata.semanticIntent);
    const decisionRequest = asRecord(metadata.decisionRequest);
    const goal = requiredString(decisionRequest.goal ?? intent.goal, "SEMANTIC_GOAL_REQUIRED");
    const allowedActionFamilies = Array.isArray(decisionRequest.allowedActionFamilies)
      ? decisionRequest.allowedActionFamilies.map(value => requiredString(value, "SEMANTIC_ACTION_FAMILY_INVALID"))
      : ["click"];
    const maxCandidates = Number(decisionRequest.maxCandidates ?? 32);
    const observation = rawObservation as Parameters<typeof resolveSemanticBrowserAction>[0]["rawObservation"];
    const policyContext = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: context.tenantId,
      ...(context.requestedByUserId === undefined ? {} : { userId: context.requestedByUserId }),
      executionId: context.jobId,
      allowedDomains: [hostnameFromOrigin((rawObservation as Record<string, unknown>).origin)],
    });
    const semantic = await resolveSemanticBrowserAction({
      rawObservation: observation,
      subgoal: goal,
      allowedActionFamilies,
      maxCandidates,
      decisionProvider: new RulesDecisionProvider(),
      tenantId: context.tenantId,
      ...(context.requestedByUserId === undefined ? {} : { userId: context.requestedByUserId }),
      executionId: context.jobId,
      traceId: requiredString(metadata.traceId, "SEMANTIC_TRACE_REQUIRED"),
      evaluatePolicy: policyInput => evaluateBrowserPolicyRuntime({
        ...policyInput,
        actionDescription: `${policyInput.actionType} semantic candidate`,
        normalizedAction: { actionType: policyInput.actionType, targetOrigin: policyInput.targetOrigin },
        payloadPreview: {},
        policyContext,
      }).decision,
    });
    await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "OBSERVATION_RECEIVED", {
      observationId: semantic.observation.observationId,
      observationRevision: semantic.observation.revision,
      observationRef: semantic.observation.observationHash,
    });
    await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "CANDIDATE_SET_CREATED", {
      candidateSetId: semantic.candidateSet.candidateSetId,
      candidateSetHash: semantic.candidateSet.candidateSetHash,
      observationId: semantic.candidateSet.observationId,
      observationRevision: semantic.candidateSet.observationRevision,
    });
    await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "DECISION_COMPLETED", {
      decisionId: semantic.decision.decisionId,
      decisionEvidenceRef: semantic.decision.decisionEvidenceRef,
      selectedCandidateId: semantic.decision.selectedCandidateId,
      observationId: semantic.decision.observationId,
      observationRevision: semantic.decision.observationRevision,
      candidateSetId: semantic.decision.candidateSetId,
      candidateSetHash: semantic.decision.candidateSetHash,
    });
    if (semantic.status !== "READY_TO_EXECUTE" || !semantic.selectedCandidate || !semantic.policyDecision) {
      await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "POLICY_DECISION_COMPLETED", {
        decision: semantic.policyDecision?.decision ?? "no_match",
        reason: semantic.blockReason ?? "NO_MATCH",
      });
      await input.controlPlane.failExternalWait(input.receipt.jobId, semantic.blockReason ?? "SEMANTIC_NO_MATCH", true, new Date(), key);
      return true;
    }
    const base = baseCommandFromMetadata(metadata, {
      stage: SEMANTIC_OBSERVE_STAGE,
      correlation: metadata.correlation ?? {},
      requiresIndependentVerification: true,
      verification: metadata.verification ?? { required: true, verifier: "spec208-independent-v1", mode: "post_observation" },
      ...(metadata.fixtureUrl ? { fixtureUrl: metadata.fixtureUrl } : {}),
    });
    const action = buildSemanticActionCommand({
      baseCommand: base,
      observation: semantic.observation,
      candidateSet: semantic.candidateSet,
      decision: semantic.decision,
      policyDecision: {
        ...semantic.policyDecision,
        policyDecisionId: semanticActionPolicyId(semantic.policyDecision),
      },
      selectedCandidate: semantic.selectedCandidate,
      actionParameters: actionParameters(metadata),
    });
    const certifiedPolicyDecision = classifyP213ApprovalDecision(
      semantic.policyDecision,
      metadata.p213Certification,
    );
    const state = {
      preObservation: semantic.observation,
      candidateSet: semantic.candidateSet,
      decision: semantic.decision,
      policyDecision: {
        ...semantic.policyDecision,
        policyDecisionId: semanticActionPolicyId(semantic.policyDecision),
      },
      selectedCandidate: semantic.selectedCandidate,
      actionId: (action.payload as any).lineage.actionId,
      actionCommandId: action.commandId,
    };
    await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "POLICY_DECISION_COMPLETED", {
      policyDecisionId: semanticActionPolicyId(semantic.policyDecision),
      decision: certifiedPolicyDecision.decision,
      reasonCodes: certifiedPolicyDecision.reasonCodes,
    });
    if (certifiedPolicyDecision.decision === "require_approval") {
      const lineage = (action.payload as { lineage: {
        actionId: string;
        actionType: string;
        targetRef: string;
        targetIdentity: string;
      } }).lineage;
      const descriptor = metadata.p213Certification as P213CertificationDescriptor;
      const approval = await (input.createApprovalRequest ?? createP213ApprovalRequest)({
        jobId: input.receipt.jobId,
        tenantId: context.tenantId,
        requesterId: context.requestedByUserId ?? descriptor.requesterId,
        approvalDescriptor: descriptor,
        operationKey: key,
        runnerId: input.receipt.runnerId,
        runnerSessionId: input.receipt.runnerSessionId,
        capabilitySnapshotId: action.capabilitySnapshotId,
        capabilitySnapshotRevision: action.capabilitySnapshotRevision,
        fencingVersion: action.fencingToken,
        actionId: lineage.actionId,
        actionDescription: `${lineage.actionType} ${lineage.targetIdentity}`,
        actionDigest: certifiedPolicyDecision.evidence.actionDigest,
        domFingerprint: semantic.observation.observationHash,
        correlationKey: `p213:${input.receipt.jobId}:${lineage.actionId}`,
      });
      if (approval.status !== "pending") throw new Error("P213_APPROVAL_REQUEST_NOT_PENDING");
      const requested = await input.controlPlane.requestComputerUseApproval(input.receipt.jobId, {
        tenantId: context.tenantId,
        operationKey: key,
        approvalRequestId: approval.approvalRequestId,
        runnerId: input.receipt.runnerId,
        runnerSessionId: input.receipt.runnerSessionId,
        capabilitySnapshotId: action.capabilitySnapshotId,
        capabilitySnapshotRevision: action.capabilitySnapshotRevision,
        currentCommandId: input.receipt.commandId,
        actionId: lineage.actionId,
        semanticState: state,
      });
      if (requested === "ignored") throw new Error("P213_APPROVAL_PROJECTION_REJECTED");
      await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "APPROVAL_REQUESTED", {
        approvalRequestId: approval.approvalRequestId,
        actionId: lineage.actionId,
        decision: certifiedPolicyDecision.decision,
        reasonCodes: certifiedPolicyDecision.reasonCodes,
      });
      return true;
    }
    await dispatchNext({
      controlPlane: input.controlPlane,
      dispatch: input.dispatch,
      jobId: input.receipt.jobId,
      operationKey: key,
      currentCommandId: input.receipt.commandId,
      nextCommand: action,
      nextStage: SEMANTIC_ACTION_STAGE,
      metadata: { semanticState: state },
      beforeDispatch: async () => {
        await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "ACTION_DISPATCHED", {
          actionId: state.actionId,
          commandId: action.commandId,
          observationId: semantic.observation.observationId,
          observationRevision: semantic.observation.revision,
          candidateSetId: semantic.candidateSet.candidateSetId,
          candidateSetHash: semantic.candidateSet.candidateSetHash,
          decisionId: semantic.decision.decisionId,
          selectedCandidateId: semantic.selectedCandidate.candidateId,
          policyDecisionId: semanticActionPolicyId(semantic.policyDecision),
        });
      },
    });
    return true;
  }

  if (stage === SEMANTIC_ACTION_STAGE) {
    const state = semanticState(metadata);
    const preObservation = state.preObservation as Parameters<typeof verifyComputerUseOutcome>[0]["preObservation"];
    const decision = state.decision as Parameters<typeof verifyComputerUseOutcome>[0]["decision"];
    const policyDecision = state.policyDecision as Parameters<typeof verifyComputerUseOutcome>[0]["policyDecision"];
    const selectedCandidate = state.selectedCandidate as { candidateId: string };
    const actionId = requiredString(state.actionId, "SEMANTIC_ACTION_ID_REQUIRED");
    await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "ACTION_COMPLETED", {
      actionId,
      resultRef: input.receipt.resultRef ?? `runner-receipt:${input.receipt.eventId}`,
      evidenceRefs: input.receipt.evidenceRefs ?? [],
    });
    const base = baseCommandFromMetadata(metadata, {
      ...buildSemanticObservePayload({
        goal: requiredString(asRecord(metadata.decisionRequest).goal, "SEMANTIC_GOAL_REQUIRED"),
        allowedActionFamilies: Array.isArray(asRecord(metadata.decisionRequest).allowedActionFamilies)
          ? (asRecord(metadata.decisionRequest).allowedActionFamilies as unknown[]).map(value => String(value))
          : ["click"],
        maxCandidates: Number(asRecord(metadata.decisionRequest).maxCandidates ?? 32),
        postAction: true,
        minimumRevision: Number(preObservation.revision) + 1,
      }),
      correlation: metadata.correlation ?? {},
      requiresIndependentVerification: true,
      verification: metadata.verification ?? { required: true, verifier: "spec208-independent-v1", mode: "post_observation" },
      ...(metadata.fixtureUrl ? { fixtureUrl: metadata.fixtureUrl } : {}),
    });
    const postObserve = validateRunnerJobCommand({
      ...base,
      commandId: randomUUID(),
      idempotencyKey: `${base.idempotencyKey}:post-observation:${actionId}`,
    });
    await dispatchNext({
      controlPlane: input.controlPlane,
      dispatch: input.dispatch,
      jobId: input.receipt.jobId,
      operationKey: key,
      currentCommandId: input.receipt.commandId,
      nextCommand: postObserve,
      nextStage: SEMANTIC_POST_ACTION_OBSERVE_STAGE,
      metadata: { semanticState: { ...state, executionReceipt: { status: "completed", resultRef: input.receipt.resultRef, evidenceRefs: input.receipt.evidenceRefs ?? [] } } },
    });
    return true;
  }

  if (stage === SEMANTIC_POST_ACTION_OBSERVE_STAGE) {
    const state = semanticState(metadata);
    const rawPostObservation = input.receipt.payload?.observation;
    if (!rawPostObservation) throw new Error("SEMANTIC_POST_OBSERVATION_RECEIPT_REQUIRED");
    const postObservation = normalizeBrowserObservation(
      rawPostObservation as Parameters<typeof normalizeBrowserObservation>[0],
    );
    const receipt = state.executionReceipt as Parameters<typeof verifyComputerUseOutcome>[0]["executionReceipt"];
    const verification = verifyComputerUseOutcome({
      jobId: input.receipt.jobId,
      goal: requiredString(asRecord(metadata.decisionRequest).goal, "SEMANTIC_GOAL_REQUIRED"),
      expectedSuccessCondition: asRecord(asRecord(metadata.decisionRequest).expectedSuccessCondition),
      preObservation: state.preObservation as Parameters<typeof verifyComputerUseOutcome>[0]["preObservation"],
      postObservation,
      decision: state.decision as Parameters<typeof verifyComputerUseOutcome>[0]["decision"],
      policyDecision: state.policyDecision as Parameters<typeof verifyComputerUseOutcome>[0]["policyDecision"],
      action: { actionId: requiredString(state.actionId, "SEMANTIC_ACTION_ID_REQUIRED"), candidateId: requiredString((state.selectedCandidate as any).candidateId, "SEMANTIC_SELECTED_CANDIDATE_REQUIRED") },
      executionReceipt: receipt,
    });
    await input.controlPlane.recordComputerUseSemanticStage(input.receipt.jobId, key, "POST_ACTION_OBSERVATION", {
      observationId: postObservation.observationId,
      observationRevision: postObservation.revision,
      observationRef: postObservation.observationHash,
    });
    await input.controlPlane.markComputerUseVerificationPending(input.receipt.jobId, key, {
      verificationId: verification.verificationId,
      decisionId: verification.decisionId,
      actionId: verification.actionId,
      preObservationRef: verification.preObservationRef,
      postObservationRef: verification.postObservationRef,
      verificationInputHash: verification.verificationInputHash,
      verifierType: verification.verifierType,
      verifierVersion: verification.verifierVersion,
    });
    await input.controlPlane.startComputerUseVerification(input.receipt.jobId, key, verification.verificationId);
    await input.controlPlane.completeComputerUseVerification(input.receipt.jobId, key, {
      verificationId: verification.verificationId,
      result: verification.result,
      reasonCode: verification.reasonCode,
      verificationEvidenceRef: verification.verificationEvidenceRef,
    });
    return true;
  }

  return false;
}
