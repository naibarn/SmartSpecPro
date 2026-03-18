import { describe, it, expect } from "vitest";
import { STUCK_THRESHOLD_MS, SNAPSHOT_INTERVAL_MS } from "../monitoringService";

describe("monitoringService", () => {
  describe("constants", () => {
    it("STUCK_THRESHOLD_MS is 2 minutes", () => {
      expect(STUCK_THRESHOLD_MS).toBe(120_000);
    });

    it("SNAPSHOT_INTERVAL_MS is 15 seconds", () => {
      expect(SNAPSHOT_INTERVAL_MS).toBe(15_000);
    });
  });
});
