import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS,
  areVerticalDramaVisualConsistencyFlagsRegistered,
  resolveVerticalDramaVisualConsistencyFlags,
  type TenantFeatureFlags,
} from "../featureFlags";

describe("Vertical Drama visual-consistency feature flags", () => {
  it("registers the five frozen rollout keys", () => {
    expect(VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS).toEqual([
      "verticalDramaSeriesLookLock",
      "verticalDramaMotionContracts",
      "verticalDramaSceneContinuity",
      "verticalDramaSceneContinuityQc",
      "verticalDramaSceneNeighborAnchors",
    ]);
  });

  it("allowlists, types, and enables every completed consistency flag by default", () => {
    for (const key of VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS) {
      const typedKey: keyof TenantFeatureFlags = key;
      expect(typedKey).toBe(key);
      expect(ALLOWED_FEATURE_FLAGS.has(key)).toBe(true);
      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(true);
    }
    expect(areVerticalDramaVisualConsistencyFlagsRegistered()).toBe(true);
  });

  it("keeps the four switches independent", () => {
    for (const enabledKey of VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS) {
      const flags = {
        ...FEATURE_FLAG_DEFAULTS,
        ...Object.fromEntries(
          VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS.map(key => [key, false]),
        ),
        [enabledKey]: true,
      };
      for (const key of VERTICAL_DRAMA_VISUAL_CONSISTENCY_FLAG_KEYS) {
        expect(flags[key]).toBe(key === enabledKey);
      }
    }
  });

  it("AND-gates neighbor anchoring behind scene continuity", () => {
    expect(
      resolveVerticalDramaVisualConsistencyFlags({
        verticalDramaSceneNeighborAnchors: true,
        verticalDramaSceneContinuity: false,
      }),
    ).toMatchObject({
      sceneContinuity: false,
      sceneContinuityQc: false,
      sceneNeighborAnchors: false,
      neighborConfigurationInvalid: true,
    });

    expect(
      resolveVerticalDramaVisualConsistencyFlags({
        verticalDramaSceneNeighborAnchors: true,
        verticalDramaSceneContinuity: true,
      }),
    ).toMatchObject({
      sceneContinuity: true,
      sceneContinuityQc: false,
      sceneNeighborAnchors: true,
      neighborConfigurationInvalid: false,
    });
  });

  it("resolves omitted flags to fully off", () => {
    expect(resolveVerticalDramaVisualConsistencyFlags(undefined)).toEqual({
      seriesLookLock: false,
      motionContracts: false,
      sceneContinuity: false,
      sceneContinuityQc: false,
      sceneNeighborAnchors: false,
      neighborConfigurationInvalid: false,
    });
  });
});
