import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("./feature186SystemScheduler", () => ({
  startFeature186SystemSchedule: (...args: unknown[]) => state.start(...args),
  stopFeature186SystemSchedule: (...args: unknown[]) => state.stop(...args),
  utcMinuteOccurrence: vi.fn((_now: Date, interval: number) => `bucket:${interval}`),
}));

import {
  initializeInferenceSettlementRecoveryJob,
  shutdownInferenceSettlementRecoveryJob,
} from "./inferenceSettlementRecoveryJob";

describe("Spec 231 settlement recovery schedule", () => {
  beforeEach(() => {
    state.start.mockReset();
    state.stop.mockReset();
  });

  it("uses the canonical system scheduler for a bounded five-minute sweep", async () => {
    await initializeInferenceSettlementRecoveryJob();
    const [definition] = state.start.mock.calls[0] as any[];
    expect(definition).toMatchObject({
      scheduleId: "spec231-inference-settlement-recovery",
      jobType: "llm.inference_settlement_sweep",
      executionClass: "short",
      scheduleVersion: "1",
      missedOccurrencePolicy: "coalesce",
      intervalMs: 60_000,
    });
    expect(definition.isDue(new Date("2026-09-27T12:10:00.000Z"))).toBe(true);
    expect(definition.isDue(new Date("2026-09-27T12:11:00.000Z"))).toBe(false);
    expect(definition.occurrenceKey(new Date())).toBe("bucket:5");
  });

  it("stops the same canonical system schedule during shutdown", () => {
    shutdownInferenceSettlementRecoveryJob();
    expect(state.stop).toHaveBeenCalledWith("spec231-inference-settlement-recovery");
  });
});
