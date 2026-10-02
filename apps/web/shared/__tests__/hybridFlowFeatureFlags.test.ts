import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

const HYBRID_FLOW_FLAGS: (keyof TenantFeatureFlags)[] = [
  "hybridFlowEnabled",
  "hybridFlowChatEntryEnabled",
  "hybridFlowOpenAiAgentsRuntimeEnabled",
  "hybridFlowOpenAiAgentsRuntimeShadow",
  "hybridFlowNeutralWorkspaceEnabled",
  "hybridFlowAgencyLegacyFallbackEnabled",
  "hybridFlowCommitStageEnabled",
];

describe("Hybrid Flow feature flags", () => {
  it("registers every Hybrid Flow flag and defaults fail-closed", () => {
    for (const flag of HYBRID_FLOW_FLAGS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("does not accept dotted flag typos from the product spec naming", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("hybridFlow.enabled")).toBe(false);
    expect(ALLOWED_FEATURE_FLAGS.has("hybridFlow.openAiAgentsRuntimeEnabled")).toBe(false);
  });
});
