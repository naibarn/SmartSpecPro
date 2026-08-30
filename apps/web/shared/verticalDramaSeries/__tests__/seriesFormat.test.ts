import { describe, expect, it } from "vitest";
import { createSeriesFormatConfig, renderSeriesFormatPromptBlock, resolveSeriesFormatConfig } from "../seriesFormat";

describe("series format contracts", () => {
  it("creates a factual software review format with an evidence engine", () => {
    const config = createSeriesFormatConfig("software_review");
    expect(config.factPolicy).toBe("required_sources");
    expect(config.episodeEngine).toContain("direct_observation_or_demo");
    expect(renderSeriesFormatPromptBlock(config)).toContain("Never invent");
  });

  it("falls back safely for legacy or malformed bible data", () => {
    expect(resolveSeriesFormatConfig(null).kind).toBe("fiction_drama");
  });
});
