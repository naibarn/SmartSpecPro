import { describe, expect, it, vi } from "vitest";

const mockIsTenantFeatureEnabled = vi.hoisted(() => vi.fn());

vi.mock("../tenantFeatureFlagService", async importOriginal => ({
  ...(await importOriginal<typeof import("../tenantFeatureFlagService")>()),
  isTenantFeatureEnabled: mockIsTenantFeatureEnabled,
}));

import { resolveVerticalDramaEpisodeShotContract } from "../../../shared/verticalDramaSeries/specialTieInContracts";
import {
  assertSpecialTieInEnabled,
  specialEpisodeScope,
  specialEpisodeIdempotencyKey,
  specialEpisodeRetryIdempotencyKey,
  SPECIAL_TIE_IN_FEATURE_FLAG,
} from "../verticalDramaSpecialEpisodes";

describe("special episode job boundary", () => {
  it("uses the tenant database flag for the defensive service check", async () => {
    mockIsTenantFeatureEnabled.mockResolvedValue(true);

    await expect(assertSpecialTieInEnabled("tenant-special")).resolves.toBeUndefined();
    expect(mockIsTenantFeatureEnabled).toHaveBeenCalledWith(
      "tenant-special",
      SPECIAL_TIE_IN_FEATURE_FLAG,
    );
  });

  it("rejects an explicitly disabled tenant", async () => {
    mockIsTenantFeatureEnabled.mockResolvedValue(false);

    await expect(assertSpecialTieInEnabled("tenant-special")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Special tie-in episodes are not enabled",
    });
  });

  it("uses an episode-specific owner scope and stable idempotency key", () => {
    expect(specialEpisodeScope(53, 101)).toBe("series:53:episode:101:special");
    expect(specialEpisodeIdempotencyKey("intent_1234")).toBe("special:intent_1234:v1");
  });

  it("uses a fresh idempotency key for each explicit retry attempt", () => {
    expect(specialEpisodeRetryIdempotencyKey("intent_1234", 1, 2)).toBe(
      "special:intent_1234:v1:retry:2"
    );
    expect(specialEpisodeRetryIdempotencyKey("intent_1234", 1, 3)).not.toBe(
      specialEpisodeRetryIdempotencyKey("intent_1234", 1, 2)
    );
  });
  it("keeps variable special shots separate from normal nine-shot shape", () => {
    expect(resolveVerticalDramaEpisodeShotContract("special_tie_in", 2).fixedNormalShape).toBe(false);
    expect(resolveVerticalDramaEpisodeShotContract("normal").shotCount).toBe(9);
  });
});
