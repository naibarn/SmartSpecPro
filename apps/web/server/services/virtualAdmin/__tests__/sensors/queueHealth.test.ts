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
      queues: [
        { name: "worker_jobs", length: 2, status: "ok" },
      ],
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.status).toBe("healthy");
    expect(reading.sensorId).toBe("queue_health");
  });

  it("returns degraded when queue has warnings", async () => {
    const { getQueueHealthStatus } = await import("../../../../services/queueHealthMonitor");
    (getQueueHealthStatus as any).mockResolvedValue({
      activeAlerts: [{ severity: "warning", queue: "worker_jobs" }],
      queues: [{ name: "worker_jobs", length: 150, status: "warning" }],
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.status).toBe("degraded");
  });

  it("returns critical when queue has critical alerts", async () => {
    const { getQueueHealthStatus } = await import("../../../../services/queueHealthMonitor");
    (getQueueHealthStatus as any).mockResolvedValue({
      activeAlerts: [{ severity: "critical", queue: "worker_jobs" }],
      queues: [{ name: "worker_jobs", length: 1000, status: "critical" }],
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.status).toBe("critical");
  });

  it("includes queue name and depth in metrics", async () => {
    const { getQueueHealthStatus } = await import("../../../../services/queueHealthMonitor");
    (getQueueHealthStatus as any).mockResolvedValue({
      activeAlerts: [],
      queues: [{ name: "worker_jobs", length: 5, status: "ok" }],
    });

    const reading = await queueHealthSensor.collect();
    expect(reading.metrics).toHaveProperty("queue_worker_jobs_depth", 5);
  });
});
