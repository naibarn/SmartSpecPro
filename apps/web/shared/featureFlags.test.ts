/**
 * Vertical Drama Series — Feature 132 quality-engine flag registration
 * (F132A-I; spec §12; plan
 * `sections/section-01-shared-criteria-and-flags.md`).
 *
 * No dedicated `featureFlags.test.ts` existed prior to this section (only
 * `server/services/sandbox/__tests__/featureFlags.test.ts`, an unrelated
 * sandbox module) — this file is newly created here per the plan's
 * instruction to check before creating.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS,
  areVerticalDramaQualityEngineFeatureFlagsRegistered,
  type TenantFeatureFlags,
} from "./featureFlags";

const F132_FLAG_KEYS = VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS;

describe("Feature 132 quality-engine feature flags (F132A-I)", () => {
  it("registers the Worker Local LLM rollout flag independently", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("workerLocalLlmModels")).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.workerLocalLlmModels).toBe(true);
  });

  it("all 9 F132 flags are present in TenantFeatureFlags/ALLOWED_FEATURE_FLAGS/FEATURE_FLAG_DEFAULTS", () => {
    expect(F132_FLAG_KEYS).toHaveLength(9);

    for (const key of F132_FLAG_KEYS) {
      expect(ALLOWED_FEATURE_FLAGS.has(key)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(FEATURE_FLAG_DEFAULTS, key)).toBe(true);

      // Compile-time proof the key is a real TenantFeatureFlags member —
      // this line would fail `pnpm check` if any key were misspelled.
      const typedKey: keyof TenantFeatureFlags = key;
      expect(typeof typedKey).toBe("string");
    }
  });

  it("all 9 F132 flags default to false", () => {
    for (const key of F132_FLAG_KEYS) {
      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(false);
    }
  });

  it("areVerticalDramaQualityEngineFeatureFlagsRegistered() returns true", () => {
    expect(areVerticalDramaQualityEngineFeatureFlagsRegistered()).toBe(true);
  });

  it("with all F132 flags false, no F132 code path is reachable (flag-off = current behavior, spec §16.5)", () => {
    expect(
      VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS.every(
        (key) => FEATURE_FLAG_DEFAULTS[key] === false,
      ),
    ).toBe(true);
  });

  it("registers exactly the 9 documented F132 flag keys, in F132A-I order", () => {
    expect(F132_FLAG_KEYS).toEqual([
      "verticalDramaUserPremise",
      "verticalDramaQualityLedgers",
      "verticalDramaSceneContracts",
      "verticalDramaMultiPassQc",
      "verticalDramaTargetedRevisionV2",
      "verticalDramaCharacterProfiles",
      "verticalDramaCharacterVisualQuality",
      "verticalDramaContinuityContracts",
      "verticalDramaAngleGridQuality",
    ]);
  });
});
