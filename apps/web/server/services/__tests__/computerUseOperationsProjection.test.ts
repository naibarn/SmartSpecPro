import { describe, expect, it } from "vitest";
import { buildComputerUseOperationsProjection } from "../computerUseOperationsProjection";

describe("computerUseOperationsProjection", () => {
  it("returns mockup-aligned inspector/drawer data states", () => {
    expect(
      buildComputerUseOperationsProjection({
        route: "semantic",
        readiness: "ready",
        preview: "approved",
        session: "running",
        verification: "pending",
        blocker: null,
      })
    ).toMatchObject({
      surface: "inspector_and_run_drawer",
      status: "running",
      nextAction: "wait_for_verification",
    });
    expect(
      buildComputerUseOperationsProjection({
        route: null,
        readiness: "denied",
        preview: "none",
        session: "idle",
        verification: "none",
        blocker: "POLICY_DENIED",
      })
    ).toMatchObject({ status: "blocked", nextAction: "show_reason" });
  });
});
