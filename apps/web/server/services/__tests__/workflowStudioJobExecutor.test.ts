import { describe, expect, it } from "vitest";

import {
  assertWorkflowStepCapability,
  resolveWorkflowStepOutput,
} from "../workflowStudioJobExecutor";

describe("workflow studio canonical executor", () => {
  it("allows built-in deterministic steps and explicit passthrough configuration", () => {
    expect(
      assertWorkflowStepCapability({ capability: "input", config: {} })
    ).toBe(true);
    expect(
      assertWorkflowStepCapability({
        capability: "media",
        config: { executionMode: "passthrough" },
      })
    ).toBe(true);
    expect(
      resolveWorkflowStepOutput({
        nodeId: "input",
        input: { value: "hello" },
        capability: "input",
        config: {},
      })
    ).toMatchObject({ value: "hello" });
  });

  it("fails closed when a provider-backed capability has no registered adapter", () => {
    expect(() =>
      assertWorkflowStepCapability({ capability: "media", config: {} })
    ).toThrow("WORKFLOW_CAPABILITY_ADAPTER_REQUIRED");
  });
});
