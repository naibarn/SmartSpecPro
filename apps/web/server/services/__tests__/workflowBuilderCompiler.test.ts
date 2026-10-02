import { describe, expect, it } from "vitest";
import {
  compileWorkflowIntent,
  acceptWorkflowCandidate,
  WorkflowCompilerError,
} from "../workflowBuilderCompiler";
import { NodeBindingDescriptorRegistry } from "../workflowNodeContracts";

function capabilityRegistry(
  authoringVisibility: "public" | "advanced" | "system-only" = "public",
  versions = ["1.0.0"]
) {
  const registry = new NodeBindingDescriptorRegistry();
  versions.forEach(version => registry.registerCapability({
    capabilityId: "document.parse",
    version,
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    effects: { mode: "fixed", mutation: "read", boundary: "internal" },
    protocolFamilies: ["native"],
    authoringVisibility,
  }));
  return registry;
}

describe("workflowBuilderCompiler", () => {
  it("returns bounded execution options and a deterministic candidate", () => {
    const result = compileWorkflowIntent({
      intent: "Summarize an uploaded document",
      options: [
        { id: "capability-document", typeId: "core.capability", binding: { kind: "capability", ref: "document.parse" }, ready: true, reasonCode: "READY" },
        { id: "model-summary", typeId: "ai.model", binding: { kind: "model", ref: "model.summary" }, ready: true, reasonCode: "READY" },
        { id: "browser", typeId: "automation.computer_use", binding: { kind: "computer-use-profile", ref: "browser.default" }, ready: false, reasonCode: "SETUP_REQUIRED" },
      ],
      bindingDescriptors: capabilityRegistry(),
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
      bindingDescriptors: capabilityRegistry(),
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

  it("fails closed when a capability has no trusted authorable descriptor", () => {
    const options = [{
      id: "client-picked-control-plane",
      typeId: "core.capability",
      binding: { kind: "capability" as const, ref: "document.parse" },
      ready: true,
      reasonCode: "CLIENT_SAYS_READY",
    }];
    expect(() => compileWorkflowIntent({ intent: "Extract this document", options }))
      .toThrow("Capability binding is unavailable or not authorable");
    expect(() => compileWorkflowIntent({
      intent: "Extract this document",
      options,
      bindingDescriptors: capabilityRegistry("system-only"),
    })).toThrow("Capability binding is unavailable or not authorable");
  });

  it("resolves exact, range, and latest-compatible capability descriptor versions", () => {
    const options = (versionPolicy: { mode: "exact" | "range" | "latest-compatible"; value?: string }) => [{
      id: "document-parser",
      typeId: "core.capability",
      binding: { kind: "capability" as const, ref: "document.parse", versionPolicy },
      reasonCode: "REGISTERED",
    }];
    const registry = capabilityRegistry("public", ["1.0.0", "1.2.0", "2.0.0"]);
    expect(() => compileWorkflowIntent({
      intent: "Extract this document",
      options: options({ mode: "exact", value: "1.2.0" }),
      bindingDescriptors: registry,
    })).not.toThrow();
    expect(() => compileWorkflowIntent({
      intent: "Extract this document",
      options: options({ mode: "range", value: "^1.0.0" }),
      bindingDescriptors: registry,
    })).not.toThrow();
    expect(() => compileWorkflowIntent({
      intent: "Extract this document",
      options: options({ mode: "latest-compatible" }),
      bindingDescriptors: registry,
    })).not.toThrow();
    expect(() => compileWorkflowIntent({
      intent: "Extract this document",
      options: options({ mode: "exact", value: "3.0.0" }),
      bindingDescriptors: registry,
    })).toThrow("Capability binding is unavailable or not authorable");
  });
});
