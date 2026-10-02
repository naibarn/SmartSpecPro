import { describe, expect, it } from "vitest";
import { canTransitionStoredEmergencyNeed, canTransitionStoredEmergencyTask } from "./contracts";

describe("stored Spec 260 workflow transitions", () => {
  it("allows partial fulfillment and requires an explicit verification step", () => {
    expect(canTransitionStoredEmergencyNeed("verified", "partially_fulfilled")).toBe(true);
    expect(canTransitionStoredEmergencyNeed("partially_fulfilled", "verified_fulfilled")).toBe(true);
    expect(canTransitionStoredEmergencyNeed("reported", "verified_fulfilled")).toBe(false);
    expect(canTransitionStoredEmergencyNeed("cancelled", "verified")).toBe(false);
  });

  it("does not reopen an offered task while an assignment is still active", () => {
    expect(canTransitionStoredEmergencyTask("ready", "offered")).toBe(true);
    expect(canTransitionStoredEmergencyTask("offered", "ready")).toBe(true);
    expect(canTransitionStoredEmergencyTask("claimed", "ready")).toBe(true);
    expect(canTransitionStoredEmergencyTask("in_progress", "blocked")).toBe(true);
    expect(canTransitionStoredEmergencyTask("blocked", "ready")).toBe(true);
    expect(canTransitionStoredEmergencyTask("offered", "claimed")).toBe(true);
    expect(canTransitionStoredEmergencyTask("in_progress", "completed")).toBe(true);
    expect(canTransitionStoredEmergencyTask("completed", "in_progress")).toBe(false);
  });
});
