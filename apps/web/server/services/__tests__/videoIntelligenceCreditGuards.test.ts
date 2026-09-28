/**
 * Feature 142 — section-08 §5.5. Pure unit tests, zero mocks: both builders
 * do no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  buildVideoIntelligenceIdempotencyKey,
  buildVideoIntelligenceCreditContext,
  CREDIT_TRACE_ID_MAX_LENGTH,
} from "../videoIntelligenceCreditGuards";

describe("buildVideoIntelligenceIdempotencyKey", () => {
  it("formats vi:<jobId>:<stage>", () => {
    expect(buildVideoIntelligenceIdempotencyKey("job-1", "scene_plan")).toBe("vi:job-1:scene_plan");
  });

  it("is stable for the same job and stage", () => {
    const a = buildVideoIntelligenceIdempotencyKey("job-1", "quality_review");
    const b = buildVideoIntelligenceIdempotencyKey("job-1", "quality_review");
    expect(a).toBe(b);
  });

  it("differs across stages of the same job", () => {
    const a = buildVideoIntelligenceIdempotencyKey("job-1", "quality_review");
    const b = buildVideoIntelligenceIdempotencyKey("job-1", "quality_repair");
    expect(a).not.toBe(b);
  });

  it("throws on a blank jobId instead of emitting a colliding key", () => {
    expect(() => buildVideoIntelligenceIdempotencyKey("", "scene_plan")).toThrow();
    expect(() => buildVideoIntelligenceIdempotencyKey("   ", "scene_plan")).toThrow();
  });

  it("throws on a blank stage instead of emitting a colliding key", () => {
    expect(() => buildVideoIntelligenceIdempotencyKey("job-1", "" as never)).toThrow();
  });
});

describe("buildVideoIntelligenceCreditContext", () => {
  it("never returns a traceId longer than 32 characters", () => {
    const longTraceId = "t".repeat(100);
    const result = buildVideoIntelligenceCreditContext({
      jobId: "job-1",
      stage: "scene_plan",
      traceId: longTraceId,
      projectId: 1,
      modelId: "model-a",
    });
    expect(result.traceId.length).toBeLessThanOrEqual(CREDIT_TRACE_ID_MAX_LENGTH);
    expect(result.traceId.length).toBeLessThanOrEqual(32);
  });

  it("keeps a short traceId byte-identical", () => {
    const result = buildVideoIntelligenceCreditContext({
      jobId: "job-1",
      stage: "scene_plan",
      traceId: "trace-short",
      projectId: 1,
      modelId: "model-a",
    });
    expect(result.traceId).toBe("trace-short");
  });

  it("puts jobId, projectId, stage and modelId in metadata, not in traceId", () => {
    const result = buildVideoIntelligenceCreditContext({
      jobId: "job-99",
      stage: "quality_repair",
      traceId: "trace-1",
      projectId: 42,
      modelId: "model-x",
    });
    expect(result.metadata).toMatchObject({
      jobId: "job-99",
      projectId: 42,
      stage: "quality_repair",
      modelId: "model-x",
    });
    expect(result.traceId).not.toContain("job-99");
    expect(result.traceId).not.toContain("model-x");
  });

  it("carries no prompt text and no credential-shaped value in metadata", () => {
    const result = buildVideoIntelligenceCreditContext({
      jobId: "job-1",
      stage: "quality_review",
      traceId: "trace-1",
      projectId: 1,
      modelId: "model-a",
    });
    const serialized = JSON.stringify(result.metadata);
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]/);
    expect(serialized).not.toMatch(/Bearer /);
    expect(Object.keys(result.metadata).sort()).toEqual(
      ["jobId", "modelId", "projectId", "stage"].sort(),
    );
  });

  it("includes the idempotencyKey built the same way as the standalone builder", () => {
    const result = buildVideoIntelligenceCreditContext({
      jobId: "job-5",
      stage: "scene_plan",
      traceId: "trace-1",
      projectId: 1,
      modelId: null,
    });
    expect(result.idempotencyKey).toBe(buildVideoIntelligenceIdempotencyKey("job-5", "scene_plan"));
  });
});
