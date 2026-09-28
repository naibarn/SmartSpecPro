import { describe, expect, it } from "vitest";
import {
  AgentRuntimeClientError,
  verifyAgentRuntimeResponseForRequest,
} from "../client";

const assurance = {
  contractVersion: 1,
  contractId: "contract-1",
  attemptId: "attempt-1",
  taskKind: "video_prompt",
  contractHash: "a".repeat(64),
  evidencePolicy: { requiredPurposes: [], requireVisionFor: [] },
  evidence: [],
  outputContract: { schemaRef: "video.prompt" },
  budget: {},
  rulePackIds: [],
  sideEffectPolicy: "read_only",
  repairAttempts: 0,
} as any;

const request = {
  allowedSkills: [],
  allowedTools: [],
  allowedAgents: [],
  requestId: "request-1",
  surface: "skill",
  stepContext: null,
  gatewayInvocationMetadata: null,
  productionAgentsSdkCapabilityManifest: null,
  assurance,
} as any;

const response = {
  status: "completed",
  runtimeContractVersion: 2,
  traceSchemaVersion: 2,
  checkpointSchemaVersion: 2,
} as any;

describe("verifyAgentRuntimeResponseForRequest assurance boundary", () => {
  it("rejects a completed runtime response that omits the assurance result", () => {
    expect(() => verifyAgentRuntimeResponseForRequest(request, response)).toThrow(
      AgentRuntimeClientError,
    );
    try {
      verifyAgentRuntimeResponseForRequest(request, response);
    } catch (error) {
      expect((error as AgentRuntimeClientError).code).toBe("assurance_result_missing");
    }
  });

  it("rejects an assurance result for a different attempt", () => {
    let caught: unknown = null;
    try {
      verifyAgentRuntimeResponseForRequest(request, {
        ...response,
        assurance: { attemptId: "attempt-2", contractHash: null },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AgentRuntimeClientError);
    expect((caught as AgentRuntimeClientError).code).toBe("assurance_attempt_mismatch");
  });

  it("rejects an assurance result that omits the request contract hash", () => {
    let caught: unknown = null;
    try {
      verifyAgentRuntimeResponseForRequest(request, {
        ...response,
        assurance: { attemptId: "attempt-1", contractHash: null },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AgentRuntimeClientError);
    expect((caught as AgentRuntimeClientError).code).toBe(
      "assurance_contract_hash_mismatch",
    );
  });
});
