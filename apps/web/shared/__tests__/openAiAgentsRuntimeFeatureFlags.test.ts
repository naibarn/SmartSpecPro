import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

const OPENAI_RUNTIME_FLAGS: (keyof TenantFeatureFlags)[] = [
  "openAiAgentsRuntimeEnabled",
  "openAiAgentsRuntimeChatShadow",
  "openAiAgentsRuntimeTeamShadow",
  "openAiAgentsRuntimeChatActive",
  "openAiAgentsRuntimeTeamActive",
  "openAiAgentsRuntimeResponsesShadow",
  "openAiAgentsRuntimeResponsesActive",
  "openAiAgentsRuntimeSkillShadow",
  "openAiAgentsRuntimeSkillActive",
  "openAiAgentsRuntimeForceRollback",
];

describe("OpenAI Agents runtime feature flags", () => {
  it("TenantFeatureFlags interface includes all 10 runtime flags", () => {
    const flags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS };

    for (const flag of OPENAI_RUNTIME_FLAGS) {
      expect(typeof flags[flag]).toBe("boolean");
    }
  });

  it("all 10 runtime flags default to false", () => {
    for (const flag of OPENAI_RUNTIME_FLAGS) {
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("all 10 runtime flags are present in ALLOWED_FEATURE_FLAGS", () => {
    for (const flag of OPENAI_RUNTIME_FLAGS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    }
  });

  it("allowlist does not accept a typo variant", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("openAiAgentRuntimeEnabled")).toBe(false);
  });
});

