import { describe, expect, it } from "vitest";
import {
  resolveComputerUseRoute,
  type ComputerUseCapabilitySnapshot,
} from "../computerUseCapabilityRouting";

const snapshot: ComputerUseCapabilitySnapshot = {
  structured: { ready: true, reasonCode: "WEBMCP_READY", costClass: "low" },
  semantic: { ready: true, reasonCode: "SEMANTIC_READY", costClass: "medium" },
  localRunner: { ready: true, reasonCode: "RUNNER_READY", costClass: "high" },
  visual: { ready: true, reasonCode: "VISUAL_READY", costClass: "high" },
};

describe("computerUseCapabilityRouting", () => {
  it("prefers structured then semantic then local/visual fallback", () => {
    expect(
      resolveComputerUseRoute({
        snapshot,
        policy: "allowed",
        required: "click",
      })
    ).toMatchObject({ route: "structured", reasonCode: "WEBMCP_READY" });
    expect(
      resolveComputerUseRoute({
        snapshot: {
          ...snapshot,
          structured: { ...snapshot.structured, ready: false },
        },
        policy: "allowed",
        required: "click",
      })
    ).toMatchObject({ route: "semantic" });
  });

  it("does not treat policy denial as fallback eligibility", () => {
    expect(
      resolveComputerUseRoute({
        snapshot,
        policy: "denied",
        required: "submit",
      })
    ).toMatchObject({ decision: "denied", reasonCode: "POLICY_DENIED" });
    expect(
      resolveComputerUseRoute({
        snapshot: {
          ...snapshot,
          structured: { ...snapshot.structured, ready: false },
          semantic: { ...snapshot.semantic, ready: false },
          localRunner: { ...snapshot.localRunner, ready: false },
        },
        policy: "allowed",
        required: "click",
      })
    ).toMatchObject({ route: "visual" });
  });
});
