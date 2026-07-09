import { describe, expect, it } from "vitest";

import { resolveVoiceChainFlagEnabled } from "../VerticalDramaEpisodePage";

/**
 * Debt-item-1 (2026-07-08) coverage: `getEpisodeDetail`'s new
 * `flags.voiceChain` field should be preferred over the direct
 * `useTenantFeatureFlag("verticalDramaSeriesVoiceChain")` read, with the
 * tenant-flag hook kept only as a fallback for the render(s) before
 * `episodeDetailQuery` has resolved. Mirrors
 * `VerticalDramaEpisodePage.audioLine.test.ts`'s convention of unit-testing
 * the extracted pure helper directly.
 */
describe("resolveVoiceChainFlagEnabled", () => {
  it("prefers the server flag when it is true, even if the tenant-flag fallback is false", () => {
    expect(resolveVoiceChainFlagEnabled(true, false)).toBe(true);
  });

  it("prefers the server flag when it is false, even if the tenant-flag fallback is true", () => {
    expect(resolveVoiceChainFlagEnabled(false, true)).toBe(false);
  });

  it("falls back to the tenant flag while the server flag has not loaded yet (undefined)", () => {
    expect(resolveVoiceChainFlagEnabled(undefined, true)).toBe(true);
    expect(resolveVoiceChainFlagEnabled(undefined, false)).toBe(false);
  });
});
