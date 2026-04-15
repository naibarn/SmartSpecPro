/**
 * @vitest-environment node
 */

import { describe, test, expect } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

describe("Agentic feature flags", () => {
  test("ALLOWED_FEATURE_FLAGS includes all 4 agentic flags", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("agencyAgenticModeEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("agencyReactExecutorEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("agencyAutonomousAgentEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("agencyLongTermMemoryEnabled")).toBe(true);
  });

  test("FEATURE_FLAG_DEFAULTS has correct defaults for agentic flags", () => {
    expect(FEATURE_FLAG_DEFAULTS.agencyAgenticModeEnabled).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.agencyReactExecutorEnabled).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.agencyAutonomousAgentEnabled).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.agencyLongTermMemoryEnabled).toBe(true);
  });

  test("TenantFeatureFlags interface accepts all 4 new flags", () => {
    const flags: TenantFeatureFlags = {
      ...FEATURE_FLAG_DEFAULTS,
      agencyAgenticModeEnabled: true,
      agencyReactExecutorEnabled: false,
      agencyAutonomousAgentEnabled: false,
      agencyLongTermMemoryEnabled: false,
    };
    expect(flags).toBeDefined();
  });
});
