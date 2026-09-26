import { describe, expect, it, vi } from "vitest";

const { mockBuildPolicyContext, mockEvaluatePolicy } = vi.hoisted(() => ({
  mockBuildPolicyContext: vi.fn(),
  mockEvaluatePolicy: vi.fn(),
}));

vi.mock("../browserPolicyRuntime", () => ({
  buildAutomationCopilotBrowserPolicyContext: mockBuildPolicyContext,
  evaluateBrowserPolicyRuntime: mockEvaluatePolicy,
}));

import { handleSemanticRunnerReceipt } from "../computerUseSemanticHandshakeRuntime";

const observation = {
  observationId: "observation-runtime-1",
  revision: 1,
  observedAt: "2026-09-21T00:00:00.000Z",
  origin: "https://smartaihub.app",
  url: "https://smartaihub.app/fixture",
  browserGeneration: "browser-generation-1",
  elements: [{
    targetRef: "candidate-0",
    role: "button",
    name: "Continue",
    visible: true,
    enabled: true,
    occluded: false,
    frameId: "main",
    supportedActionFamilies: ["click"],
  }],
};

function commandTemplate() {
  return {
    commandId: "observe-1",
    commandType: "execute",
    contractVersion: "runner-job-v1",
    jobId: "job-runtime-1",
    attempt: 1,
    leaseId: "lease-runtime-1",
    fenceVersion: 4,
    tenantId: "tenant-runtime-1",
    userId: 109,
    runnerId: "runner-runtime-1",
    runnerSessionId: "session-runtime-1",
    capabilitySnapshotId: "snapshot-runtime-1",
    capabilitySnapshotRevision: "revision-runtime-1",
    controlPlaneOrigin: "http://localhost:3000",
    executionKind: "computer_use.browser",
    adapterId: "browser.v1",
    adapterVersionConstraint: "0.1.0",
    browserEngineConstraint: "chromium",
    idempotencyKey: "computer-use:job-runtime-1:1",
    deadline: "2099-01-01T00:00:00.000Z",
    authEvidenceRef: "runner-auth:sha256:runtime",
    inputRef: "runner-input:job-runtime-1:attempt-1",
    payload: {},
  };
}

function allowPolicy() {
  return {
    version: "2026-03-10",
    tenantId: "tenant-runtime-1",
    userId: 109,
    workflowId: 0,
    executionId: "job-runtime-1",
    traceId: "trace-runtime-1",
    actionType: "click",
    actionClass: "read",
    pageSensitivity: "none",
    decision: "allow",
    reasonCodes: [],
    confidence: 1,
    riskScore: 0,
    evidence: { actionDigest: "decision:sha256:runtime" },
    approval: { required: false },
  } as const;
}

describe("P213-B0.6 semantic receipt runtime", () => {
  it("does not dispatch action until a real observation receipt resolves decision and policy", async () => {
    mockBuildPolicyContext.mockResolvedValueOnce({ entitlement: {} });
    mockEvaluatePolicy.mockReturnValueOnce({ decision: allowPolicy() });

    const metadata: Record<string, unknown> = {
      commandId: "observe-1",
      traceId: "trace-runtime-1",
      correlation: { traceId: "trace-runtime-1" },
      semanticIntent: { goal: "click Continue" },
      decisionRequest: { goal: "click Continue", allowedActionFamilies: ["click"], maxCandidates: 8 },
      verification: { required: true, verifier: "spec208-independent-v1", mode: "post_observation" },
      fixtureUrl: "https://smartaihub.app/fixture",
      commandTemplate: commandTemplate(),
    };
    const statuses = [{
      terminal: false,
      progress: { externalWait: { operationKey: "computer-use:job-runtime-1:1", metadata } },
    }];
    const recordedStages: string[] = [];
    const dispatched: any[] = [];
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-runtime-1", tenantId: "tenant-runtime-1", requestedByUserId: 109, jobType: "computer_use.browser" }),
      getStatus: vi.fn().mockImplementation(async () => statuses[0]),
      recordComputerUseSemanticStage: vi.fn().mockImplementation(async (_job, _key, stage) => {
        recordedStages.push(stage);
        return true;
      }),
      advanceComputerUseRunnerStage: vi.fn().mockImplementation(async (_job, _key, input) => {
        statuses[0]!.progress.externalWait.metadata = { ...metadata, ...input.metadata, commandId: input.nextCommandId };
        return true;
      }),
      markComputerUseVerificationPending: vi.fn(),
      startComputerUseVerification: vi.fn(),
      completeComputerUseVerification: vi.fn(),
      failExternalWait: vi.fn(),
    };

    await expect(handleSemanticRunnerReceipt({
      tenantId: "tenant-runtime-1",
      receipt: {
        eventId: "receipt-observe-1",
        eventType: "EXECUTION_COMPLETED",
        commandId: "observe-1",
        jobId: "job-runtime-1",
        runnerId: "runner-runtime-1",
        runnerSessionId: "session-runtime-1",
        sequence: 4,
        observedAt: "2026-09-21T00:00:01.000Z",
        status: "completed",
        resultRef: "result:sha256:observe",
        evidenceRefs: ["observation:sha256:observe"],
        payload: { stage: "observe", observation },
      },
      controlPlane,
      dispatch: vi.fn().mockImplementation(async command => {
        dispatched.push(command);
        return { status: "accepted", commandId: command.commandId };
      }),
    })).resolves.toBe(true);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      authorizationGrantRef: "runner-auth:sha256:runtime",
      controlPlaneOrigin: "http://localhost:3000",
      fencingToken: 4,
    });
    expect(dispatched[0].payload).toMatchObject({
      stage: "action",
      lineage: {
        observationId: "observation-runtime-1",
        observationRevision: 1,
        selectedCandidateId: expect.any(String),
        decisionId: expect.any(String),
        policyDecisionId: expect.any(String),
        actionId: expect.any(String),
      },
    });
    expect(recordedStages).toEqual([
      "OBSERVATION_RECEIVED",
      "CANDIDATE_SET_CREATED",
      "DECISION_COMPLETED",
      "POLICY_DECISION_COMPLETED",
      "ACTION_DISPATCHED",
    ]);
    expect(mockBuildPolicyContext).toHaveBeenCalledWith(expect.objectContaining({
      allowedDomains: ["smartaihub.app"],
    }));
    expect(controlPlane.failExternalWait).not.toHaveBeenCalled();
  });

  it("routes action completion to post-action observation and verifier finality", async () => {
    mockBuildPolicyContext.mockResolvedValueOnce({ entitlement: {} });
    mockEvaluatePolicy.mockReturnValueOnce({ decision: allowPolicy() });
    const metadata: Record<string, unknown> = {
      commandId: "observe-2",
      traceId: "trace-runtime-2",
      correlation: { traceId: "trace-runtime-2" },
      semanticIntent: { goal: "click Continue" },
      decisionRequest: { goal: "click Continue", allowedActionFamilies: ["click"], maxCandidates: 8 },
      verification: { required: true, verifier: "spec208-independent-v1", mode: "post_observation" },
      fixtureUrl: "https://smartaihub.app/fixture",
      commandTemplate: { ...commandTemplate(), commandId: "observe-2", idempotencyKey: "computer-use:job-runtime-2:1", jobId: "job-runtime-2" },
    };
    const status = { terminal: false, progress: { externalWait: { operationKey: "computer-use:job-runtime-2:1", metadata } } };
    const dispatch = vi.fn().mockResolvedValue({ status: "accepted", commandId: "next" });
    const semanticStagePayloads: Record<string, Record<string, unknown>> = {};
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-runtime-2", tenantId: "tenant-runtime-1", requestedByUserId: 109, jobType: "computer_use.browser" }),
      getStatus: vi.fn().mockResolvedValue(status),
      recordComputerUseSemanticStage: vi.fn().mockImplementation(async (_job, _key, stage, payload) => {
        semanticStagePayloads[stage] = payload;
        return true;
      }),
      advanceComputerUseRunnerStage: vi.fn().mockImplementation(async (_job, _key, input) => {
        status.progress.externalWait.metadata = { ...metadata, ...input.metadata, commandId: input.nextCommandId };
        return true;
      }),
      markComputerUseVerificationPending: vi.fn().mockResolvedValue(true),
      startComputerUseVerification: vi.fn().mockResolvedValue(true),
      completeComputerUseVerification: vi.fn().mockResolvedValue("succeeded"),
      failExternalWait: vi.fn(),
    };
    const observeReceipt = {
      eventId: "receipt-observe-2",
      eventType: "EXECUTION_COMPLETED" as const,
      commandId: "observe-2",
      jobId: "job-runtime-2",
      runnerId: "runner-runtime-1",
      runnerSessionId: "session-runtime-1",
      sequence: 4,
      observedAt: "2026-09-21T00:00:01.000Z",
      status: "completed" as const,
      payload: { stage: "observe", observation },
    };
    await handleSemanticRunnerReceipt({ tenantId: "tenant-runtime-1", receipt: observeReceipt, controlPlane, dispatch });
    const actionCommandId = (status.progress.externalWait.metadata as any).commandId;
    await handleSemanticRunnerReceipt({
      tenantId: "tenant-runtime-1",
      receipt: {
        ...observeReceipt,
        eventId: "receipt-action-2",
        commandId: actionCommandId,
        sequence: 3,
        payload: { stage: "action" },
        resultRef: "result:sha256:action",
        evidenceRefs: ["action:sha256:action"],
      },
      controlPlane,
      dispatch,
    });
    const postObserveCommandId = (status.progress.externalWait.metadata as any).commandId;
    await handleSemanticRunnerReceipt({
      tenantId: "tenant-runtime-1",
      receipt: {
        ...observeReceipt,
        eventId: "receipt-post-2",
        commandId: postObserveCommandId,
        sequence: 3,
        payload: { stage: "post_action_observe", observation: { ...observation, observationId: "observation-runtime-2", revision: 2 } },
      },
      controlPlane,
      dispatch,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(semanticStagePayloads.POST_ACTION_OBSERVATION?.observationRef).toEqual(expect.stringContaining("observation:sha256:"));
    expect(controlPlane.markComputerUseVerificationPending).toHaveBeenCalledOnce();
    expect(controlPlane.startComputerUseVerification).toHaveBeenCalledOnce();
    expect(controlPlane.completeComputerUseVerification).toHaveBeenCalledWith(
      "job-runtime-2",
      "computer-use:job-runtime-2:1",
      expect.objectContaining({ result: "PASS" }),
    );
  });

  it("holds a validated certification action for approval before any Runner dispatch", async () => {
    mockBuildPolicyContext.mockResolvedValueOnce({ entitlement: {} });
    mockEvaluatePolicy.mockReturnValueOnce({ decision: allowPolicy() });
    const metadata: Record<string, unknown> = {
      commandId: "observe-approval",
      traceId: "trace-approval",
      correlation: { traceId: "trace-approval" },
      semanticIntent: { goal: "click Continue" },
      decisionRequest: { goal: "click Continue", allowedActionFamilies: ["click"], maxCandidates: 8 },
      verification: { required: true, verifier: "spec208-independent-v1", mode: "post_observation" },
      fixtureUrl: "https://smartaihub.app/fixture",
      p213Certification: {
        purpose: "p213_certification",
        fixture: "approval_required",
        riskClass: "explicit_approval_test",
        issuedBy: "server",
        tenantId: "tenant-runtime-1",
        requesterId: 109,
        projectRef: "p213-certification",
      },
      commandTemplate: { ...commandTemplate(), commandId: "observe-approval", jobId: "job-approval" },
    };
    const status = { terminal: false, progress: { externalWait: { operationKey: "computer-use:job-approval:1", metadata } } };
    const dispatch = vi.fn().mockResolvedValue({ status: "accepted", commandId: "action-approval" });
    const createApprovalRequest = vi.fn().mockResolvedValue({ approvalRequestId: "approval-p213", status: "pending", correlationKey: "p213:job-approval:action" });
    const controlPlane = {
      getContext: vi.fn().mockResolvedValue({ jobId: "job-approval", tenantId: "tenant-runtime-1", requestedByUserId: 109, jobType: "computer_use.browser" }),
      getStatus: vi.fn().mockResolvedValue(status),
      recordComputerUseSemanticStage: vi.fn().mockResolvedValue(true),
      advanceComputerUseRunnerStage: vi.fn(),
      requestComputerUseApproval: vi.fn().mockResolvedValue("requested"),
      markComputerUseVerificationPending: vi.fn(),
      startComputerUseVerification: vi.fn(),
      completeComputerUseVerification: vi.fn(),
      failExternalWait: vi.fn(),
    };

    await expect(handleSemanticRunnerReceipt({
      tenantId: "tenant-runtime-1",
      receipt: {
        eventId: "receipt-observe-approval",
        eventType: "EXECUTION_COMPLETED",
        commandId: "observe-approval",
        jobId: "job-approval",
        runnerId: "runner-runtime-1",
        runnerSessionId: "session-runtime-1",
        sequence: 4,
        observedAt: "2026-09-21T00:00:01.000Z",
        status: "completed",
        payload: { stage: "observe", observation },
      },
      controlPlane,
      dispatch,
      createApprovalRequest,
    })).resolves.toBe(true);

    expect(createApprovalRequest).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job-approval",
      tenantId: "tenant-runtime-1",
      actionId: expect.any(String),
      approvalDescriptor: metadata.p213Certification,
    }));
    expect(controlPlane.requestComputerUseApproval).toHaveBeenCalledWith(
      "job-approval",
      expect.objectContaining({ approvalRequestId: "approval-p213", actionId: expect.any(String) }),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(controlPlane.advanceComputerUseRunnerStage).not.toHaveBeenCalled();
    expect(controlPlane.failExternalWait).not.toHaveBeenCalled();
  });
});
