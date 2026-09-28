import { describe, expect, it } from "vitest";

import { RulesDecisionProvider } from "../computerUseDecisionProvider";
import {
  buildSemanticActionCommand,
  buildSemanticObservePayload,
  validateCurrentSemanticAction,
} from "../computerUseSemanticHandshake";
import { buildBoundedBrowserCandidateSet, normalizeBrowserObservation } from "../computerUseCandidateBuilder";
import type { BrowserPolicyDecisionEnvelope } from "../../../shared/browserPolicy";

const observation = normalizeBrowserObservation({
  observationId: "obs-handshake-1",
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
});
const candidateSet = buildBoundedBrowserCandidateSet({
  observation,
  subgoal: "click Continue",
  allowedActionFamilies: ["click"],
  maxCandidates: 8,
});
const candidate = candidateSet.candidates[0]!;
const decisionPromise = new RulesDecisionProvider().choose({
  requestedProvider: "rules",
  goal: "click Continue",
  observation,
  candidateSet,
});

function baseCommand(): any {
  return {
    commandId: "command-observe",
    commandType: "execute",
    contractVersion: "runner-job-v1",
    jobId: "job-handshake",
    attempt: 1,
    leaseId: "lease:job-handshake:attempt-1",
    fencingToken: 4,
    tenantId: "tenant-handshake",
    userId: 109,
    runnerId: "runner-handshake",
    runnerSessionId: "session-handshake",
    capabilitySnapshotId: "snapshot-handshake",
    capabilitySnapshotRevision: "revision-1",
    controlPlaneOrigin: "http://localhost:3000",
    executionKind: "computer_use.browser",
    adapterId: "browser.v1",
    adapterVersionConstraint: "0.1.0",
    browserEngineConstraint: "chromium",
    idempotencyKey: "computer-use:job-handshake:1",
    deadline: "2099-01-01T00:00:00.000Z",
    authorizationGrantRef: "runner-auth:sha256:grant",
    inputRef: "runner-input:job-handshake:attempt-1",
    payload: {
      stage: "observe",
      fixtureUrl: "https://smartaihub.app/fixture",
      correlation: { traceId: "trace-handshake" },
      requiresIndependentVerification: true,
      verification: { required: true, verifier: "spec208-independent-v1", mode: "post_observation" },
    },
  };
}

function allowPolicy(): BrowserPolicyDecisionEnvelope {
  return {
    version: "2026-03-10",
    tenantId: "tenant-handshake",
    userId: 109,
    workflowId: 0,
    executionId: "job-handshake",
    traceId: "trace-handshake",
    actionType: "click",
    actionClass: "read",
    pageSensitivity: "none",
    decision: "allow",
    reasonCodes: [],
    confidence: 1,
    riskScore: 0,
    evidence: { actionDigest: "decision:sha256:action" },
    approval: { required: false },
  };
}

describe("P213-B0.6 semantic handshake", () => {
  it("makes Stage A intent-only and never carries an executable browser action", () => {
    const payload = buildSemanticObservePayload({
      goal: "click Continue",
      allowedActionFamilies: ["click"],
      maxCandidates: 8,
    });
    expect(payload).toMatchObject({ stage: "observe", observationRequest: { goal: "click Continue" } });
    expect(payload).not.toHaveProperty("action");
    expect(payload).not.toHaveProperty("targetId");
    expect(payload).not.toHaveProperty("selector");
  });

  it("creates a backend-authorized action only from DecisionProvider and policy lineage", async () => {
    const decision = await decisionPromise;
    const command = buildSemanticActionCommand({
      baseCommand: baseCommand(),
      observation,
      candidateSet,
      decision,
      policyDecision: allowPolicy(),
      selectedCandidate: candidate,
    });
    expect(command.payload).toMatchObject({ stage: "action" });
    expect(command.payload).toHaveProperty("fixtureUrl", "https://smartaihub.app/fixture");
    expect(command.payload).not.toHaveProperty("targetId");
    expect((command.payload as any).lineage).toMatchObject({
      jobId: "job-handshake",
      observationId: "obs-handshake-1",
      observationRevision: 1,
      candidateSetId: candidateSet.candidateSetId,
      candidateSetHash: candidateSet.candidateSetHash,
      decisionId: decision.decisionId,
      selectedCandidateId: candidate.candidateId,
      actionType: "click",
    });
  });

  it.each([
    ["decisionId", (command: any) => { delete command.payload.lineage.decisionId; }],
    ["policyDecisionId", (command: any) => { delete command.payload.lineage.policyDecisionId; }],
    ["candidateSetHash", (command: any) => { command.payload.lineage.candidateSetHash = "candidate-set:sha256:stale"; }],
  ])("rejects action with invalid %s", async (_name, mutate) => {
    const decision = await decisionPromise;
    const command = buildSemanticActionCommand({
      baseCommand: baseCommand(),
      observation,
      candidateSet,
      decision,
      policyDecision: allowPolicy(),
      selectedCandidate: candidate,
    });
    mutate(command);
    expect(() => validateCurrentSemanticAction({
      command,
      currentObservation: observation,
      currentRunnerSessionId: "session-handshake",
      currentCapabilitySnapshotId: "snapshot-handshake",
      currentCapabilitySnapshotRevision: "revision-1",
      currentFencingToken: 4,
    })).toThrow();
  });

  it("rejects a replaced Runner session or a mutated observation", async () => {
    const decision = await decisionPromise;
    const command = buildSemanticActionCommand({
      baseCommand: baseCommand(),
      observation,
      candidateSet,
      decision,
      policyDecision: allowPolicy(),
      selectedCandidate: candidate,
    });
    expect(() => validateCurrentSemanticAction({
      command,
      currentObservation: observation,
      currentRunnerSessionId: "replaced-session",
      currentCapabilitySnapshotId: "snapshot-handshake",
      currentCapabilitySnapshotRevision: "revision-1",
      currentFencingToken: 4,
    })).toThrow("SEMANTIC_ACTION_RUNTIME_BINDING_STALE");
    expect(() => validateCurrentSemanticAction({
      command,
      currentObservation: { ...observation, revision: 2 },
      currentRunnerSessionId: "session-handshake",
      currentCapabilitySnapshotId: "snapshot-handshake",
      currentCapabilitySnapshotRevision: "revision-1",
      currentFencingToken: 4,
    })).toThrow("SEMANTIC_ACTION_OBSERVATION_STALE");
  });

  it("does not build an action for a denied policy", async () => {
    const decision = await decisionPromise;
    expect(() => buildSemanticActionCommand({
      baseCommand: baseCommand(),
      observation,
      candidateSet,
      decision,
      policyDecision: { ...allowPolicy(), decision: "deny" },
      selectedCandidate: candidate,
    })).toThrow("SEMANTIC_POLICY_NOT_ACTIONABLE");
  });
});
