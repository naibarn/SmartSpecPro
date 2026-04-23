import { afterEach, describe, expect, it } from "vitest";

import {
  getRuntimePerformanceSnapshot,
  measureLocalRuntimeCall,
  recordLocalRuntimeMeasurement,
  resetRuntimePerformanceProfilerForTests,
} from "./runtimePerformanceProfiler";

describe("runtimePerformanceProfiler", () => {
  afterEach(() => {
    resetRuntimePerformanceProfilerForTests();
  });

  it("aggregates local runtime measurements per operation", () => {
    recordLocalRuntimeMeasurement({
      operation: "local_llm_generate",
      durationMs: 120,
      success: true,
      updatedAt: "2026-04-20T00:00:00.000Z",
    });
    recordLocalRuntimeMeasurement({
      operation: "local_llm_generate",
      durationMs: 180,
      success: false,
      updatedAt: "2026-04-20T00:00:01.000Z",
    });
    recordLocalRuntimeMeasurement({
      operation: "local_skill_execute",
      durationMs: 240,
      success: true,
      updatedAt: "2026-04-20T00:00:02.000Z",
    });

    const snapshot = getRuntimePerformanceSnapshot();
    expect(snapshot.localRuntime.sampleCount).toBe(3);
    expect(snapshot.localRuntime.operations).toHaveLength(2);

    const llmGenerate = snapshot.localRuntime.operations.find(
      (operation) => operation.operation === "local_llm_generate",
    );
    expect(llmGenerate).toMatchObject({
      count: 2,
      successCount: 1,
      errorCount: 1,
      averageDurationMs: 150,
      p95DurationMs: 180,
      lastDurationMs: 180,
      lastStatus: "error",
    });
  });

  it("marks resolved failed results when the payload reports success=false", async () => {
    await measureLocalRuntimeCall("local_skill_execute", async () => ({
      success: false,
      error: "runner_failed",
    }));

    const operation = getRuntimePerformanceSnapshot().localRuntime.operations[0];
    expect(operation).toMatchObject({
      operation: "local_skill_execute",
      count: 1,
      successCount: 0,
      errorCount: 1,
      lastStatus: "error",
    });
  });
});
