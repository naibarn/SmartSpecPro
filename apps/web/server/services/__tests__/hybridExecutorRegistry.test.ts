import { describe, expect, it } from "vitest";

import { HYBRID_EXECUTOR_REGISTRY_VERSION } from "@shared/orchestration/hybridOrchestration";
import {
  assertHybridExecutorDefinition,
  getHybridExecutorDefinition,
  listHybridExecutorDefinitions,
} from "../hybridExecutorRegistry";

describe("hybridExecutorRegistry", () => {
  it("registers read-only SDK stages and approval-gated mutating commit", () => {
    const definitions = listHybridExecutorDefinitions();

    expect(definitions.every((definition) => definition.registryVersion === HYBRID_EXECUTOR_REGISTRY_VERSION)).toBe(true);
    expect(getHybridExecutorDefinition({ stageType: "explore", owner: "swarm" })?.executorId).toBe("sdk:explore");
    expect(getHybridExecutorDefinition({ stageType: "commit", owner: "executor" })?.requiresApproval).toBe(true);
    expect(getHybridExecutorDefinition({ stageType: "commit", owner: "executor" })?.sideEffectClass).toBe("mutating");
  });

  it("fails closed for an unregistered owner/type pair", () => {
    expect(() => assertHybridExecutorDefinition({ stageType: "commit", owner: "sdk" })).toThrow(
      "hybrid_executor_not_registered:sdk:commit"
    );
  });
});
