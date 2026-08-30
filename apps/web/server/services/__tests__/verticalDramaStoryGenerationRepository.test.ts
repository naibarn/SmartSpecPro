import { describe, expect, it } from "vitest";
import { createStoryGenerationRun, getStoryGenerationRun } from "../verticalDramaStoryGenerationRepository";

describe("vertical drama story generation repository contract", () => {
  it("exposes tenant-scoped durable repository operations", () => {
    expect(typeof createStoryGenerationRun).toBe("function");
    expect(typeof getStoryGenerationRun).toBe("function");
  });
});
