import { describe, it, expect } from "vitest";
import { projectStatus, type SandboxInternalStatus } from "../statusProjection";

describe("projectStatus", () => {
  it("maps accepted to Queued", () => {
    expect(projectStatus("accepted")).toEqual({
      label: "Queued",
      phase: "pending",
      isTerminal: false,
    });
  });

  it("maps policy_resolved to Queued", () => {
    expect(projectStatus("policy_resolved").label).toBe("Queued");
  });

  it("maps queued to Queued", () => {
    expect(projectStatus("queued").label).toBe("Queued");
  });

  it("maps provisioning to Preparing secure workspace", () => {
    expect(projectStatus("provisioning").label).toBe("Preparing secure workspace");
  });

  it("maps staging_inputs to Preparing secure workspace", () => {
    expect(projectStatus("staging_inputs").label).toBe("Preparing secure workspace");
  });

  it("maps executing to Running securely", () => {
    const result = projectStatus("executing");
    expect(result.label).toBe("Running securely");
    expect(result.phase).toBe("active");
  });

  it("maps collecting_outputs to Collecting results", () => {
    expect(projectStatus("collecting_outputs").label).toBe("Collecting results");
  });

  it("maps persisting to Collecting results", () => {
    expect(projectStatus("persisting").label).toBe("Collecting results");
  });

  it("maps completed to Completed with isTerminal true", () => {
    const result = projectStatus("completed");
    expect(result.label).toBe("Completed");
    expect(result.isTerminal).toBe(true);
  });

  it("maps failed to Failed with isTerminal true", () => {
    const result = projectStatus("failed");
    expect(result.label).toBe("Failed");
    expect(result.isTerminal).toBe(true);
  });

  it("maps timed_out to Timed out with isTerminal true", () => {
    const result = projectStatus("timed_out");
    expect(result.label).toBe("Timed out");
    expect(result.isTerminal).toBe(true);
  });

  it("maps canceled to Canceled with isTerminal true", () => {
    const result = projectStatus("canceled");
    expect(result.label).toBe("Canceled");
    expect(result.isTerminal).toBe(true);
  });

  it("handles unknown state gracefully", () => {
    const result = projectStatus("nonexistent_state" as SandboxInternalStatus);
    expect(result.label).toBe("Unknown");
    expect(result.isTerminal).toBe(false);
  });
});
