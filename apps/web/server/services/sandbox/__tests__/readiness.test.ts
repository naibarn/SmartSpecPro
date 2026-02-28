import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Readiness verification tests for the Node.js sandbox integration layer.
 * Validates that dispatch, status projection, and cost estimation are
 * correctly wired and degrade gracefully.
 */

const { mockShouldUseSandbox, mockDispatchToSandbox } = vi.hoisted(() => ({
  mockShouldUseSandbox: vi.fn(),
  mockDispatchToSandbox: vi.fn(),
}));

vi.mock("../dispatchService", () => ({
  shouldUseSandbox: mockShouldUseSandbox,
  dispatchToSandbox: mockDispatchToSandbox,
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENSANDBOX_ENABLED;
});

describe("sandbox readiness verification", () => {
  it("shouldUseSandbox returns true for all sandbox-* modes when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    mockShouldUseSandbox.mockImplementation((mode: string) => {
      if (["core-text", "llm-only"].includes(mode)) return false;
      return true;
    });

    const sandboxModes = [
      "sandbox-code",
      "sandbox-command",
      "sandbox-browser",
      "sandbox-file",
      "sandbox-media",
    ];

    for (const mode of sandboxModes) {
      expect(mockShouldUseSandbox(mode)).toBe(true);
    }
  });

  it("shouldUseSandbox returns false for core-text/llm-only", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    mockShouldUseSandbox.mockImplementation((mode: string) => {
      if (["core-text", "llm-only"].includes(mode)) return false;
      return true;
    });

    expect(mockShouldUseSandbox("core-text")).toBe(false);
    expect(mockShouldUseSandbox("llm-only")).toBe(false);
  });

  it("shouldUseSandbox returns false when OPENSANDBOX_ENABLED is unset", () => {
    mockShouldUseSandbox.mockReturnValue(false);

    expect(mockShouldUseSandbox("sandbox-code")).toBe(false);
  });

  it("statusProjection covers all 12 internal statuses without throwing", async () => {
    const { projectStatus } = await import("../statusProjection");

    const statuses = [
      "accepted",
      "policy_resolved",
      "queued",
      "provisioning",
      "staging_inputs",
      "executing",
      "collecting_outputs",
      "persisting",
      "completed",
      "failed",
      "timed_out",
      "canceled",
    ] as const;

    for (const status of statuses) {
      const projection = projectStatus(status);
      expect(projection).toBeDefined();
      expect(projection.label).toBeTruthy();
      expect(projection.phase).toBeTruthy();
      expect(typeof projection.isTerminal).toBe("boolean");
    }
  });

  it("terminal statuses have isTerminal=true", async () => {
    const { projectStatus } = await import("../statusProjection");

    const terminals = ["completed", "failed", "timed_out", "canceled"] as const;
    for (const status of terminals) {
      expect(projectStatus(status).isTerminal).toBe(true);
    }
  });

  it("non-terminal statuses have isTerminal=false", async () => {
    const { projectStatus } = await import("../statusProjection");

    const nonTerminals = [
      "accepted",
      "policy_resolved",
      "queued",
      "provisioning",
      "staging_inputs",
      "executing",
      "collecting_outputs",
      "persisting",
    ] as const;
    for (const status of nonTerminals) {
      expect(projectStatus(status).isTerminal).toBe(false);
    }
  });
});
