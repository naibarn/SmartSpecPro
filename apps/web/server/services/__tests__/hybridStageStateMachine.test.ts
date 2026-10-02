import { describe, expect, it } from "vitest";

import {
  canTransitionHybridExecutionStatus,
  transitionHybridExecutionStatus,
} from "../hybridStageStateMachine";

describe("hybridStageStateMachine", () => {
  it("allows the neutral Hybrid execution lifecycle from preview to commit", () => {
    expect(transitionHybridExecutionStatus("draft_preview", "start")).toBe("ready_to_start");
    expect(transitionHybridExecutionStatus("ready_to_start", "start")).toBe("running_stage");
    expect(transitionHybridExecutionStatus("running_stage", "needs_approval")).toBe("awaiting_approval");
    expect(transitionHybridExecutionStatus("awaiting_approval", "approve")).toBe("committing");
    expect(transitionHybridExecutionStatus("committing", "complete")).toBe("completed");
  });

  it("allows repair and retry paths but rejects terminal mutation", () => {
    expect(transitionHybridExecutionStatus("awaiting_approval", "reject")).toBe("repairing");
    expect(transitionHybridExecutionStatus("repairing", "retry")).toBe("running_stage");
    expect(canTransitionHybridExecutionStatus("completed", "retry")).toBe(false);
    expect(() => transitionHybridExecutionStatus("completed", "cancel")).toThrow(/Invalid Hybrid state transition/);
  });
});
