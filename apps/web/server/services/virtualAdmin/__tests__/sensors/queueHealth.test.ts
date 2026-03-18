import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../services/queueHealthMonitor", () => ({
  getQueueHealthStatus: vi.fn(),
}));

import queueHealthSensor from "../../sensors/queueHealth";

describe("QueueHealthSensor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy when all queues below threshold", async () => {
    const { getQueueHealthStatus } = await import("../../../../services/queueHealthMonitor");
    (getQueueHealthStatus as any).mockResolvedValue({
      activeAlerts: [],
      queues: { media: { waiting: 2 }, default: { waiting: 0 } },
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.status).toBe("healthy");
    expect(reading.sensorId).toBe("queue_health");
  });

  it("returns degraded when queue has warnings", async () => {
    const { getQueueHealthStatus } = await import("../../../../services/queueHealthMonitor");
    (getQueueHealthStatus as any).mockResolvedValue({
      activeAlerts: [{ severity: "warning", queue: "media" }],
      queues: { media: { waiting: 150 } },
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.status).toBe("degraded");
  });

  it("returns critical when queue has critical alerts", async () => {
    const { getQueueHealthStatus } = await import("../../../../services/queueHealthMonitor");
    (getQueueHealthStatus as any).mockResolvedValue({
      activeAlerts: [{ severity: "critical", queue: "media" }],
      queues: { media: { waiting: 1000 } },
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.status).toBe("critical");
  });

  it("includes queue name and depth in metrics", async () => {
    const { getQueueHealthStatus } = await import("../../../../services/queueHealthMonitor");
    (getQueueHealthStatus as any).mockResolvedValue({
      activeAlerts: [],
      queues: { media: { waiting: 5 }, default: { waiting: 10 } },
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.metrics).toHaveProperty("queue_media_depth", 5);
    expect(reading.metrics).toHaveProperty("queue_default_depth", 10);
  });
});
