import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

vi.mock("node:fs");

import errorSpikeSensor from "../../sensors/errorSpike";

describe("ErrorSpikeSensor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy when error rate below baseline", () => {
    const now = Date.now();
    const lines = Array.from({ length: 10 }, (_, i) => {
      const ts = new Date(now - i * 60_000).toISOString();
      return JSON.stringify({ timestamp: ts, eventType: "llm_response" });
    }).join("\n");

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(lines);

    return errorSpikeSensor.collect().then((reading) => {
      expect(reading.status).toBe("healthy");
      expect(reading.metrics).toHaveProperty("errorsLast5Min", 0);
    });
  });

  it("returns degraded when error rate > 3x baseline", () => {
    const now = Date.now();
    // Create baseline: 2 errors per hour = ~0.33 per 5-min window
    // Then spike: 3 errors in last 5 min (>3x baseline of 0.33)
    const lines: string[] = [];
    // Old errors (20-60 min ago)
    for (let i = 0; i < 2; i++) {
      lines.push(JSON.stringify({
        timestamp: new Date(now - 30 * 60_000 - i * 10_000).toISOString(),
        eventType: "error",
      }));
    }
    // Recent errors (last 5 min)
    for (let i = 0; i < 5; i++) {
      lines.push(JSON.stringify({
        timestamp: new Date(now - i * 30_000).toISOString(),
        eventType: "error",
      }));
    }

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(lines.join("\n"));

    return errorSpikeSensor.collect().then((reading) => {
      expect(["degraded", "critical"]).toContain(reading.status);
    });
  });

  it("handles missing audit log file gracefully", () => {
    (fs.existsSync as any).mockReturnValue(false);

    return errorSpikeSensor.collect().then((reading) => {
      expect(reading.status).toBe("healthy");
      expect(reading.message).toContain("No audit log");
    });
  });

  it("counts only last 5 minutes of errors", () => {
    const now = Date.now();
    const lines = [
      // Old error (2 hours ago) - should not count
      JSON.stringify({
        timestamp: new Date(now - 2 * 60 * 60_000).toISOString(),
        eventType: "error",
      }),
      // Recent non-error
      JSON.stringify({
        timestamp: new Date(now - 1_000).toISOString(),
        eventType: "llm_response",
      }),
    ].join("\n");

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(lines);

    return errorSpikeSensor.collect().then((reading) => {
      expect(reading.status).toBe("healthy");
      expect(reading.metrics).toHaveProperty("errorsLast5Min", 0);
    });
  });
});
