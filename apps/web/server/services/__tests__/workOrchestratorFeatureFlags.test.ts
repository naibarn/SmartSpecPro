import { afterEach, describe, expect, it } from "vitest";

import {
  getWorkOrchestratorFeatureFlags,
  WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES,
} from "../workOrchestratorFeatureFlags";

describe("workOrchestratorFeatureFlags", () => {
  afterEach(() => {
    for (const flagName of Object.values(WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES)) {
      delete process.env[flagName];
    }
  });

  it("uses safe defaults for privileged execution", async () => {
    const flags = await getWorkOrchestratorFeatureFlags();

    expect(flags.workflowSurfacePlanning).toBe(true);
    expect(flags.skillStudioPlanning).toBe(true);
    expect(flags.privilegedSurfaceAutoExecution).toBe(false);
    expect(flags.launchEnforcement).toBe(false);
  });

  it("reads boolean overrides from the environment", async () => {
    process.env[
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.privilegedSurfaceAutoExecution
    ] = "true";
    process.env[WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.launchEnforcement] = "1";

    const flags = await getWorkOrchestratorFeatureFlags();

    expect(flags.privilegedSurfaceAutoExecution).toBe(true);
    expect(flags.launchEnforcement).toBe(true);
  });
});
