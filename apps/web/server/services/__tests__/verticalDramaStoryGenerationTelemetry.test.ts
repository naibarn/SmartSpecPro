import { describe, expect, it } from "vitest";
import { buildStoryGenerationTelemetryEvent } from "../verticalDramaStoryGenerationTelemetry";

describe("vertical drama story generation telemetry", () => {
  it("redacts story payload and prompt keys while preserving bounded metrics", () => {
    const event = buildStoryGenerationTelemetryEvent({
      eventName: "validation.completed", tenantId: "tenant-1", runId: "run-1",
      status: "validating", stage: "validation", contractHash: "a".repeat(64), eventCursor: 3,
      metadata: { episodeCount: 4, prompt: "secret story", sourcePayload: { title: "private" } },
    });
    expect(event.metadata).toEqual({ episodeCount: 4 });
  });
});
