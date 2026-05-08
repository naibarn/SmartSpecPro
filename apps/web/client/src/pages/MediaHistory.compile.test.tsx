import { describe, expect, it } from "vitest";
import MediaHistory, { buildFallbackApiUrl } from "./MediaHistory";

describe("MediaHistory module", () => {
  it("imports successfully", () => {
    expect(typeof MediaHistory).toBe("function");
  });

  it("builds Magnific fallback URLs from the Magnific base URL", () => {
    expect(
      buildFallbackApiUrl("magnific", "/v1/ai/text-to-image/nano-banana-pro")
    ).toBe("https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro");
  });

  it("does not fall back to Kie.ai for unknown explicit providers", () => {
    expect(buildFallbackApiUrl("unknown-provider", "/v1/jobs/status")).toBeUndefined();
  });
});
