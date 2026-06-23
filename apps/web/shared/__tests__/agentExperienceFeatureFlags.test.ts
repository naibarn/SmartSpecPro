import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

const AGENT_EXPERIENCE_FLAGS: (keyof TenantFeatureFlags)[] = [
  "agentExperienceLayer",
  "agentExperienceShadowMode",
  "agentExperienceAgencyPreview",
  "agentExperienceTeamPreview",
  "agentExperienceChatPreview",
  "agentExperienceRuntypeRenderer",
  "agentExperienceDebugInspector",
  "agentExperienceForceRollback",
  "agentExperienceWebsiteWidget",
  "agentExperiencePageActions",
];

describe("Agent Experience tenant feature flags", () => {
  it("declares all Agent Experience tenant flags", () => {
    const flags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS };

    for (const flag of AGENT_EXPERIENCE_FLAGS) {
      expect(typeof flags[flag]).toBe("boolean");
    }
  });

  it("defaults all Agent Experience flags off", () => {
    for (const flag of AGENT_EXPERIENCE_FLAGS) {
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("allows only exact Agent Experience flag keys", () => {
    for (const flag of AGENT_EXPERIENCE_FLAGS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    }

    expect(ALLOWED_FEATURE_FLAGS.has("agentExperience")).toBe(false);
    expect(ALLOWED_FEATURE_FLAGS.has("agentPersonaUi")).toBe(false);
  });

  it("keeps the checked-in JavaScript feature flag artifact in sync", async () => {
    const runtimeFlags = await import("../featureFlags.js");

    expect(runtimeFlags.ALLOWED_FEATURE_FLAGS.has("agentExperienceLayer")).toBe(true);
    expect(runtimeFlags.FEATURE_FLAG_DEFAULTS.agentExperienceLayer).toBe(false);
  });
});
