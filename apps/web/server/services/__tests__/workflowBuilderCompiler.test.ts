import { describe, expect, it } from "vitest";
import {
  compileWorkflowIntent,
  acceptWorkflowCandidate,
  WorkflowCompilerError,
} from "../workflowBuilderCompiler";

describe("workflowBuilderCompiler", () => {
  it("returns bounded execution options and a deterministic candidate", () => {
    const result = compileWorkflowIntent({
      intent: "Summarize an uploaded document",
      options: [
        { id: "capability-document", typeId: "core.capability", binding: { kind: "capability", ref: "document.parse" }, ready: true, reasonCode: "READY" },
        { id: "model-summary", typeId: "ai.model", binding: { kind: "model", ref: "model.summary" }, ready: true, reasonCode: "READY" },
        { id: "browser", typeId: "automation.computer_use", binding: { kind: "computer-use-profile", ref: "browser.default" }, ready: false, reasonCode: "SETUP_REQUIRED" },
      ],
    });
    expect(result).toMatchObject({
      status: "draft",
      selectedOptionId: "capability-document",
      candidate: { nodes: expect.any(Array) },
    });
    expect(result.candidate).not.toHaveProperty("runnerId");
    expect(result.executionReadiness).toEqual({
      verified: false,
      reasonCode: "RUNTIME_READINESS_UNVERIFIED",
    });
  });

  it("blocks invalid candidates and accepts only once", () => {
    expect(() =>
      compileWorkflowIntent({ intent: "", options: [] })
    ).toThrowError(new WorkflowCompilerError("INTENT_REQUIRED"));
    const compiled = compileWorkflowIntent({
      intent: "Do work",
      options: [{ id: "ai.model", typeId: "ai.model", binding: { kind: "model", ref: "model.standard" }, ready: true, reasonCode: "READY" }],
    });
    expect(
      acceptWorkflowCandidate({
        candidateId: compiled.candidateId,
        idempotencyKey: "accept-1",
        candidate: compiled.candidate,
      })
    ).toMatchObject({ status: "accepted" });
    expect(
      acceptWorkflowCandidate({
        candidateId: compiled.candidateId,
        idempotencyKey: "accept-1",
        candidate: compiled.candidate,
      })
    ).toMatchObject({ status: "replayed" });
  });

  it("emits a canonical WorkflowDefinition instead of legacy nodeType values", () => {
    const result = compileWorkflowIntent({
      intent: "Summarize an uploaded document",
      options: [
        { id: "capability-document", typeId: "core.capability", binding: { kind: "capability", ref: "document.parse" }, ready: true, reasonCode: "READY" },
        { id: "model-summary", typeId: "ai.model", binding: { kind: "model", ref: "model.summary" }, ready: true, reasonCode: "READY" },
      ],
    });

    expect(result.candidate).toMatchObject({ schemaVersion: "2" });
    expect(result.candidate.nodes.every((node: any) =>
      typeof node.typeId === "string" && typeof node.typeVersion === "string"
    )).toBe(true);
    expect(JSON.stringify(result.candidate)).not.toMatch(/"nodeType"|feature-209-v1|"form"/);
  });

  it("does not synthesize a default binding when a canonical option lacks one", () => {
    expect(() => compileWorkflowIntent({
      intent: "Generate a summary",
      options: [{ id: "model-option", typeId: "ai.model", ready: true, reasonCode: "READY" }],
    })).toThrow("No concrete compatible binding");
  });

  it("never promotes client-asserted readiness to a ready execution status", () => {
    const result = compileWorkflowIntent({
      intent: "Generate a summary",
      options: [{ id: "unverified", typeId: "ai.model", binding: { kind: "model", ref: "tenant/nonexistent-model" }, ready: true, reasonCode: "CLIENT_SAYS_READY" }],
    });
    expect(result.status).toBe("draft");
    expect(result.executionReadiness).toEqual({ verified: false, reasonCode: "RUNTIME_READINESS_UNVERIFIED" });
  });
});
